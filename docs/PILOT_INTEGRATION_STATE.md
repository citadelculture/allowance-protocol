# Pilot Integration State

Pilot integration state reconciles `ops/prospects.json`, `ops/merchant_directory.json`, human pilot execution records, and gateway receipt logs.

```bash
npm run pilot-integration-state
npm run pilot-integration-state -- ops/pilot_traffic_execution_records.json ops/gateway-receipts.mainnet.jsonl
```

The execution records file is a JSON array. Each item must pass `npm run pilot-traffic-execution-evidence`.

The report fails closed when:

- a prospect uses an unknown `integrationStatus`
- `integrationStatus: "integrated"` has no merchant id
- an integrated prospect references a merchant missing from the directory
- an integrated prospect has no valid `allowed_delivery` execution evidence
- an integrated prospect has no valid `denied_guard` execution evidence
- an integrated prospect does not have a passing `npm run pilot-report` result for merchant-approved testnet or mainnet receipts
- a directory merchant with `status: "live"` lacks both execution evidence steps and full pilot receipt evidence
- a pilot execution record is duplicated, unapproved, secret-bearing, or not backed by matching receipt ids

`pilot_ready` does not require receipts. It means the merchant profile is ready for controlled preflight and pilot execution. `live` and `integrated` are post-evidence states.

Boundary:

- does not start pilot traffic
- does not approve external actions
- does not move funds
- does not sign wallet payloads
- does not store secrets
- does not mark prospects integrated
- does not mark merchants live
- does not approve public claims
- does not unlock token work
