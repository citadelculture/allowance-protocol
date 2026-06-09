// Allow Protocol — client-side x402 allowance wrapper.
//
// This is the piece an agent developer installs. It wraps `fetch` so that when
// a server answers an agent's request with HTTP 402 (the x402 payment-required
// standard), the allowance policy is checked *before* any payment is made:
//
//   1. Issue the request normally.
//   2. If the response is 402, parse the x402 payment requirements.
//   3. Map them into an Allow payment intent and run the real policy engine.
//   4. If the decision is not "allow", throw — the agent never pays.
//   5. If allowed, call the developer-supplied `pay()` to build the X-PAYMENT
//      header, retry the request, and record a replay-protected receipt.
//
// No funds are ever custodied here. The wrapper only authorizes and records;
// the actual signing/settlement is the caller's `pay()` function.

import { DEFAULT_POLICY, evaluatePaymentIntent } from "./policyEngine.mjs";

export const PAYMENT_HEADER = "x-payment";
export const PAYMENT_RESPONSE_HEADER = "x-payment-response";

export class AllowancePaymentBlockedError extends Error {
  constructor(evaluation, requirements) {
    const reason = evaluation?.reasons?.[0] || "Payment blocked by allowance policy";
    super(reason);
    this.name = "AllowancePaymentBlockedError";
    this.code = "ALLOW_PAYMENT_BLOCKED";
    this.decision = evaluation?.decision || "deny";
    this.riskScore = evaluation?.riskScore;
    this.reasons = evaluation?.reasons || [reason];
    this.evaluation = evaluation;
    this.requirements = requirements;
  }
}

// Pull the x402 challenge out of a 402 response body. The standard shape is
// `{ x402Version, accepts: [paymentRequirements...] }`; we also accept a bare
// requirements object or array for resilience against early implementations.
export function parseX402Challenge(body) {
  if (!body || typeof body !== "object") return null;
  if (Array.isArray(body.accepts) && body.accepts.length > 0) {
    return { x402Version: Number(body.x402Version || 1), accepts: body.accepts };
  }
  if (Array.isArray(body) && body.length > 0) {
    return { x402Version: 1, accepts: body };
  }
  if (body.payTo && (body.asset || body.maxAmountRequired || body.amount)) {
    return { x402Version: Number(body.x402Version || 1), accepts: [body] };
  }
  return null;
}

const KNOWN_NETWORKS = new Set(["base", "base-sepolia"]);

// Choose which payment option to satisfy. A caller can pass
// `selectRequirements` to prefer a network/asset/scheme; by default we prefer
// an exact-scheme option on a network we know how to pay (the server controls
// the ordering of `accepts`, so "first entry" is not a safe default), then
// fall back to the first entry.
export function selectPaymentRequirements(accepts, select) {
  if (typeof select === "function") {
    const chosen = select(accepts);
    if (chosen) return chosen;
  }
  const preferred = accepts.find(
    (r) => (r.scheme || "exact") === "exact" && KNOWN_NETWORKS.has(String(r.network || "").toLowerCase().replace("_", "-"))
  );
  return preferred || accepts[0];
}

// x402 amounts are atomic token units. For USDC-like stables (6 decimals) this
// maps cleanly to USD. Callers can override with `resolveAmountUsd` for any
// non-stable asset or custom pricing.
export function amountUsdFromRequirements(requirements, { stableDecimals = 6 } = {}) {
  const raw = requirements.maxAmountRequired ?? requirements.amount;
  if (raw == null) return NaN;
  const decimals = Number(requirements.extra?.decimals ?? stableDecimals);
  let units;
  try {
    units = BigInt(String(raw));
  } catch {
    // Malformed atomic amounts (decimals, hex junk) become NaN so the policy
    // engine denies with "Invalid payment amount" instead of the wrapper throwing.
    return NaN;
  }
  const value = Number(units) / 10 ** decimals;
  return Number.isFinite(value) ? value : NaN;
}

// Map x402 payment requirements into an Allow payment intent. The merchant is
// resolved from `payTo` (or a caller-supplied resolver). Unknown counterparties
// stay unknown on purpose — the engine then denies them, which is the safe
// default for an allowance layer.
export function requirementsToIntent(requirements, context = {}) {
  const resolveMerchant = context.resolveMerchant;
  const merchantId =
    (typeof resolveMerchant === "function" ? resolveMerchant(requirements, context) : null) ||
    requirements.merchantId ||
    context.merchantId ||
    `x402:${requirements.network || "unknown"}:${requirements.payTo || "unknown"}`;

  const amountUsd =
    typeof context.resolveAmountUsd === "function"
      ? Number(context.resolveAmountUsd(requirements, context))
      : amountUsdFromRequirements(requirements, context);

  return {
    merchantId,
    amountUsd,
    resource: requirements.resource || context.url || "unbound",
    metadata: context.metadata || "",
    intentNonce: context.intentNonce || newNonce()
  };
}

