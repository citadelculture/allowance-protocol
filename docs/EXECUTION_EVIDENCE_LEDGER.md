# Execution Evidence Ledger Entry

The execution evidence ledger-entry tool validates a filled post-execution evidence file and builds a local append preview for the matching evidence ledger.

```bash
npm run execution-evidence-ledger-entry -- <filled-evidence.json>
```

Supported evidence types:

- `x_post` -> `ops/x_post_execution_records.json`
- `merchant_outreach` -> `ops/outreach_execution_records.json`

The command writes `work/execution-evidence-ledger-entry.json` by default. That file contains the validated record and an append preview, but the command does not mutate the canonical `ops/*_execution_records.json` ledger.

## Flow

1. Approve exactly one external-action packet.
2. Have the human perform exactly the approved action.
3. Fill the matching execution evidence template.
4. Validate the evidence:

```bash
npm run x-post-execution-evidence -- <filled-x-post-evidence.json>
npm run outreach-execution-evidence -- <filled-outreach-evidence.json>
```

5. Build the append preview:

```bash
npm run execution-evidence-ledger-entry -- <filled-evidence.json>
```

6. Preview the canonical state diff:

```bash
npm run state-update-preview -- work/execution-evidence-ledger-entry.json
```

7. Build the local canonical update set:

```bash
npm run canonical-update-set -- work/execution-evidence-ledger-entry.json work/state-update-preview.json
```

8. Append the validated record to the canonical ledger only after reviewing the update set.
9. Apply only the previewed canonical state changes.
10. Re-run the matching state validator:

```bash
npm run x-post-state -- ops/x_post_execution_records.json
npm run outreach-state -- ops/outreach_execution_records.json
```

## Safety Boundary

This tool does not post content, send outreach, schedule interviews, sign wallet payloads, deploy contracts, run pilot traffic, move funds, store secrets, approve external actions, append canonical ledgers, mark evidence executed, or enable tokens.

It only turns already validated evidence into an appendable local record and checks for duplicate evidence ids in the existing ledger.
