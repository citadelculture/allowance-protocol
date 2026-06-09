import { preflightPaymentAsync } from "./httpPreflight.mjs";

export const WALLET_PAYMENT_BLOCKED = "ALLOW_WALLET_PAYMENT_BLOCKED";
export const WALLET_PAYMENT_ALLOWED = "ALLOW_WALLET_PAYMENT_ALLOWED";

export class WalletPaymentBlockedError extends Error {
  constructor(response) {
    super(response.error.message);
    this.name = "WalletPaymentBlockedError";
    this.code = WALLET_PAYMENT_BLOCKED;
    this.response = response;
  }
}

export function walletPaymentIntent(request = {}, route = {}) {
  const operation = request.operation || request.action || "wallet_payment";
  const chain = request.chain || route.chain || "unknown";
  const asset = request.asset || route.asset || "unknown";
  const amountUsd =
    typeof route.amountUsdFromRequest === "function"
      ? route.amountUsdFromRequest(request)
      : route.amountUsd ?? request.amountUsd ?? request.usdAmount ?? request.priceUsd ?? 0;
  const merchantId =
    typeof route.merchantIdFromRequest === "function"
      ? route.merchantIdFromRequest(request)
      : route.merchantId || request.merchantId || request.counterparty || request.toMerchant || "unknown";
  const resource =
    typeof route.resourceFromRequest === "function"
      ? route.resourceFromRequest(request)
      : route.resource || request.resource || `wallet://${chain}/${operation}`;
  const metadata =
    typeof route.metadataFromRequest === "function"
      ? route.metadataFromRequest(request)
      : request.metadata || defaultWalletMetadata(request);
  const intentNonce =
    typeof route.intentNonceFromRequest === "function"
      ? route.intentNonceFromRequest(request)
      : request.intentNonce || request.nonce || request.clientRequestId || request.id || "";

  return {
    merchantId,
    amountUsd: Number(amountUsd),
    resource,
    metadata,
    intentNonce: String(intentNonce || "")
  };
}

export async function evaluateWalletPayment(request, options = {}) {
  const route = resolveWalletRoute(request, options);
  validateWalletRoute(request, route);

  const intent = walletPaymentIntent(request, route);
  const result = await preflightPaymentAsync({
    policy: options.policy,
    receipts: options.receipts || [],
    intent,
    policyVerifier: options.policyVerifier,
    agentIntentVerifier: options.agentIntentVerifier,
    merchantCatalog: options.merchantCatalog,
    merchants: options.merchants
  });

  return {
    allowed: result.status === 200,
    route,
    intent,
    result,
    allow: allowContextFromResult(result, route)
  };
}

export function createWalletPolicyHook(options = {}) {
  const receipts = options.receipts || [];

  return async function walletPolicyHook(request, executor) {
    if (typeof executor !== "function") {
      throw new Error("createWalletPolicyHook requires an executor when invoked");
    }

    const evaluation = await evaluateWalletPayment(request, {
      ...options,
      receipts
    });

    if (!evaluation.allowed) {
      return walletBlockedResponse(evaluation);
    }

    if (options.recordAllowedReceipt !== false) {
      receipts.unshift(evaluation.allow.receipt);
    }

    const execution = await executor(request, {
      allow: evaluation.allow,
      intent: evaluation.intent,
      route: evaluation.route
    });

    return {
      ok: true,
      blocked: false,
      status: 200,
      protocol: "allow",
      code: WALLET_PAYMENT_ALLOWED,
      result: execution,
      execution,
      allow: evaluation.allow,
      intent: evaluation.intent
    };
  };
}

export function createAgentKitPolicyHook(options = {}) {
  const hook = createWalletPolicyHook(options);

  return {
    async beforeAction(request, executor) {
      return hook(request, executor);
    },
    async guard(request, executor) {
      return hook(request, executor);
    }
  };
}

export function createWalletClientPolicyAdapter(options = {}) {
  const walletClient = options.walletClient;
  const sendMethod = options.sendMethod || "sendTransaction";

  if (!walletClient || typeof walletClient[sendMethod] !== "function") {
    throw new Error("createWalletClientPolicyAdapter requires a walletClient with sendTransaction");
  }

  const hook = options.hook || createWalletPolicyHook(options);
  const transactionToRequest = options.transactionToRequest || walletTransactionRequest;

  return {
    async sendTransaction(transaction, requestOptions = {}) {
      const request = transactionToRequest(transaction, requestOptions, options);

      return hook(request, async (_walletRequest, context) => {
        const hash = await walletClient[sendMethod].call(walletClient, transaction);
        return {
          hash,
          receiptId: context.allow.receipt.id
        };
      });
    }
  };
}

