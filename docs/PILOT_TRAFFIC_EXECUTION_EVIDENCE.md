# Pilot Traffic Execution Evidence

Pilot traffic execution evidence is the post-run audit record for one approved `live_pilot` request.

Use it after a human has executed one approved packet from `npm run pilot-traffic-action-pack`.

## Command

```bash
npm run pilot-traffic-execution-evidence -- ops/pilot_traffic_execution_template.json <receipt-log-path>
```

The template exits nonzero until it includes:

- the final approved `live_pilot` external-action packet
- the matching approval reference
- the human executor, execution time, and approved command template
- a redacted command/proof reference with no payment signature, bearer token, API key, private key, or seed material
- the private receipt log path and receipt ids created by that execution
- safety flags confirming merchant-approved scope, no extra requests, no custody, private receipts, and no public claims

## Receipt Expectations

For `allowed_delivery`, the selected receipt must be merchant-approved testnet or mainnet evidence with:

- matching merchant id
- `decision: "allow"`
- a successful `2xx` upstream status

For `denied_guard`, the selected receipt must be merchant-approved testnet or mainnet evidence with:

- matching merchant id
- `decision: "deny"`
- no successful upstream delivery

This validates one executed request. The full pilot still requires both allowed and denied records, then:

```bash
npm run pilot-report -- <receipt-log-path>
npm run pilot-integration-state -- ops/pilot_traffic_execution_records.json <receipt-log-path>
```

The validator does not run traffic, move funds, approve public claims, mark merchants live, or unlock token work.
