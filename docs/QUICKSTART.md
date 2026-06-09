# Quickstart for Agent Builders

Give your agent a spending allowance in ~10 lines. Works against the live
protocol on Base mainnet today.

## 1. Install

Not yet on npm — install from git:

```bash
npm install github:citadelculture/allowance-protocol
```

(Or clone and `npm install` to run the examples in this repo.)

## 2. Wrap your agent's fetch

```js
import { createAllowFetch } from "allow-protocol/allow-fetch";
import { createX402Payer } from "allow-protocol/x402-payer";
import { createJsonlReceiptStore } from "allow-protocol/receipts";
import { privateKeyToAccount } from "viem/accounts";

const fetch = createAllowFetch({
  policy: {                                   // your allowance
    perTxCapUsd: 1.5,
    dailyCapUsd: 25,
    allowedMerchants: ["mcp_search", "vector_cloud"]
  },
  resolveMerchant: (req) => merchantFor(req.payTo),
  pay: createX402Payer({
    account: privateKeyToAccount(process.env.AGENT_KEY),
    perTxCapUnits: 1_500_000n                 // signer's own hard ceiling (1.50 USDC)
  }),
  receiptStore: createJsonlReceiptStore("agent-receipts.jsonl")
});
```

Use it like normal `fetch`. Both x402 transports are supported — v1 JSON-body
challenges and v2 `PAYMENT-REQUIRED` header challenges with CAIP-2 network
ids — live-verified against the reference server at x402.org. When a server
answers HTTP 402 (x402), the
allowance is checked **before** any payment is signed. Off-policy, over-cap,
PII-leaking, or replayed payments throw `AllowancePaymentBlockedError` and
never reach the signer. Every decision — allowed and denied — lands in your
receipt log with its reason.

## 3. See it run (no keys, no network)

```bash
npm run demo                 # policy engine vs 5 agent payment attempts
npm run example:allow-fetch  # full wrapped-fetch flow against a mock x402 server
```

## 4. The live registry (Base mainnet)

The no-custody `AllowanceRegistry` is live with real usage:

```bash
npm run example:live-registry   # read the live policy, remaining allowance, receipts
npm run live-proof              # verify everything: usage, enforcement, bytecode
```

Anchor your own receipts in three commands:

```bash
npm run new-policy-intent -- --controller 0x<yourWallet> --per-tx-usd 1.5 --epoch-usd 25
npm run send-registry-intent -- work/registry/my-policy.report.json    # from the controller wallet
npm run receipt-anchor-intent -- agent-receipts.jsonl <policyId>       # then send-registry-intent again
```

Replays, over-cap amounts, and unknown merchants revert onchain — run
`npm run live-proof` yourself.

## Status

Prototype: not audited, registry ABI may change, no token. The policy
engine, signer guards, and receipt pipeline are tested (97 test files) and
the live deployment is byte-for-byte reproducible from source.
