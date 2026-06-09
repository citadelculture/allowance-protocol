# Settlement Proofs

Allow policy approval is not the same thing as payment settlement.

Paid routes and gateways can require a settlement proof before content is delivered upstream. When settlement is required, Allow fails closed unless an injected verifier accepts the proof.

For x402 routes, use `src/x402Facilitator.mjs` or the gateway runner's `ALLOW_X402_*` environment variables to verify `PAYMENT-SIGNATURE` with a facilitator.

## Route Config

```js
const paidRoute = createPaidRoute({
  policy,
  merchantId: "mcp_search",
  amountUsd: 0.018,
  settlement: {
    required: true,
    chain: "Base",
    asset: "USDC",
    proofType: "x402-facilitator"
  },
  settlementVerifier: async ({ proof, expected }) => {
    return verifyWithFacilitator(proof, expected);
  },
  handler
});
```

## Gateway Config

```json
{
  "settlement": {
    "required": true,
    "chain": "Base",
    "asset": "USDC",
    "proofType": "x402-facilitator",
    "paymentRequirements": {
      "scheme": "exact",
      "network": "eip155:84532",
      "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      "amount": "1000",
      "payTo": "0x122F8Fcaf2152420445Aa424E1D8C0306935B5c9",
      "maxTimeoutSeconds": 60,
      "extra": {
        "name": "USDC",
        "version": "2"
      }
    }
  },
  "routes": [
    {
      "pathPrefix": "/paid-search",
      "merchantId": "mcp_search",
      "amountUsd": 0.018
    }
  ]
}
```

## Proof Headers

- `x-allow-settlement-proof`
- `x-allow-settlement-proof-type`
- `x-allow-settlement-chain`
- `x-allow-settlement-asset`
- `x-allow-settlement-amount-usd`
- `x-allow-settlement-merchant`
- `x-allow-settlement-policy`
- `x-allow-settlement-receipt`
- `x-allow-settlement-nonce`
- `x-allow-settlement-tx`
- `PAYMENT-SIGNATURE`

`PAYMENT-SIGNATURE` is the current x402 payment payload header. `x-payment` and selected `x-payment-*` headers are parsed as older local compatibility inputs, but production verification must be delegated to a real facilitator or audited settlement verifier.

## Failure Rule

If settlement is required and proof is missing, mismatched, or rejected:

- paid route handlers do not run
- gateway upstream requests are not made
- the request returns `402`
- no delivery receipt is recorded as pilot evidence

This prevents policy approval from being confused with completed settlement.

## Registry Receipts

Settlement proof verification is still separate from public receipt recording. When a merchant-approved receipt is ready for the `AllowanceRegistry`, generate a dry-run packet with `npm run receipt-registry-intent` and follow `docs/RECEIPT_REGISTRY_INTENTS.md` before any human sends an onchain transaction.
