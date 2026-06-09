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

// --- non-402 responses pass straight through --------------------------------

{
  const fetchImpl = async () =>
    new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
  const af = createAllowFetch({ fetchImpl });
  const res = await af("https://api.example.com/free");
  assert.equal(res.status, 200, "non-402 passes through untouched");
}

console.log("allowFetch tests passed");
