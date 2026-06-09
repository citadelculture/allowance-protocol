export const X402_FACILITATOR_PROOF_TYPES = new Set(["x402", "x402-facilitator"]);

export function normalizeX402FacilitatorConfig(config = {}, env = {}) {
  const baseUrl = trimTrailingSlash(config.baseUrl || env.ALLOW_X402_FACILITATOR_URL || "");
  const bearerToken = config.bearerToken || env.ALLOW_X402_FACILITATOR_TOKEN || "";

  return {
    baseUrl,
    verifyPath: config.verifyPath || env.ALLOW_X402_VERIFY_PATH || "/verify",
    settlePath: config.settlePath || env.ALLOW_X402_SETTLE_PATH || "/settle",
    supportedPath: config.supportedPath || env.ALLOW_X402_SUPPORTED_PATH || "/supported",
    timeoutMs: Number(config.timeoutMs || env.ALLOW_X402_TIMEOUT_MS || 10_000),
    settle: Boolean(config.settle ?? (env.ALLOW_X402_SETTLE === "1")),
    bearerToken,
    headers: config.headers || {}
  };
}

export function shouldUseX402Facilitator(config = {}) {
  const settlements = [
    config.settlement,
    ...(Array.isArray(config.routes) ? config.routes.map((route) => route.settlement) : [])
  ].filter(Boolean);

  return settlements.some((settlement) => {
    const proofType = String(settlement.proofType || "").toLowerCase();
    return X402_FACILITATOR_PROOF_TYPES.has(proofType) || Boolean(settlement.facilitator);
  });
}

export function x402FacilitatorVerifierFromEnv(env = {}, options = {}) {
  const shouldCreate = Boolean(env.ALLOW_X402_FACILITATOR_URL) || shouldUseX402Facilitator(options.config);
  if (!shouldCreate) return null;

  return createX402FacilitatorVerifier({
    ...options,
    facilitator: normalizeX402FacilitatorConfig(options.facilitator || {}, env)
  });
}

export function createX402FacilitatorVerifier(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const defaultFacilitator = normalizeX402FacilitatorConfig(options.facilitator || {});

  return async function verifyWithX402Facilitator({ proof = {}, expected = {}, mode = "", settlement = {} } = {}) {
    if (!X402_FACILITATOR_PROOF_TYPES.has(String(mode || settlement?.proofType || "").toLowerCase())) {
      return {
        valid: false,
        reasons: [`Unsupported x402 facilitator proof type: ${mode || settlement?.proofType || "unknown"}`],
        warnings: []
      };
    }

    if (typeof fetchImpl !== "function") {
      return { valid: false, reasons: ["x402 facilitator verifier requires fetch"], warnings: [] };
    }

    const facilitator = normalizeX402FacilitatorConfig({
      ...defaultFacilitator,
      ...(settlement?.facilitator || {})
    });
    if (!facilitator.baseUrl) {
      return { valid: false, reasons: ["Missing x402 facilitator base URL"], warnings: [] };
    }

    let paymentPayload;
    try {
      paymentPayload = parseX402PaymentHeader(proof.rawPaymentHeader || proof.proof);
    } catch (error) {
      return { valid: false, reasons: [error.message], warnings: [] };
    }

    const paymentRequirements = paymentRequirementsFromSettlement(settlement, expected);
    if (!paymentRequirements) {
      return { valid: false, reasons: ["Missing x402 payment requirements"], warnings: [] };
    }

    const body = {
      x402Version: Number(settlement?.x402Version || paymentPayload.x402Version || 2),
      paymentPayload,
      paymentRequirements
    };

    const verifyResponse = await postFacilitatorJson({
      fetchImpl,
      facilitator,
      path: facilitator.verifyPath,
      body
    });

    if (!verifyResponse.ok) return facilitatorFailure("x402 facilitator verify request failed", verifyResponse);
    if (!Boolean(verifyResponse.body?.isValid ?? verifyResponse.body?.valid)) {
      return {
        valid: false,
        reasons: [verifyResponse.body?.invalidMessage || verifyResponse.body?.invalidReason || "x402 facilitator rejected payment"],
        warnings: [],
        verification: verifyResponse.body
      };
    }

    let settlementResponse = null;
    if (facilitator.settle || settlement?.settle === true) {
      settlementResponse = await postFacilitatorJson({
        fetchImpl,
        facilitator,
        path: facilitator.settlePath,
        body
      });

      if (!settlementResponse.ok) return facilitatorFailure("x402 facilitator settle request failed", settlementResponse);
      if (!Boolean(settlementResponse.body?.success ?? settlementResponse.body?.settled ?? settlementResponse.body?.valid)) {
        return {
          valid: false,
          reasons: [settlementResponse.body?.errorMessage || settlementResponse.body?.errorReason || "x402 facilitator settlement failed"],
          warnings: [],
          verification: verifyResponse.body,
          settlement: settlementResponse.body
        };
      }
    }

    return {
      valid: true,
      reasons: [],
      warnings: [],
      payer: verifyResponse.body?.payer || null,
      verification: verifyResponse.body,
      settlement: settlementResponse?.body || null
    };
  };
}

export function parseX402PaymentHeader(value) {
  const input = String(value || "").trim();
  if (!input) throw new Error("Missing x402 payment signature");

  const decodedCandidates = [input, decodeBase64(input), decodeBase64Url(input)].filter(Boolean);
  for (const candidate of decodedCandidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      // Try the next encoding candidate.
    }
  }

  throw new Error("x402 payment signature must be JSON or base64-encoded JSON");
}

export function paymentRequirementsFromSettlement(settlement = {}, expected = {}) {
  if (settlement?.paymentRequirements && typeof settlement.paymentRequirements === "object") {
    return settlement.paymentRequirements;
  }

  if (!settlement?.network || !settlement?.payTo || !(settlement?.assetAddress || settlement?.asset) || !settlement?.amount) {
    return null;
  }

  return {
    scheme: settlement.scheme || "exact",
    network: settlement.network,
    asset: settlement.assetAddress || settlement.asset,
    amount: String(settlement.amount),
    payTo: settlement.payTo,
    maxTimeoutSeconds: Number(settlement.maxTimeoutSeconds || 60),
    extra: settlement.extra || tokenExtraFromExpected(expected)
  };
}

async function postFacilitatorJson({ fetchImpl, facilitator, path, body }) {
  const response = await fetchWithTimeout(fetchImpl, `${facilitator.baseUrl}${ensureLeadingSlash(path)}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(facilitator.bearerToken ? { authorization: `Bearer ${facilitator.bearerToken}` } : {}),
      ...facilitator.headers
    },
    body: JSON.stringify(body)
  }, facilitator.timeoutMs);
  const responseBody = await responseJson(response);

  return {
    ok: response.ok,
    status: response.status,
    body: responseBody
  };
}

async function fetchWithTimeout(fetchImpl, url, init, timeoutMs) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return fetchImpl(url, init);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function responseJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function facilitatorFailure(message, response) {
  return {
    valid: false,
    reasons: [`${message}: HTTP ${response.status}`],
    warnings: [],
    response: response.body
  };
}

function tokenExtraFromExpected(expected = {}) {
  return expected.asset ? { name: expected.asset } : {};
}

function decodeBase64(value) {
  try {
    return Buffer.from(value, "base64").toString("utf8");
  } catch {
    return "";
  }
}

function decodeBase64Url(value) {
  try {
    return Buffer.from(value, "base64url").toString("utf8");
  } catch {
    return "";
  }
}

function ensureLeadingSlash(value) {
  const path = String(value || "");
  return path.startsWith("/") ? path : `/${path}`;
}

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}
