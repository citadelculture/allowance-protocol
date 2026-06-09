// Example: wrap an agent's fetch with an Allow Protocol allowance.
//
//   node examples/allow-fetch-client.mjs
//
// A mock x402 server demands 0.018 USDC for /search and 5 USDC for /swap.
// The allowance lets the cheap, on-policy call through and blocks the
// expensive off-policy one BEFORE any payment is signed. No network, no keys.

import {
  createAllowFetch,
  AllowancePaymentBlockedError,
  PAYMENT_HEADER,
  createX402Payer,
  createJsonlReceiptStore,
  loadReceiptRecords
} from "../src/index.mjs";
import { privateKeyToAccount } from "viem/accounts";

// --- a stand-in x402 upstream (replace with the real internet) --------------
const MERCHANT_ADDR = "0x000000000000000000000000000000000000beef";
const DEX_ADDR = "0x000000000000000000000000000000000000dead";
const PRICES = {
  "/search": { payTo: MERCHANT_ADDR, amount: "18000", merchant: "mcp_search" }, // $0.018
  "/swap": { payTo: DEX_ADDR, amount: "5000000", merchant: "wallet_swapper" } // $5.00, off-policy
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
const receiptLog = new URL("../ops/allow-fetch-example-receipts.local.jsonl", import.meta.url).pathname;
const allowFetch = createAllowFetch({
  fetchImpl: mockFetch,
  policy: { spentTodayUsd: 0 }, // controller-signed allowance; uses sane demo defaults
  resolveMerchant: (req) => (req.payTo === MERCHANT_ADDR ? "mcp_search" : "wallet_swapper"),
  // Real x402 signer (USDC EIP-3009). Throwaway demo key; reached ONLY after the
  // allowance approves the payment — and it carries its own hard ceiling.
  pay: createX402Payer({
    account: privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"),
    perTxCapUnits: 1_500_000n // 1.50 USDC: the signer refuses anything above this, policy or not
  }),
  // Persist every decision — denied payments are evidence too.
  receiptStore: createJsonlReceiptStore(receiptLog),
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

const persisted = await loadReceiptRecords(receiptLog);
console.log(`\nReceipts in memory: ${allowFetch.receipts.length} (allowed payments only — the replay window).`);
console.log(`Decisions persisted: ${persisted.length} -> ${receiptLog}`);
for (const record of persisted.slice(-2)) {
  const why = record.reasons?.[0] ? ` — ${record.reasons[0]}` : "";
  console.log(`  ${record.decision.toUpperCase()} ${record.receipt?.merchantId} $${record.receipt?.amountUsd}${why}`);
}
