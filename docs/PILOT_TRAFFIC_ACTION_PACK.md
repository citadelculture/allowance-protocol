# Pilot Traffic Action Pack

The pilot traffic action pack prepares the exact human-run requests after live pilot preflight passes.

It creates two draft `live_pilot` external-action packets:

- one allowed delivery request expected to produce a merchant-approved 2xx receipt
- one denied guard request expected to prove unsafe metadata is blocked

## Command

```bash
npm run pilot-traffic-action-pack -- ops/pilot_binding.template.json ops/signed-policy.local.json <authorized-gateway-config.json> ops/dispute_template.json
```

The command exits nonzero until live pilot preflight passes. It does not start the gateway, send requests, move funds, sign wallets, or count as pilot evidence.

## Execution Boundary

Every generated packet remains `draft` with approval flags set to `false`.

Before a human runs a request:

1. Fill `approvedBy`, `approvedAt`, and every approval flag.
2. Run `npm run external-action-approval -- <approved-live-pilot-packet.json>`.
3. Execute exactly the approved command.
4. Validate each executed request with `npm run pilot-traffic-execution-evidence`.
5. Validate the full receipt log with `npm run pilot-report -- <receipt-log-path>`.

The allowed request contains a placeholder `PAYMENT-SIGNATURE`; the human executor must obtain the real x402 payment payload from the approved agent wallet or facilitator and keep it out of evidence records. The denied request intentionally uses blocked metadata and should not reach upstream delivery.
