# Pilot Evidence Handoff

`npm run pilot-evidence-handoff` writes `work/pilot-evidence-handoff.md`, a local handoff for collecting the first merchant-approved pilot receipt evidence.

Run:

```sh
npm run pilot-evidence-handoff
```

The handoff packages:

- the live pilot action-pack command,
- the two required `live_pilot` approval commands,
- the allowed-delivery and denied-guard execution evidence commands,
- the final `pilot-report`, `pilot-disclosure`, and `pilot-integration-state` commands,
- the current preflight blockers and receipt evidence gaps.

The handoff is local review material only. It does not start pilot traffic, approve external actions, post content, send outreach, sign wallet payloads, deploy contracts, move funds, store secrets, promote merchants, approve public claims, or enable a token.

Live pilot evidence is complete only after:

- live pilot preflight passes,
- a human approves exactly one allowed-delivery packet,
- a human approves exactly one denied-guard packet,
- execution evidence validates for both requests,
- the same receipt log passes `npm run pilot-report`.

Useful environment overrides:

```sh
ALLOW_PILOT_BINDING_PATH=ops/pilot_binding.template.json
ALLOW_POLICY_PATH=ops/signed-policy.local.json
ALLOW_GATEWAY_CONFIG=ops/gateway.x402.example.json
ALLOW_DISPUTE_PACKET=ops/dispute_template.json
ALLOW_RECEIPT_LOG=ops/gateway-receipts.pilot.jsonl
ALLOW_PILOT_EVIDENCE_HANDOFF_PATH=work/pilot-evidence-handoff.md
```
