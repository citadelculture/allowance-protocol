import { readFile } from "node:fs/promises";
import { preflightPaymentAsync } from "./httpPreflight.mjs";
import { sendPreflightResponse, writeAllowHeaders } from "./httpMiddleware.mjs";
import {
  createFixedWindowRateLimiter,
  normalizeRateLimitConfig,
  rateLimitKeyFromRequest,
  rateLimitResponse
} from "./rateLimit.mjs";
import {
  normalizeSettlementConfig,
  settlementRequiredResponse,
  verifySettlementForRequest
} from "./settlementProof.mjs";
import { normalizeReceiptEvidence } from "./receiptStore.mjs";

const DEFAULT_FORWARD_HEADERS = [
  "accept",
  "content-type",
  "user-agent",
  "x-allow-nonce",
  "x-intent-nonce",
  "x-allow-metadata"
];
const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade"
]);

export async function loadGatewayConfig(path) {
  const raw = await readFile(path, "utf8");
  return normalizeGatewayConfig(JSON.parse(raw));
}

export function normalizeGatewayConfig(config = {}) {
  const listen = config.listen || {};
  const upstream = config.upstream || {};
  const routes = Array.isArray(config.routes) ? config.routes : [];

  if (!upstream.baseUrl) throw new Error("Gateway config requires upstream.baseUrl");
  if (routes.length === 0) throw new Error("Gateway config requires at least one route");

  return {
    name: config.name || "allow-gateway",
    listen: {
      host: listen.host || "127.0.0.1",
      port: Number(listen.port || 4190)
    },
    upstream: {
      baseUrl: String(upstream.baseUrl).replace(/\/+$/, ""),
      timeoutMs: Number(upstream.timeoutMs || 10_000)
    },
    receipts: {
      path: config.receipts?.path || ""
    },
    evidence: normalizeReceiptEvidence(config.evidence),
    rateLimit: normalizeRateLimitConfig(config.rateLimit),
    settlement: normalizeSettlementConfig(config.settlement),
    merchants: Array.isArray(config.merchants) ? config.merchants : [],
    routes: routes.map((route) => normalizeRoute(route, config.settlement, config.evidence)),
    forwardHeaders: config.forwardHeaders || DEFAULT_FORWARD_HEADERS
  };
}

export function createAllowGatewayHandler(options = {}) {
  const config = normalizeGatewayConfig(options.config || {});
  const receipts = options.receipts || [];
  const receiptStore = options.receiptStore || null;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const merchants = options.merchants || config.merchants || [];
  const globalRateLimiter = createFixedWindowRateLimiter(config.rateLimit);
  const routeRateLimiters = new Map(
    config.routes.map((route) => [route.pathPrefix, createFixedWindowRateLimiter(route.rateLimit)])
  );
  const keyFromRequest = options.rateLimitKeyFromRequest || rateLimitKeyFromRequest;

  if (typeof fetchImpl !== "function") {
    throw new Error("Allow gateway requires fetch or an injected fetchImpl");
  }

  return async function allowGateway(req, res) {
    if (isGatewayHealthRequest(req)) {
      sendGatewayJson(res, 200, gatewayHealth(config, receipts, receiptStore));
      return;
    }

    const route = matchGatewayRoute(config, req.url || "/");
    if (!route) {
      sendGatewayJson(res, 404, {
        error: "No Allow gateway route matched",
        gateway: config.name
      });
      return;
    }

    const rateLimiter = routeRateLimiters.get(route.pathPrefix) || globalRateLimiter;
    if (rateLimiter) {
      const rateDecision = rateLimiter.check(
        await keyFromRequest(req, {
          policy: options.policy,
          route
        })
      );
      req.allowRateLimit = rateDecision;

      if (!rateDecision.allowed) {
        const response = rateLimitResponse(rateDecision);
        sendGatewayJson(res, response.status, response.body, response.headers);
        return;
      }
    }

    const intent = intentFromGatewayRequest(req, route);
    const result = await preflightPaymentAsync({
      policy: options.policy,
      policyVerifier: options.policyVerifier,
      agentIntentVerifier: options.agentIntentVerifier,
      merchants,
      receipts,
      intent
    });

    req.allow = {
      decision: result.body.evaluation.decision,
      riskScore: result.body.evaluation.riskScore,
      receipt: result.body.evaluation.receipt,
      reasons: result.body.evaluation.reasons,
      warnings: result.body.evaluation.warnings,
      route
    };

    if (result.status !== 200) {
      await recordGatewayReceipt({
        receiptStore,
        receipts,
        result,
        route,
        req
      });
      sendPreflightResponse(res, result);
      return;
    }

    const settlementResult = await verifySettlementForRequest(req, {
      route,
      policy: options.policy,
      result,
      settlement: route.settlement,
      verifier: options.settlementVerifier
    });
    req.allowSettlement = settlementResult;

    if (!settlementResult.valid) {
      const response = settlementRequiredResponse(settlementResult);
      sendGatewayJson(res, response.status, response.body, {
        ...result.headers,
        ...response.headers
      });
      return;
    }

    const proxyResult = await proxyAllowedRequest({ req, res, route, config, result, fetchImpl });
    await recordGatewayReceipt({
      receiptStore,
      receipts,
      result,
      route,
      req,
      upstreamStatus: proxyResult.upstreamStatus,
      upstreamError: proxyResult.upstreamError || null
    });
  };
}

