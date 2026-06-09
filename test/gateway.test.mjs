import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { DEFAULT_POLICY, policyFingerprint } from "../src/policyEngine.mjs";
import { demoPolicySignature } from "../src/policyVerifier.mjs";
import {
  createAllowGatewayHandler,
  gatewayHealth,
  intentFromGatewayRequest,
  matchGatewayRoute,
  normalizeGatewayConfig
} from "../src/gateway.mjs";

function mockReq({ headers = {}, method = "GET", url = "/paid-search?q=x402", body = "" } = {}) {
  const req = Readable.from(body ? [body] : []);
  req.headers = headers;
  req.method = method;
  req.url = url;
  return req;
}

function mockRes() {
  const state = {
    status: null,
    headers: {},
    body: Buffer.alloc(0)
  };

  return {
    state,
    setHeader(key, value) {
      state.headers[key.toLowerCase()] = String(value);
    },
    writeHead(status, headers = {}) {
      state.status = status;
      for (const [key, value] of Object.entries(headers)) {
        state.headers[key.toLowerCase()] = String(value);
      }
    },
    end(chunk = "") {
      const next = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
      state.body = Buffer.concat([state.body, next]);
    }
  };
}

const config = normalizeGatewayConfig({
  upstream: {
    baseUrl: "https://upstream.example"
  },
  routes: [
    {
      pathPrefix: "/paid-search",
      merchantId: "mcp_search",
      amountUsd: 0.018
    },
    {
      pathPrefix: "/paid-search/deep",
      merchantId: "vector_cloud",
      amountUsd: 0.82
    }
  ]
});

assert.equal(matchGatewayRoute(config, "/paid-search?q=x402").merchantId, "mcp_search");
assert.equal(matchGatewayRoute(config, "/paid-search/deep/job").merchantId, "vector_cloud");
assert.equal(matchGatewayRoute(config, "/free"), null);

const intent = intentFromGatewayRequest(
  mockReq({
    headers: {
      "x-allow-nonce": "gateway-001",
      "x-allow-metadata": "public search"
    },
    url: "/paid-search?q=x402"
  }),
  config.routes[0]
);

assert.deepEqual(intent, {
  merchantId: "mcp_search",
  amountUsd: 0.018,
  resource: "/paid-search?q=x402",
  metadata: "public search",
  intentNonce: "gateway-001"
});

const fetchCalls = [];
const recorded = [];
const handler = createAllowGatewayHandler({
  config,
  policy: { ...DEFAULT_POLICY, spentTodayUsd: 0 },
  receipts: [],
  receiptStore: {
    async record(entry) {
      recorded.push(entry);
    }
  },
  fetchImpl: async (url, init) => {
    fetchCalls.push({ url, init });
    return new Response(JSON.stringify({ ok: true, receipt: init.headers["x-allow-receipt"] }), {
      status: 201,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "x-upstream": "ok"
      }
    });
  }
});

const allowReq = mockReq({
  headers: {
    "x-allow-nonce": "gateway-allow-001",
    "x-allow-metadata": "public request",
    "content-type": "application/json"
  },
  url: "/paid-search?q=x402"
});
const allowRes = mockRes();
await handler(allowReq, allowRes);

assert.equal(allowRes.state.status, 201);
assert.equal(allowReq.allow.decision, "allow");
assert.equal(allowRes.state.headers["x-allow-decision"], "allow");
assert.equal(fetchCalls[0].url, "https://upstream.example/paid-search?q=x402");
assert.equal(fetchCalls[0].init.headers["x-allow-merchant"], "mcp_search");
assert.equal(fetchCalls[0].init.headers["x-allow-nonce"], "gateway-allow-001");
assert.equal(fetchCalls[0].init.headers["x-allow-metadata"], "public request");
assert.equal(JSON.parse(allowRes.state.body.toString()).ok, true);
assert.equal(recorded.length, 1);
assert.equal(recorded[0].decision, "allow");
assert.equal(recorded[0].upstreamStatus, 201);
assert.equal(recorded[0].evidence.environment, "local");