export function walletTransactionRequest(transaction = {}, requestOptions = {}, adapterOptions = {}) {
  const operation = requestOptions.operation || transaction.operation || "send_transaction";
  const chain = normalizeChainName(requestOptions.chain || transaction.chain || adapterOptions.chain || "unknown");
  const to = requestOptions.to || transaction.to || transaction.recipient || "";
  const metadata = requestOptions.metadata ?? transaction.metadata ?? transaction.memo ?? requestOptions.memo ?? "";

  return {
    id:
      requestOptions.intentNonce ||
      requestOptions.id ||
      transaction.intentNonce ||
      transaction.clientRequestId ||
      transaction.id ||
      "",
    operation,
    chain,
    asset: requestOptions.asset || transaction.asset || adapterOptions.asset || "native",
    to,
    merchantId: requestOptions.merchantId || transaction.merchantId || transaction.counterparty || transaction.toMerchant,
    amountUsd:
      requestOptions.amountUsd ??
      transaction.amountUsd ??
      transaction.usdAmount ??
      transaction.priceUsd,
    resource: requestOptions.resource || transaction.resource || defaultWalletTransactionResource({ chain, operation, to }),
    metadata
  };
}

export async function assertWalletPaymentAllowed(request, options = {}) {
  const evaluation = await evaluateWalletPayment(request, options);
  if (!evaluation.allowed) {
    throw new WalletPaymentBlockedError(walletBlockedResponse(evaluation));
  }
  return evaluation.allow;
}

export function walletBlockedResponse(evaluation) {
  return {
    ok: false,
    blocked: true,
    status: 402,
    protocol: "allow",
    error: {
      code: WALLET_PAYMENT_BLOCKED,
      message: "Wallet action blocked by allowance policy",
      reasons: evaluation.allow.reasons
    },
    allow: evaluation.allow,
    intent: evaluation.intent
  };
}

function resolveWalletRoute(request = {}, options = {}) {
  const routeKey = request.route || request.operation || request.action || "default";
  const routes = options.routes || {};
  return {
    ...(routes.default || {}),
    ...(routes[routeKey] || {}),
    ...(options.route || {}),
    ...inlineRouteFromOptions(options)
  };
}

function validateWalletRoute(request, route) {
  const merchantSource =
    route.merchantId ||
    typeof route.merchantIdFromRequest === "function" ||
    request.merchantId ||
    request.counterparty ||
    request.toMerchant;
  const amountSource =
    route.amountUsd !== undefined ||
    typeof route.amountUsdFromRequest === "function" ||
    request.amountUsd !== undefined ||
    request.usdAmount !== undefined ||
    request.priceUsd !== undefined;

  if (!merchantSource) {
    throw new Error("Wallet policy route requires merchantId or merchantIdFromRequest");
  }
  if (!amountSource) {
    throw new Error("Wallet policy route requires amountUsd or amountUsdFromRequest");
  }
}

function allowContextFromResult(result, route) {
  const evaluation = result.body.evaluation;
  return {
    decision: evaluation.decision,
    riskScore: evaluation.riskScore,
    receipt: evaluation.receipt,
    reasons: evaluation.reasons,
    warnings: evaluation.warnings,
    route
  };
}

function defaultWalletMetadata(request = {}) {
  return JSON.stringify({
    operation: request.operation || request.action || "wallet_payment",
    to: request.to || request.recipient || null,
    chain: request.chain || null,
    asset: request.asset || null,
    memo: request.memo || null
  });
}

function defaultWalletTransactionResource({ chain, operation, to }) {
  return `wallet://${chain}/${operation}/${to || "unknown"}`;
}

function normalizeChainName(chain) {
  if (typeof chain === "string") return chain;
  if (typeof chain?.name === "string") return chain.name;
  if (chain?.id !== undefined) return String(chain.id);
  return "unknown";
}

function inlineRouteFromOptions(options = {}) {
  const route = {};
  for (const key of [
    "merchantId",
    "amountUsd",
    "resource",
    "chain",
    "asset",
    "merchantIdFromRequest",
    "amountUsdFromRequest",
    "resourceFromRequest",
    "metadataFromRequest",
    "intentNonceFromRequest"
  ]) {
    if (options[key] !== undefined) route[key] = options[key];
  }
  return route;
}