export function matchGatewayRoute(config, requestUrl = "/") {
  const url = new URL(requestUrl, "http://allow.local");
  const routes = config.routes || [];
  return (
    routes
      .filter((route) => url.pathname === route.pathPrefix || url.pathname.startsWith(`${route.pathPrefix}/`))
      .sort((a, b) => b.pathPrefix.length - a.pathPrefix.length)[0] || null
  );
}

export function intentFromGatewayRequest(req, route) {
  const url = new URL(req.url || "/", "http://allow.local");
  return {
    merchantId: route.merchantId,
    amountUsd: route.amountUsd,
    resource: route.resourceTemplate === "path" ? url.pathname : `${url.pathname}${url.search}`,
    metadata: headerValue(req.headers, route.metadataHeader),
    intentNonce: headerValue(req.headers, "x-allow-nonce") || headerValue(req.headers, "x-intent-nonce")
  };
}

export async function proxyAllowedRequest({ req, res, route, config, result, fetchImpl }) {
  const upstreamUrl = upstreamUrlForRequest(config.upstream.baseUrl, req.url || "/");
  const requestHeaders = filteredRequestHeaders(req.headers || {}, config.forwardHeaders);
  const body = await requestBody(req);
  const method = req.method || "GET";
  let upstreamResponse;

  try {
    upstreamResponse = await fetchWithTimeout(fetchImpl, upstreamUrl, {
      method,
      headers: {
        ...requestHeaders,
        "x-allow-decision": "allow",
        "x-allow-receipt": result.body.evaluation.receipt.id,
        "x-allow-policy": result.body.evaluation.receipt.policyId,
        "x-allow-merchant": route.merchantId
      },
      body: method === "GET" || method === "HEAD" ? undefined : body
    }, config.upstream.timeoutMs);
  } catch (error) {
    sendGatewayJson(
      res,
      502,
      {
        protocol: "allow",
        message: "Payment intent accepted by allowance policy, but upstream request failed",
        upstream: {
          status: 502,
          error: error.name === "AbortError" ? "upstream_timeout" : "upstream_fetch_failed",
          detail: error.message
        },
        evaluation: result.body.evaluation
      },
      result.headers
    );

    return {
      upstreamStatus: 502,
      upstreamError: error.message
    };
  }

  const responseHeaders = filteredResponseHeaders(upstreamResponse.headers);
  writeAllowHeaders(res, result.headers);

  if (typeof res.writeHead === "function") {
    res.writeHead(upstreamResponse.status, {
      ...responseHeaders,
      ...result.headers
    });
  }

  const bytes = Buffer.from(await upstreamResponse.arrayBuffer());
  if (typeof res.end === "function") res.end(bytes);

  return {
    upstreamStatus: upstreamResponse.status
  };
}

async function recordGatewayReceipt({
  receiptStore,
  receipts,
  result,
  route,
  req,
  upstreamStatus = null,
  upstreamError = null
}) {
  const evaluation = result.body.evaluation;
  const record = {
    source: "allow-gateway",
    merchantId: route.merchantId,
    decision: evaluation.decision,
    route: {
      pathPrefix: route.pathPrefix,
      url: req.url || "/"
    },
    upstreamStatus,
    upstreamError,
    reasons: evaluation.reasons,
    warnings: evaluation.warnings,
    evidence: route.evidence,
    receipt: evaluation.receipt
  };

  receipts.unshift(evaluation.receipt);
  if (receiptStore && typeof receiptStore.record === "function") {
    await receiptStore.record(record);
  }
}