const healthRes = mockRes();
await handler(mockReq({ url: "/health" }), healthRes);
const health = JSON.parse(healthRes.state.body.toString());
assert.equal(healthRes.state.status, 200);
assert.equal(health.ok, true);
assert.equal(health.gateway, "allow-gateway");
assert.equal(health.routes.length, 2);
assert.equal(health.evidence.environment, "local");
assert.equal(health.routes[0].evidence.environment, "local");
assert.equal(health.receipts.inMemory, 1);
assert.equal(gatewayHealth(config).upstream.timeoutMs, 10000);
assert.equal(gatewayHealth(config, [], { path: "/tmp/receipts.jsonl" }).receipts.path, "/tmp/receipts.jsonl");

const deniedReq = mockReq({
  headers: {
    "x-allow-nonce": "gateway-deny-001",
    "x-allow-metadata": "email alex@example.com"
  },
  url: "/paid-search?q=leads"
});
const deniedRes = mockRes();
await handler(deniedReq, deniedRes);

assert.equal(deniedRes.state.status, 402);
assert.equal(deniedReq.allow.decision, "deny");
assert.equal(fetchCalls.length, 1);
assert.equal(JSON.parse(deniedRes.state.body.toString()).evaluation.reasons[0], "Payment metadata contains restricted data: email");
assert.equal(recorded.length, 2);
assert.equal(recorded[1].decision, "deny");
assert.equal(recorded[1].upstreamStatus, null);

const customConfig = normalizeGatewayConfig({
  upstream: {
    baseUrl: "https://research.example"
  },
  merchants: [
    {
      id: "research_api",
      name: "Research API",
      domain: "research.example",
      category: "research",
      trustScore: 91,
      defaultPriceUsd: 0.25,
      riskTags: ["query_text"]
    }
  ],
  routes: [
    {
      pathPrefix: "/v1/search",
      merchantId: "research_api",
      amountUsd: 0.25
    }
  ]
});
const customCalls = [];
const customHandler = createAllowGatewayHandler({
  config: customConfig,
  policy: signedDemoPolicy({
    ...DEFAULT_POLICY,
    spentTodayUsd: 0,
    allowedMerchants: ["research_api"],
    perTxCapUsd: 0.25,
    dailyCapUsd: 2
  }),
  receipts: [],
  fetchImpl: async (url, init) => {
    customCalls.push({ url, init });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8"
      }
    });
  }
});
const customRes = mockRes();
await customHandler(
  mockReq({
    url: "/v1/search",
    headers: {
      "x-allow-nonce": "gateway-custom-merchant-001",
      "x-allow-metadata": "public request"
    }
  }),
  customRes
);

assert.equal(customRes.state.status, 200);
assert.equal(customCalls.length, 1);
assert.equal(customCalls[0].init.headers["x-allow-merchant"], "research_api");

const notFoundRes = mockRes();
await handler(mockReq({ url: "/free" }), notFoundRes);
assert.equal(notFoundRes.state.status, 404);
assert.equal(JSON.parse(notFoundRes.state.body.toString()).error, "No Allow gateway route matched");

const failedRecords = [];
const failedHandler = createAllowGatewayHandler({
  config,
  policy: { ...DEFAULT_POLICY, spentTodayUsd: 0 },
  receipts: [],
  receiptStore: {
    async record(entry) {
      failedRecords.push(entry);
    }
  },
  fetchImpl: async () => {
    throw new Error("upstream unavailable");
  }
});

const failedReq = mockReq({
  headers: {
    "x-allow-nonce": "gateway-upstream-fail-001",
    "x-allow-metadata": "public request"
  },
  url: "/paid-search?q=x402"
});
const failedRes = mockRes();
await failedHandler(failedReq, failedRes);

const failedBody = JSON.parse(failedRes.state.body.toString());
assert.equal(failedRes.state.status, 502);
assert.equal(failedRes.state.headers["x-allow-decision"], "allow");
assert.equal(failedBody.upstream.error, "upstream_fetch_failed");
assert.equal(failedRecords.length, 1);
assert.equal(failedRecords[0].decision, "allow");
assert.equal(failedRecords[0].upstreamStatus, 502);
assert.equal(failedRecords[0].upstreamError, "upstream unavailable");

