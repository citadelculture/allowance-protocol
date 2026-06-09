# Canonical Update Set

The canonical update set combines a valid ledger-entry preview and a valid state-update preview into one local review packet for the exact JSON files that would change.

```bash
npm run canonical-update-set -- work/execution-evidence-ledger-entry.json work/state-update-preview.json
```

Supported action types:

- `x_post` -> proposes updates to `ops/x_post_execution_records.json` and `launch/x_posts.json`
- `merchant_outreach` -> proposes updates to `ops/outreach_execution_records.json` and `ops/prospects.json`

The command writes `work/canonical-update-set.json` by default. It includes per-file before/after SHA-256 hashes, byte counts, changed state fields, and proposed JSON contents. It does not mutate the canonical ledger or state files.

## Flow

1. Validate the filled execution evidence.
2. Build the local ledger append preview:

```bash
npm run execution-evidence-ledger-entry -- <filled-evidence.json>
```

3. Build the local state update preview:

```bash
npm run state-update-preview -- work/execution-evidence-ledger-entry.json
```

4. Build the canonical update set:

```bash
npm run canonical-update-set -- work/execution-evidence-ledger-entry.json work/state-update-preview.json
```

5. Review `work/canonical-update-set.json`, especially file paths, hashes, and changed fields.
6. Apply only the reviewed ledger and state JSON changes.
7. Re-run the matching state validator:

```bash
npm run x-post-state -- ops/x_post_execution_records.json
npm run outreach-state -- ops/outreach_execution_records.json
```

## Freshness Checks

The update set fails if:

- the ledger-entry preview is invalid
- the state-update preview is invalid
- the state-update preview is the public redacted report instead of the full local JSON with `projectedState`
- the current canonical ledger no longer matches the ledger base used by the append preview
- the current canonical state no longer matches the base values recorded in the state preview
- the action type or target file paths do not match

## Safety Boundary

This tool does not post content, send outreach, schedule interviews, sign wallet payloads, deploy contracts, run pilot traffic, move funds, store secrets, approve external actions, append canonical ledgers, mutate canonical state, mark evidence executed, or enable tokens.

It only writes a local review packet under `work/`.