export function gatewayHealth(config, receipts = [], receiptStore = null) {
  return {
    ok: true,
    protocol: "allow",
    gateway: config.name,
    upstream: {
      baseUrl: config.upstream.baseUrl,
      timeoutMs: config.upstream.timeoutMs
    },
    routes: config.routes.map((route) => ({
      pathPrefix: route.pathPrefix,
      merchantId: route.merchantId,
      amountUsd: route.amountUsd,
      evidence: route.evidence
    })),
    receipts: {
      inMemory: receipts.length,
      path: receiptStore?.path || config.receipts.path || null
    },
    rateLimit: config.rateLimit,
    evidence: config.evidence,
    settlement: config.settlement,
    routeRateLimits: config.routes
      .filter((route) => route.rateLimit)
      .map((route) => ({
        pathPrefix: route.pathPrefix,
        rateLimit: route.rateLimit
      })),
    routeSettlement: config.routes
      .filter((route) => route.settlement)
      .map((route) => ({
        pathPrefix: route.pathPrefix,
        settlement: route.settlement
      }))
  };
}

function normalizeRoute(route = {}, globalSettlement = null, globalEvidence = null) {
  if (!route.pathPrefix || !String(route.pathPrefix).startsWith("/")) {
    throw new Error("Gateway route requires pathPrefix starting with /");
  }
  if (!route.merchantId) throw new Error(`Gateway route ${route.pathPrefix} requires merchantId`);
  if (!Number.isFinite(Number(route.amountUsd)) || Number(route.amountUsd) <= 0) {
    throw new Error(`Gateway route ${route.pathPrefix} requires positive amountUsd`);
  }

  return {
    pathPrefix: String(route.pathPrefix).replace(/\/+$/, "") || "/",
    merchantId: route.merchantId,
    amountUsd: Number(route.amountUsd),
    metadataHeader: route.metadataHeader || "x-allow-metadata",
    resourceTemplate: route.resourceTemplate || "path_and_query",
    rateLimit: normalizeRateLimitConfig(route.rateLimit),
    settlement: normalizeSettlementConfig(route.settlement || globalSettlement),
    evidence: normalizeReceiptEvidence(route.evidence || globalEvidence)
  };
}

function upstreamUrlForRequest(baseUrl, requestUrl) {
  const url = new URL(requestUrl, "http://allow.local");
  return `${baseUrl}${url.pathname}${url.search}`;
}

function filteredRequestHeaders(headers, allowlist) {
  const normalizedAllowlist = new Set(allowlist.map((header) => header.toLowerCase()));
  const output = {};
  for (const [key, value] of Object.entries(headers || {})) {
    const normalized = key.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(normalized)) continue;
    if (!normalizedAllowlist.has(normalized)) continue;
    output[normalized] = Array.isArray(value) ? value[0] : String(value);
  }
  return output;
}

function filteredResponseHeaders(headers) {
  const output = {};
  if (!headers || typeof headers.forEach !== "function") return output;
  headers.forEach((value, key) => {
    const normalized = key.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(normalized)) return;
    output[normalized] = value;
  });
  return output;
}

async function fetchWithTimeout(fetchImpl, url, init, timeoutMs) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return fetchImpl(url, init);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetchImpl(url, {
      ...init,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function requestBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function sendGatewayJson(res, status, body, extraHeaders = {}) {
  const json = JSON.stringify(body, null, 2);
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...extraHeaders
  };

  if (typeof res.writeHead === "function") {
    res.writeHead(status, headers);
  } else {
    res.statusCode = status;
    if (typeof res.setHeader === "function") {
      for (const [key, value] of Object.entries(headers)) {
        res.setHeader(key, value);
      }
    }
  }
  if (typeof res.end === "function") res.end(json);
}

function isGatewayHealthRequest(req) {
  if (req.method && req.method !== "GET" && req.method !== "HEAD") return false;
  const url = new URL(req.url || "/", "http://allow.local");
  return url.pathname === "/health" || url.pathname === "/allow/health";
}

function headerValue(headers = {}, name) {
  const value = headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()];
  if (Array.isArray(value)) return value[0];
  return value == null ? "" : String(value);
}
