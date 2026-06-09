import { preflightPaymentAsync } from "./httpPreflight.mjs";
import {
  createFixedWindowRateLimiter,
  rateLimitKeyFromRequest as defaultRateLimitKeyFromRequest,
  rateLimitResponse
} from "./rateLimit.mjs";
import {
  settlementRequiredResponse,
  verifySettlementForRequest
} from "./settlementProof.mjs";

export function createAllowPreflightMiddleware(options = {}) {
  const {
    policy,
    receipts,
    policyVerifier,
    agentIntentVerifier,
    merchantCatalog,
    merchants,
    intentFromRequest = defaultIntentFromRequest,
    rateLimit = null,
    rateLimitKeyFromRequest = rateLimit?.keyFromRequest || defaultRateLimitKeyFromRequest,
    rateLimitContext = {},
    onAllow,
    onDeny
  } = options;
  const rateLimiter = rateLimit?.check ? rateLimit : createFixedWindowRateLimiter(rateLimit);

  return async function allowPreflight(req, res, next) {
    if (rateLimiter) {
      const key = await rateLimitKeyFromRequest(req, {
        policy,
        ...rateLimitContext
      });
      const rateDecision = rateLimiter.check(key);
      req.allowRateLimit = rateDecision;

      if (!rateDecision.allowed) {
        const response = rateLimitResponse(rateDecision);
        sendPreflightResponse(res, response);
        return response;
      }
    }

    const intent = await intentFromRequest(req);
    const result = await preflightPaymentAsync({
      policy,
      receipts,
      intent,
      policyVerifier,
      agentIntentVerifier,
      merchantCatalog,
      merchants
    });
    attachAllowContext(req, result);

    if (result.status === 200) {
      writeAllowHeaders(res, result.headers);
      if (onAllow) await onAllow({ req, res, result });
      if (next) {
        const nextResult = await next();
        return nextResult || result;
      }
      return result;
    }

    if (onDeny) await onDeny({ req, res, result });
    sendPreflightResponse(res, result);
    return result;
  };
}

export function createPaidRoute(options = {}) {
  const {
    policy,
    receipts,
    policyVerifier,
    agentIntentVerifier,
    merchantCatalog,
    merchants,
    merchantId,
    amountUsd,
    rateLimit,
    rateLimitKeyFromRequest,
    settlement,
    settlementVerifier,
    resourceFromRequest = (req) => req.url || "/",
    metadataFromRequest = (req) => headerValue(req.headers, "x-allow-metadata") || "",
    handler
  } = options;

  if (!merchantId) throw new Error("createPaidRoute requires merchantId");
  if (!Number.isFinite(Number(amountUsd)) || Number(amountUsd) <= 0) {
    throw new Error("createPaidRoute requires a positive amountUsd");
  }
  if (typeof handler !== "function") throw new Error("createPaidRoute requires handler");

  const guard = createAllowPreflightMiddleware({
    policy,
    receipts,
    policyVerifier,
    agentIntentVerifier,
    merchantCatalog,
    merchants,
    rateLimit,
    rateLimitKeyFromRequest,
    rateLimitContext: {
      route: {
        merchantId,
        resource: merchantId
      }
    },
    intentFromRequest: async (req) => ({
      merchantId,
      amountUsd: Number(amountUsd),
      resource: await resourceFromRequest(req),
      metadata: await metadataFromRequest(req),
      intentNonce: headerValue(req.headers, "x-allow-nonce") || headerValue(req.headers, "x-intent-nonce") || ""
    })
  });

  return async function paidRoute(req, res) {
    return guard(req, res, async () => {
      const settlementResult = await verifySettlementForRequest(req, {
        route: {
          merchantId,
          amountUsd: Number(amountUsd)
        },
        policy,
        result: {
          body: {
            evaluation: req.allow
          }
        },
        settlement,
        verifier: settlementVerifier
      });

      req.allowSettlement = settlementResult;
      if (!settlementResult.valid) {
        const response = settlementRequiredResponse(settlementResult);
        sendPreflightResponse(res, response);
        return response;
      }

      await handler(req, res);
      return req.allow;
    });
  };
}

export function sendPreflightResponse(res, result) {
  const body = JSON.stringify(result.body, null, 2);
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...result.headers
  };

  if (typeof res.status === "function" && typeof res.json === "function") {
    for (const [key, value] of Object.entries(headers)) {
      if (typeof res.set === "function") res.set(key, value);
      else if (typeof res.setHeader === "function") res.setHeader(key, value);
    }
    res.status(result.status).json(result.body);
    return;
  }

  if (typeof res.writeHead === "function") {
    res.writeHead(result.status, headers);
  } else {
    res.statusCode = result.status;
    for (const [key, value] of Object.entries(headers)) {
      if (typeof res.setHeader === "function") res.setHeader(key, value);
    }
  }

  if (typeof res.end === "function") res.end(body);
}

export function writeAllowHeaders(res, headers) {
  for (const [key, value] of Object.entries(headers)) {
    if (typeof res.set === "function") res.set(key, value);
    else if (typeof res.setHeader === "function") res.setHeader(key, value);
  }
}

function attachAllowContext(req, result) {
  req.allow = {
    decision: result.body.evaluation.decision,
    riskScore: result.body.evaluation.riskScore,
    receipt: result.body.evaluation.receipt,
    reasons: result.body.evaluation.reasons,
    warnings: result.body.evaluation.warnings
  };
}

function defaultIntentFromRequest(req) {
  return {
    merchantId: headerValue(req.headers, "x-allow-merchant") || "unknown",
    amountUsd: Number(headerValue(req.headers, "x-allow-amount-usd") || 0),
    resource: headerValue(req.headers, "x-allow-resource") || req.url || "/",
    metadata: headerValue(req.headers, "x-allow-metadata") || "",
    intentNonce: headerValue(req.headers, "x-allow-nonce") || headerValue(req.headers, "x-intent-nonce") || ""
  };
}

function headerValue(headers = {}, name) {
  const value = headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()];
  if (Array.isArray(value)) return value[0];
  return value == null ? "" : String(value);
}
