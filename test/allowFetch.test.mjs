import assert from "node:assert/strict";
import {
  createAllowFetch,
  AllowancePaymentBlockedError,
  parseX402Challenge,
  amountUsdFromRequirements,
  requirementsToIntent,
  PAYMENT_HEADER
} from "../src/allowFetch.mjs";

// A mock upstream that demands payment (402) until it sees an X-PAYMENT header.
function mockUpstream({ requirements, onPaid } = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, init });
    const paymentHeader = init.headers?.[PAYMENT_HEADER];
    if (!paymentHeader) {
      return new Response(JSON.stringify({ x402Version: 1, accepts: [requirements] }), {
        status: 402,
        headers: { "content-type": "application/json" }
      });
    }
    if (onPaid) onPaid(paymentHeader);
    return new Response(JSON.stringify({ ok: true, data: "premium result" }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };
  return { fetchImpl, calls };
}

const usdcRequirements = {
  scheme: "exact",
  network: "base",
  asset: "0xUSDC",
  payTo: "0xMerchant",
  maxAmountRequired: "18000", // 0.018 USDC at 6 decimals
  extra: { decimals: 6 }
};

// --- pure helpers -----------------------------------------------------------

assert.equal(amountUsdFromRequirements(usdcRequirements), 0.018, "USDC atomic units map to USD");
assert.deepEqual(
  parseX402Challenge({ x402Version: 1, accepts: [usdcRequirements] }).accepts[0].payTo,
  "0xMerchant"
);
assert.equal(parseX402Challenge({ nope: true }), null, "non-x402 body returns null");

const intent = requirementsToIntent(usdcRequirements, {
  url: "https://api.example.com/search",
  resolveMerchant: () => "mcp_search",
  intentNonce: "n-1"
});
assert.equal(intent.merchantId, "mcp_search");
assert.equal(intent.amountUsd, 0.018);
assert.equal(intent.resource, "https://api.example.com/search");

// --- requirement selection prefers exact-scheme on known networks ------------

{
  const { selectPaymentRequirements } = await import("../src/allowFetch.mjs");
  const exotic = { scheme: "exact", network: "tron", payTo: "0xExotic", maxAmountRequired: "1" };
  const baseExact = { scheme: "exact", network: "base", payTo: "0xBase", maxAmountRequired: "2" };
  assert.equal(
    selectPaymentRequirements([exotic, baseExact]),
    baseExact,
    "server ordering cannot steer payment onto an unknown network"
  );
  assert.equal(selectPaymentRequirements([exotic]), exotic, "falls back to first when nothing matches");
  assert.equal(
    selectPaymentRequirements([exotic, baseExact], () => exotic),
    exotic,
    "explicit selectRequirements still wins"
  );
}

// --- allowed payment flows through and records a receipt --------------------

{
  const { fetchImpl, calls } = mockUpstream({ requirements: usdcRequirements });
  let paid = "";
  const af = createAllowFetch({
    fetchImpl,
    policy: { spentTodayUsd: 0 },
    resolveMerchant: () => "mcp_search",
    intentNonce: "nonce-allowed-1",
    pay: async () => {
      paid = "PAYMENT_PAYLOAD";
      return paid;
    }
  });

  const res = await af("https://api.example.com/search");
  const body = await res.json();
  assert.equal(res.status, 200, "allowed payment retries and settles");
  assert.equal(body.data, "premium result");
  assert.equal(calls.length, 2, "one 402, one paid retry");
  assert.equal(calls[1].init.headers[PAYMENT_HEADER], "PAYMENT_PAYLOAD");
  assert.equal(af.receipts.length, 1, "allowed payment records a receipt");
  assert.equal(af.receipts[0].decision, "allow");
}

// --- off-policy merchant is blocked before paying ---------------------------

{
  const { fetchImpl, calls } = mockUpstream({ requirements: usdcRequirements });
  let payCalled = false;
  const af = createAllowFetch({
    fetchImpl,
    policy: { spentTodayUsd: 0 },
    // Resolve to a merchant the policy does NOT allow (trading category, off-list).
    resolveMerchant: () => "wallet_swapper",
    intentNonce: "nonce-blocked-1",
    pay: async () => {
      payCalled = true;
      return "SHOULD_NOT_HAPPEN";
    }
  });

  await assert.rejects(
    () => af("https://api.example.com/swap"),
    (err) => {
      assert.ok(err instanceof AllowancePaymentBlockedError);
      assert.equal(err.code, "ALLOW_PAYMENT_BLOCKED");
      assert.equal(err.decision, "deny");
      return true;
    },
    "off-policy merchant must be blocked"
  );
  assert.equal(payCalled, false, "pay() must never be called for a blocked payment");
  assert.equal(calls.length, 1, "only the initial 402 request was made");
}

// --- over per-tx cap is blocked --------------------------------------------

{
  const bigRequirements = { ...usdcRequirements, maxAmountRequired: "5000000" }; // $5 > $1.50 cap
  const { fetchImpl } = mockUpstream({ requirements: bigRequirements });
  const af = createAllowFetch({
    fetchImpl,
    policy: { spentTodayUsd: 0 },
    resolveMerchant: () => "mcp_search",
    intentNonce: "nonce-cap-1",
    pay: async () => "SHOULD_NOT_HAPPEN"
  });
  await assert.rejects(() => af("https://api.example.com/search"), AllowancePaymentBlockedError);
}

