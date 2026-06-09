import assert from "node:assert/strict";
import { DEFAULT_POLICY } from "../src/policyEngine.mjs";
import { createAllowPreflightMiddleware, createPaidRoute } from "../src/httpMiddleware.mjs";

function mockReq(headers = {}, url = "/paid") {
  return { headers, url };
}

function mockRes() {
  const state = {
    status: null,
    headers: {},
    body: "",
    ended: false
  };

  return {
    state,
    setHeader(key, value) {
      state.headers[key.toLowerCase()] = String(value);
    },
    writeHead(status, headers) {
      state.status = status;
      for (const [key, value] of Object.entries(headers || {})) {
        state.headers[key.toLowerCase()] = String(value);
      }
    },
    end(chunk = "") {
      state.body += String(chunk);
      state.ended = true;
    }
  };
}

const allowReq = mockReq({
  "x-allow-merchant": "mcp_search",
  "x-allow-amount-usd": "0.018",
  "x-allow-resource": "/v1/search",
  "x-allow-nonce": "middleware-allow-001",
  "x-allow-metadata": "public request"
});
const allowRes = mockRes();
let nextCalled = false;

const middleware = createAllowPreflightMiddleware({
  policy: { ...DEFAULT_POLICY, spentTodayUsd: 0 }
});

const allowResult = await middleware(allowReq, allowRes, () => {
  nextCalled = true;
});

assert.equal(allowResult.status, 200);
assert.equal(nextCalled, true);
assert.equal(allowReq.allow.decision, "allow");
assert.equal(allowReq.allow.receipt.intentNonce, "middleware-allow-001");
assert.equal(allowRes.state.headers["x-allow-decision"], "allow");
assert.equal(allowRes.state.ended, false);

const denyReq = mockReq({
  "x-allow-merchant": "lead_graph",
  "x-allow-amount-usd": "0.35",
  "x-allow-resource": "/v1/leads",
  "x-allow-nonce": "middleware-deny-001",
  "x-allow-metadata": "email alex@example.com"
});
const denyRes = mockRes();
let denyNextCalled = false;
const denyResult = await middleware(denyReq, denyRes, () => {
  denyNextCalled = true;
});

assert.equal(denyResult.status, 402);
assert.equal(denyNextCalled, false);
assert.equal(denyReq.allow.decision, "deny");
assert.equal(denyRes.state.status, 402);
assert.equal(denyRes.state.headers["x-allow-decision"], "deny");
assert.equal(JSON.parse(denyRes.state.body).evaluation.reasons[0], "Payment metadata contains restricted data: email");

const paidRoute = createPaidRoute({
  policy: { ...DEFAULT_POLICY, spentTodayUsd: 0 },
  merchantId: "mcp_search",
  amountUsd: 0.018,
  resourceFromRequest: () => "/api/demo/paid-search",
  metadataFromRequest: () => "public route",
  handler: (req, res) => {
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: true, receipt: req.allow.receipt.id }));
  }
});

const paidReq = mockReq({ "x-allow-nonce": "paid-route-001" }, "/api/demo/paid-search");
const paidRes = mockRes();
await paidRoute(paidReq, paidRes);

assert.equal(paidRes.state.status, 200);
assert.equal(paidReq.allow.decision, "allow");
assert.equal(JSON.parse(paidRes.state.body).ok, true);
assert.ok(JSON.parse(paidRes.state.body).receipt.startsWith("allow_"));

const blockedPaidRoute = createPaidRoute({
  policy: { ...DEFAULT_POLICY, spentTodayUsd: 0 },
  merchantId: "lead_graph",
  amountUsd: 0.35,
  metadataFromRequest: () => "alice@example.com",
  handler: () => {
    throw new Error("handler should not run");
  }
});

const blockedReq = mockReq({}, "/paid-leads");
blockedReq.headers["x-allow-nonce"] = "paid-route-blocked-001";
const blockedRes = mockRes();
const blockedResult = await blockedPaidRoute(blockedReq, blockedRes);

