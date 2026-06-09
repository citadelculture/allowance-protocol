# Pilot Evidence Provenance

Allow separates local demo activity from merchant-approved pilot evidence.

Every gateway receipt includes an `evidence` object:

```json
{
  "environment": "testnet",
  "merchantApproved": true,
  "rail": "x402",
  "network": "eip155:84532",
  "settlement": "facilitator",
  "label": "merchant-approved-base-sepolia-smoke"
}
```

## Environments

- `local`: demos, dry-runs, fixtures, and development traffic
- `testnet`: merchant-approved testnet pilots
- `mainnet`: merchant-approved production traffic

Unknown environment values are normalized to `local`.

## Readiness Rule

Internal metrics can count all receipts, but launch readiness only counts pilot evidence when:

- `environment` is `testnet` or `mainnet`
- `merchantApproved` is `true`
- the same merchant has at least one allowed receipt with a successful upstream response
- the same merchant has at least one denied receipt proving the guard can block unsafe intent
- at least one active agent id appears in credible receipts

This prevents local smoke tests from becoming public usage claims.

## Report Gate

```bash
npm run pilot-report -- ops/gateway-receipts.local.jsonl
```

The report exits nonzero until the receipt log has enough credible evidence for a pilot claim. Use `ALLOW_PILOT_MERCHANT_ID=...` to validate one merchant and `ALLOW_PILOT_MIN_ACTIVE_AGENTS=...` to raise the active-agent bar.

For local integration confidence before merchant traffic, run:

```bash
npm run gateway-smoke -- ops/gateway.example.json
```

This proves gateway allow/deny behavior but remains local evidence and does not satisfy pilot readiness.

Before any merchant-approved pilot traffic, run:

```bash
npm run live-pilot-preflight -- ops/pilot_binding.template.json ops/signed-policy.local.json ops/gateway.x402.example.json ops/dispute_template.json
```

This does not send traffic or move funds. It only verifies that signed policy, pilot binding, wallet-control proof, gateway evidence, settlement requirement, dispute support path, and runtime safety flags are aligned.

Then generate the two human approval packets for the allowed and denied pilot requests:

```bash
npm run pilot-traffic-action-pack -- ops/pilot_binding.template.json ops/signed-policy.local.json <authorized-gateway-config.json> ops/dispute_template.json
```

Each generated `live_pilot` packet must pass `npm run external-action-approval` after a human owner fills approval fields. Only then should the human run the exact command in the packet.

After each human-run request, validate the executed request against the approved packet and receipt ids:

```bash
npm run pilot-traffic-execution-evidence -- ops/pilot_traffic_execution_template.json <receipt-log-path>
```

This validates one request at a time. Run it for both the allowed delivery and denied guard request, then run `npm run pilot-report` for the full receipt log.

Before any public usage claim from pilot receipts, run:

```bash
npm run pilot-disclosure -- ops/pilot_disclosure_template.json ops/gateway-receipts.local.jsonl
```

This validates a redacted, merchant-approved disclosure packet. It fails closed on local receipts, missing merchant approval, overclaimed metrics, raw metadata, secret-looking text, or receipt ids that are not present in the selected log.

## Gateway Config

Local examples should stay labeled as local:

```json
{
  "evidence": {
    "environment": "local",
    "merchantApproved": false,
    "rail": "x402",
    "network": "eip155:84532",
    "label": "local-dry-run"
  }
}
```

Before a live pilot, replace the evidence block with the merchant-approved environment and network. Keep the receipt log private unless the merchant approves public disclosure.