export function createAllowFetch(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error("createAllowFetch requires a fetch implementation");
  }

  const policy = { ...DEFAULT_POLICY, ...(options.policy || {}) };
  // Receipts persist across calls so the same nonce cannot be replayed.
  const receipts = options.receipts || [];
  const pay = options.pay; // (requirements, { intent, url, init }) => paymentHeader string

  const wrapped = async function allowFetch(url, init = {}) {
    const first = await fetchImpl(url, init);
    if (first.status !== 402) return first;

    const challengeBody = await readJson(first);
    const challenge = parseX402Challenge(challengeBody);
    if (!challenge) {
      // 402 without parseable x402 requirements — hand it back untouched.
      return rebuildResponse(first, challengeBody);
    }

    const requirements = selectPaymentRequirements(challenge.accepts, options.selectRequirements);
    const intent = requirementsToIntent(requirements, {
      url: typeof url === "string" ? url : url?.url,
      resolveMerchant: options.resolveMerchant,
      resolveAmountUsd: options.resolveAmountUsd,
      merchantId: options.merchantId,
      metadata: typeof options.metadata === "function" ? options.metadata(requirements) : options.metadata,
      intentNonce: options.intentNonce
    });

    const evaluation = evaluatePaymentIntent(intent, policy, receipts, {
      merchants: options.merchants,
      merchantCatalog: options.merchantCatalog,
      policyVerifier: options.policyVerifier,
      agentIntentVerifier: options.agentIntentVerifier
    });

    if (typeof options.onDecision === "function") {
      options.onDecision({ decision: evaluation.decision, evaluation, requirements, intent });
    }

    // Persist every decision — denied receipts are pilot evidence too. A
    // receiptStore is anything with record() (e.g. createJsonlReceiptStore);
    // persistence failures must never turn into payments, so they propagate
    // only via onReceiptError and the in-memory flow continues.
    if (options.receiptStore?.record || typeof options.onReceipt === "function") {
      const entry = {
        source: "allow-fetch",
        decision: evaluation.decision,
        reasons: evaluation.reasons || [],
        warnings: evaluation.warnings || [],
        receipt: evaluation.receipt,
        intent,
        requirements
      };
      try {
        if (typeof options.onReceipt === "function") options.onReceipt(entry);
        if (options.receiptStore?.record) await options.receiptStore.record(entry);
      } catch (err) {
        if (typeof options.onReceiptError === "function") options.onReceiptError(err, entry);
      }
    }

    if (evaluation.decision !== "allow") {
      throw new AllowancePaymentBlockedError(evaluation, requirements);
    }

    if (typeof pay !== "function") {
      throw new Error("createAllowFetch: payment allowed but no pay() function was provided");
    }

    // A stream body was already consumed by the first request; retrying would
    // silently send an empty body to a paid endpoint. Fail loudly instead.
    if (typeof ReadableStream !== "undefined" && init.body instanceof ReadableStream) {
      throw new Error(
        "createAllowFetch: cannot retry a ReadableStream body after a 402 — pass a reusable body (string, Buffer, Blob, or FormData)"
      );
    }

    const paymentHeader = await pay(requirements, { intent, url, init, x402Version: challenge.x402Version });
    if (!paymentHeader) {
      throw new Error("createAllowFetch: pay() did not return an X-PAYMENT header");
    }

    // Record the allowed receipt before retrying so a duplicate nonce is caught.
    receipts.push(evaluation.receipt);

    const retryInit = {
      ...init,
      headers: { ...headersToObject(init.headers), [PAYMENT_HEADER]: paymentHeader }
    };
    const settled = await fetchImpl(url, retryInit);

    // Expose the receipt to callers without mutating the upstream response body.
    try {
      Object.defineProperty(settled, "allowReceipt", { value: evaluation.receipt, enumerable: false });
    } catch {
      // Some response objects are frozen; receipts are still in the array.
    }
    return settled;
  };

  wrapped.receipts = receipts;
  wrapped.policy = policy;
  return wrapped;
}

// Spreading a Headers instance (or [key, value] entries array) yields {} —
// silently dropping every caller header from the paid retry. Normalize all
// three RequestInit header shapes into a plain object first.
function headersToObject(headers) {
  if (!headers) return {};
  if (typeof Headers !== "undefined" && headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }
  if (Array.isArray(headers)) return Object.fromEntries(headers);
  return { ...headers };
}

function newNonce() {
  if (globalThis.crypto?.randomUUID) return `allow-${globalThis.crypto.randomUUID()}`;
  return `allow-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function readJson(response) {
  try {
    return await response.clone().json();
  } catch {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }
}

function rebuildResponse(response, body) {
  // The body stream may already be consumed; re-wrap parsed JSON when we have it.
  if (body == null) return response;
  try {
    return new Response(JSON.stringify(body), {
      status: response.status,
      headers: response.headers
    });
  } catch {
    return response;
  }
}
