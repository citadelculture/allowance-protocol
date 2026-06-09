// Example: wrap an agent's fetch with an Allow Protocol allowance.
//
//   node examples/allow-fetch-client.mjs
//
// A mock x402 server demands 0.018 USDC for /search and 5 USDC for /swap.
// The allowance lets the cheap, on-policy call through and blocks the
// expensive off-policy one BEFORE any payment is signed. No network, no keys.

import { createAllowFetch, AllowancePaymentBlockedError, PAYMENT_HEADER } from "../src/index.mjs";

// --- a stand-in x402 upstream (replace with the real internet) --------------
const PRICES = {
  "/search": { payTo: "0xMerchant", amount: "18000", merchant: "mcp_search" }, // $0.018
  "/swap": { payTo: "0xDex", amount: "5000000", merchant: "wallet_swapper" } // $5.00, off-policy
};

const mockFetch = async (url, init = {}) => {
  const path = new URL(url).pathname;
  const price = PRICES[path];
  if (!price) return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
  if (!init.headers?.[PAYMENT_HEADER]) {
    return new Response(
      JSON.stringify({
        x402Version: 1,
        accepts: [
          { scheme: "exact", network: "base", asset: "0xUSDC", payTo: price.payTo, maxAmountRequired: price.amount, extra: { decimals: 6 } }
        ]
      }),
      { status: 402, headers: { "content-type": "application/json" } }
    );
  }
  return new Response(JSON.stringify({ ok: true, path, data: "premium result" }), { status: 200 });
};

// --- the integration: this is the whole thing ------------------------------
const allowFetch = createAllowFetch({
  fetchImpl: mockFetch,
  policy: { spentTodayUsd: 0 }, // controller-signed allowance; uses sane demo defaults
  resolveMerchant: (req) => (req.payTo === "0xMerchant" ? "mcp_search" : "wallet_swapper"),
  pay: async (requirements) => {
    // Your wallet signs the x402 payment here and returns the X-PAYMENT header.
    // Reached ONLY after the allowance approves the payment.
    return Buffer.from(JSON.stringify({ scheme: requirements.scheme, payTo: requirements.payTo })).toString("base64");
  },
  onDecision: ({ decision, intent }) => console.log(`  policy: ${decision.toUpperCase()} ${intent.merchantId} ($${intent.amountUsd})`)
});

for (const path of ["/search", "/swap"]) {
  console.log(`\nGET ${path}`);
  try {
    const res = await allowFetch(`https://api.example.com${path}`);
    const body = await res.json();
    console.log(`  -> ${res.status} paid; receipt ${res.allowReceipt?.id}`, body.data ? `(${body.data})` : "");
  } catch (err) {
    if (err instanceof AllowancePaymentBlockedError) {
      console.log(`  -> BLOCKED before payment: ${err.reasons[0]}`);
    } else {
      throw err;
    }
  }
}

console.log(`\nReceipts recorded: ${allowFetch.receipts.length} (only allowed payments).`);
