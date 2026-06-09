# x402 Facilitator Adapter

Allow can verify x402 payment signatures through a facilitator before paid delivery.

The adapter follows the current x402 facilitator shape:

- `POST /verify` verifies the payment payload against server payment requirements
- `POST /settle` optionally submits the payment for onchain settlement
- `GET /supported` is reserved for operator checks against supported schemes and networks

## Gateway Environment

Start from `ops/gateway.x402.example.json`, then replace `paymentRequirements` with the merchant-approved asset, amount, network, and pay-to address.

```bash
ALLOW_X402_FACILITATOR_URL="https://api.cdp.coinbase.com/platform/v2/x402" \
ALLOW_X402_FACILITATOR_TOKEN="..." \
ALLOW_X402_SETTLE=1 \
ALLOW_PRODUCTION=1 \
ALLOW_REQUIRE_AGENT_SIGNATURE=1 \
ALLOW_POLICY_PATH=/secure/allow-policy.json \
npm run gateway -- ops/gateway.x402.example.json
```

The gateway runner only injects the adapter when the gateway config uses `proofType: "x402-facilitator"` or when `ALLOW_X402_FACILITATOR_URL` is set.

## Smoke Test

Validate the gateway config without making a network request:

```bash
npm run x402-smoke -- ops/gateway.x402.example.json
```

The dry run checks x402 routes, payment requirements, and the facilitator request body using a synthetic payment payload.
It also reports `liveReadiness` for each route. Dry-run configs may remain valid while `liveReadiness.valid` is `false`.

Run a live verification only after the merchant approves the route requirements and a client supplies a real `PAYMENT-SIGNATURE`:

```bash
ALLOW_X402_LIVE=1 \
ALLOW_X402_FACILITATOR_URL="https://api.cdp.coinbase.com/platform/v2/x402" \
ALLOW_X402_FACILITATOR_TOKEN="..." \
ALLOW_X402_PAYMENT_SIGNATURE_PATH=/secure/payment-signature.txt \
npm run x402-smoke -- ops/gateway.x402.example.json
```

Add `ALLOW_X402_SETTLE=1` only when the live smoke is expected to call `/settle`.

Live smoke fails closed unless:

- route evidence is merchant-approved
- route evidence uses `testnet` or `mainnet`
- route evidence rail is `x402`
- `settlement.merchantApproval.approved` is `true`
- `settlement.merchantApproval.approvedAt` is a valid date
- `settlement.merchantApproval.source`, `evidenceRef`, or `approvalRef` is present
- the facilitator URL is non-local
- facilitator settlement is requested
- a facilitator token is configured, unless `settlement.facilitator.authRequired` is `false`
- the payment signature is not the synthetic dry-run payload

## Settlement Config

```json
{
  "settlement": {
    "required": true,
    "proofType": "x402-facilitator",
    "chain": "Base Sepolia",
    "asset": "USDC",
    "settle": true,
    "merchantApproval": {
      "approved": true,
      "merchantId": "mcp_search",
      "approvedAt": "2026-06-08",
      "source": "merchant-email:replace-with-real-approval"
    },
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
  }
}
```

`paymentRequirements` must come from the merchant-approved route configuration. Allow does not infer atomic token amounts from USD display amounts.
Do not add the `merchantApproval` block until the merchant has approved the exact asset, network, amount, and pay-to address.

## Request Header

Clients submit the x402 payment payload in:

```text
PAYMENT-SIGNATURE: <base64url JSON payment payload>
```

Allow also parses `x-payment` for older local compatibility, but production x402 routes should use the protocol header expected by the facilitator.

## Delivery Rule

With `required: true`, Allow fails closed unless:

- the Allow policy evaluation allows the request
- the x402 payment signature is present and parseable
- the configured payment requirements are present
- the facilitator returns a valid verification response
- if `ALLOW_X402_SETTLE=1` or `settle: true`, the facilitator returns successful settlement

Only then does the gateway forward to the upstream API.

## Custody Boundary

Allow does not custody funds or private keys. It forwards a client-signed payment payload to a configured facilitator and records only policy and delivery receipts.

## References

- https://docs.x402.org/core-concepts/client-server
- https://docs.cdp.coinbase.com/x402/core-concepts/facilitator
- https://docs.cdp.coinbase.com/api-reference/v2/rest-api/x402-facilitator/x402-facilitator