const limitedConfig = normalizeGatewayConfig({
  upstream: {
    baseUrl: "https://upstream.example"
  },
  rateLimit: {
    max: 1,
    windowMs: 60_000
  },
  routes: [
    {
      pathPrefix: "/paid-search",
      merchantId: "mcp_search",
      amountUsd: 0.018
    }
  ]
});
const limitedFetchCalls = [];
const limitedHandler = createAllowGatewayHandler({
  config: limitedConfig,
  policy: { ...DEFAULT_POLICY, spentTodayUsd: 0 },
  receipts: [],
  rateLimitKeyFromRequest: () => "gateway-limit",
  fetchImpl: async (url, init) => {
    limitedFetchCalls.push({ url, init });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8"
      }
    });
  }
});

await limitedHandler(
  mockReq({
    headers: {
      "x-allow-nonce": "gateway-limited-001",
      "x-allow-metadata": "public request"
    }
  }),
  mockRes()
);
const limitedGatewayRes = mockRes();
await limitedHandler(
  mockReq({
    headers: {
      "x-allow-nonce": "gateway-limited-002",
      "x-allow-metadata": "public request"
    }
  }),
  limitedGatewayRes
);

assert.equal(limitedFetchCalls.length, 1);
assert.equal(limitedGatewayRes.state.status, 429);
assert.equal(limitedGatewayRes.state.headers["x-allow-rate-limit"], "1");
assert.equal(JSON.parse(limitedGatewayRes.state.body.toString()).error, "ALLOW_RATE_LIMIT_EXCEEDED");
assert.deepEqual(gatewayHealth(limitedConfig).rateLimit, { max: 1, windowMs: 60000, scope: "policy_agent_route" });

const settlementConfig = normalizeGatewayConfig({
  upstream: {
    baseUrl: "https://upstream.example"
  },
  settlement: {
    required: true,
    chain: "Base",
    asset: "USDC",
    proofType: "mock-facilitator"
  },
  routes: [
    {
      pathPrefix: "/paid-search",
      merchantId: "mcp_search",
      amountUsd: 0.018
    }
  ]
});
const settlementFetchCalls = [];
let settlementVerifierCalls = 0;
const settlementHandler = createAllowGatewayHandler({
  config: settlementConfig,
  policy: { ...DEFAULT_POLICY, spentTodayUsd: 0 },
  receipts: [],
  settlementVerifier: async ({ proof, expected }) => {
    settlementVerifierCalls += 1;
    return {
      valid:
        proof.proof === "settlement-ok" &&
        expected.merchantId === "mcp_search" &&
        expected.asset === "USDC" &&
        expected.receiptId.startsWith("allow_")
    };
  },
  fetchImpl: async (url, init) => {
    settlementFetchCalls.push({ url, init });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8"
      }
    });
  }
});

const missingSettlementGatewayRes = mockRes();
await settlementHandler(
  mockReq({
    headers: {
      "x-allow-nonce": "gateway-settlement-missing-001",
      "x-allow-metadata": "public request"
    }
  }),
  missingSettlementGatewayRes
);

assert.equal(missingSettlementGatewayRes.state.status, 402);
assert.equal(settlementFetchCalls.length, 0);
assert.equal(JSON.parse(missingSettlementGatewayRes.state.body.toString()).error, "ALLOW_SETTLEMENT_REQUIRED");

const settledGatewayRes = mockRes();
await settlementHandler(
  mockReq({
    headers: {
      "x-allow-nonce": "gateway-settlement-ok-001",
      "x-allow-metadata": "public request",
      "x-allow-settlement-proof": "settlement-ok",
      "x-allow-settlement-chain": "Base",
      "x-allow-settlement-asset": "USDC",
      "x-allow-settlement-amount-usd": "0.018",
      "x-allow-settlement-merchant": "mcp_search"
    }
  }),
  settledGatewayRes
);

assert.equal(settledGatewayRes.state.status, 200);
assert.equal(settlementFetchCalls.length, 1);
assert.equal(settlementVerifierCalls, 1);
assert.deepEqual(gatewayHealth(settlementConfig).settlement, {
  required: true,
  chain: "Base",
  asset: "USDC",
  proofHeader: "x-allow-settlement-proof",
  proofType: "mock-facilitator"
});

console.log("gateway tests passed");

function signedDemoPolicy(policyInput) {
  return {
    ...policyInput,
    controllerSignature: demoPolicySignature(policyFingerprint(policyInput))
  };
}