assert.equal(blockedResult.status, 402);
assert.equal(blockedReq.allow.decision, "deny");
assert.equal(blockedRes.state.status, 402);

const replayReceipts = [];
const replayRoute = createPaidRoute({
  policy: { ...DEFAULT_POLICY, spentTodayUsd: 0 },
  receipts: replayReceipts,
  merchantId: "mcp_search",
  amountUsd: 0.018,
  resourceFromRequest: () => "/api/demo/paid-search",
  metadataFromRequest: () => "public route",
  handler: (req, res) => {
    replayReceipts.push(req.allow.receipt);
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: true }));
  }
});

await replayRoute(mockReq({ "x-allow-nonce": "replay-001" }, "/paid"), mockRes());
const replayRes = mockRes();
const replayResult = await replayRoute(mockReq({ "x-allow-nonce": "replay-001" }, "/paid"), replayRes);

assert.equal(replayResult.status, 402);
assert.equal(JSON.parse(replayRes.state.body).evaluation.reasons[0], "Intent nonce already used for this policy");

let limitedCalls = 0;
const limitedRoute = createPaidRoute({
  policy: { ...DEFAULT_POLICY, spentTodayUsd: 0 },
  merchantId: "mcp_search",
  amountUsd: 0.018,
  rateLimit: {
    max: 1,
    windowMs: 60_000
  },
  rateLimitKeyFromRequest: () => "paid-route-limit",
  metadataFromRequest: () => "public route",
  handler: (_req, res) => {
    limitedCalls += 1;
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: true }));
  }
});

await limitedRoute(mockReq({ "x-allow-nonce": "limited-route-001" }, "/limited"), mockRes());
const limitedRes = mockRes();
const limitedResult = await limitedRoute(mockReq({ "x-allow-nonce": "limited-route-002" }, "/limited"), limitedRes);

assert.equal(limitedCalls, 1);
assert.equal(limitedResult.status, 429);
assert.equal(limitedRes.state.status, 429);
assert.equal(limitedRes.state.headers["x-allow-rate-limit"], "1");
assert.equal(JSON.parse(limitedRes.state.body).error, "ALLOW_RATE_LIMIT_EXCEEDED");

let settlementHandlerCalls = 0;
let settlementVerifierCalls = 0;
const settlementRoute = createPaidRoute({
  policy: { ...DEFAULT_POLICY, spentTodayUsd: 0 },
  merchantId: "mcp_search",
  amountUsd: 0.018,
  settlement: {
    required: true,
    chain: "Base",
    asset: "USDC",
    proofType: "mock-facilitator"
  },
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
  metadataFromRequest: () => "public route",
  handler: (req, res) => {
    settlementHandlerCalls += 1;
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: true, settlement: req.allowSettlement.valid }));
  }
});

const missingSettlementRes = mockRes();
const missingSettlement = await settlementRoute(
  mockReq({ "x-allow-nonce": "settlement-missing-001" }, "/settlement"),
  missingSettlementRes
);

assert.equal(missingSettlement.status, 402);
assert.equal(settlementHandlerCalls, 0);
assert.equal(JSON.parse(missingSettlementRes.state.body).error, "ALLOW_SETTLEMENT_REQUIRED");

const settledRes = mockRes();
const settledReq = mockReq(
  {
    "x-allow-nonce": "settlement-ok-001",
    "x-allow-settlement-proof": "settlement-ok",
    "x-allow-settlement-chain": "Base",
    "x-allow-settlement-asset": "USDC",
    "x-allow-settlement-amount-usd": "0.018",
    "x-allow-settlement-merchant": "mcp_search"
  },
  "/settlement"
);
await settlementRoute(settledReq, settledRes);

assert.equal(settledReq.allowSettlement.valid, true);
assert.equal(settledRes.state.status, 200);
assert.equal(settlementHandlerCalls, 1);
assert.equal(settlementVerifierCalls, 1);
assert.equal(JSON.parse(settledRes.state.body).settlement, true);

console.log("httpMiddleware tests passed");