// --- caller headers survive the paid retry, including Headers instances -----

{
  const seen = [];
  const fetchImpl = async (url, init = {}) => {
    const headers = new Headers(init.headers || {});
    seen.push(headers);
    if (!headers.get(PAYMENT_HEADER)) {
      return new Response(JSON.stringify({ x402Version: 1, accepts: [usdcRequirements] }), {
        status: 402,
        headers: { "content-type": "application/json" }
      });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
  const af = createAllowFetch({
    fetchImpl,
    policy: { spentTodayUsd: 0 },
    resolveMerchant: () => "mcp_search",
    intentNonce: "nonce-headers-1",
    pay: async () => "PAYMENT"
  });
  const res = await af("https://api.example.com/search", {
    headers: new Headers({ authorization: "Bearer agent-token", "x-trace": "t-1" })
  });
  assert.equal(res.status, 200);
  const retry = seen[1];
  assert.equal(retry.get("authorization"), "Bearer agent-token", "Headers-instance auth survives the retry");
  assert.equal(retry.get("x-trace"), "t-1", "custom header survives the retry");
  assert.equal(retry.get(PAYMENT_HEADER), "PAYMENT");
}

// --- malformed atomic amounts deny instead of throwing TypeError ------------

{
  assert.ok(Number.isNaN(amountUsdFromRequirements({ maxAmountRequired: "0.01" })), "decimal atomic amount is NaN");
  const badRequirements = { ...usdcRequirements, maxAmountRequired: "0.01" };
  const { fetchImpl } = mockUpstream({ requirements: badRequirements });
  const af = createAllowFetch({
    fetchImpl,
    policy: { spentTodayUsd: 0 },
    resolveMerchant: () => "mcp_search",
    intentNonce: "nonce-malformed-1",
    pay: async () => "SHOULD_NOT_HAPPEN"
  });
  await assert.rejects(
    () => af("https://api.example.com/search"),
    AllowancePaymentBlockedError,
    "malformed amount is a policy deny, not a crash"
  );
}

// --- every decision reaches the receipt store, including denials -------------

{
  const stored = [];
  const store = { record: async (entry) => stored.push(entry) };
  const { fetchImpl } = mockUpstream({ requirements: usdcRequirements });
  const af = createAllowFetch({
    fetchImpl,
    policy: { spentTodayUsd: 0 },
    resolveMerchant: () => "mcp_search",
    intentNonce: "nonce-store-allow",
    receiptStore: store,
    pay: async () => "PAYMENT"
  });
  await af("https://api.example.com/search");
  assert.equal(stored.length, 1);
  assert.equal(stored[0].decision, "allow");

  const denied = createAllowFetch({
    fetchImpl: mockUpstream({ requirements: usdcRequirements }).fetchImpl,
    policy: { spentTodayUsd: 0 },
    resolveMerchant: () => "unknown_merchant_xyz",
    intentNonce: "nonce-store-deny",
    receiptStore: store,
    pay: async () => "SHOULD_NOT_HAPPEN"
  });
  await assert.rejects(() => denied("https://api.example.com/search"), AllowancePaymentBlockedError);
  assert.equal(stored.length, 2, "denied decision was persisted too");
  assert.equal(stored[1].decision, "deny");
}

// --- receipt store failures never block or trigger payment -------------------

{
  const errors = [];
  const { fetchImpl } = mockUpstream({ requirements: usdcRequirements });
  const af = createAllowFetch({
    fetchImpl,
    policy: { spentTodayUsd: 0 },
    resolveMerchant: () => "mcp_search",
    intentNonce: "nonce-store-fail",
    receiptStore: { record: async () => { throw new Error("disk full"); } },
    onReceiptError: (err) => errors.push(err.message),
    pay: async () => "PAYMENT"
  });
  const res = await af("https://api.example.com/search");
  assert.equal(res.status, 200, "payment flow survives a persistence failure");
  assert.deepEqual(errors, ["disk full"], "failure surfaced via onReceiptError");
}

// --- stream bodies fail loudly instead of retrying empty ---------------------

{
  const { fetchImpl } = mockUpstream({ requirements: usdcRequirements });
  const af = createAllowFetch({
    fetchImpl,
    policy: { spentTodayUsd: 0 },
    resolveMerchant: () => "mcp_search",
    intentNonce: "nonce-stream-1",
    pay: async () => "PAYMENT"
  });
  const stream = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode("{}")); c.close(); } });
  await assert.rejects(
    () => af("https://api.example.com/search", { method: "POST", body: stream, duplex: "half" }),
    /cannot retry a ReadableStream body/,
    "consumed stream bodies are rejected before payment"
  );

  // String bodies remain retryable.
  const ok = await af("https://api.example.com/search", { method: "POST", body: "{\"q\":\"x\"}" });
  assert.equal(ok.status, 200, "reusable bodies still settle");
}

// --- non-402 responses pass straight through --------------------------------

{
  const fetchImpl = async () =>
    new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
  const af = createAllowFetch({ fetchImpl });
  const res = await af("https://api.example.com/free");
  assert.equal(res.status, 200, "non-402 passes through untouched");
}

console.log("allowFetch tests passed");
