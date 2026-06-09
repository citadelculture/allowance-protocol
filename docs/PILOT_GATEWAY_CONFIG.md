# Pilot Gateway Config

The pilot gateway config builder turns a passing pilot authorization into a gateway config draft for live preflight.

It is a handoff tool. It does not start the gateway, send merchant traffic, move funds, sign wallets, approve public claims, or count as pilot evidence.

## Command

```bash
npm run pilot-gateway-config -- ops/pilot_authorization_template.json ops/merchant_intake.example.json ops/interviews.json ops/pilot_gateway_payment_requirements_template.json
```

The command exits nonzero until the authorization passes and required x402 `paymentRequirements` match the authorized network.

## Output

The report includes:

- `authorization`: result from the merchant-approved pilot authorization validator
- `paymentRequirements`: x402 readiness summary without secrets
- `gatewayConfig`: a config shaped for `npm run live-pilot-preflight`
- `evidenceBoundary`: confirmation that no traffic, funds, wallet signatures, claims, or live listing changes happened

## Readiness

For x402 pilots, the config is `ready_for_live_pilot_preflight` only when:

- the pilot authorization passes against completed interview and validated intake evidence
- `paymentRequirements.network` matches the authorized pilot network
- `asset` and `payTo` are public 20-byte EVM addresses
- `amount` is a positive integer string in token base units
- the generated gateway config normalizes successfully

Missing or invalid payment requirements produce a useful draft, but `merchantApproval.approved` remains false so the live preflight cannot pass accidentally.
