# State Update Preview

The state update preview turns a valid execution evidence ledger-entry preview into a local diff for the canonical state file.

```bash
npm run state-update-preview -- work/execution-evidence-ledger-entry.json
```

Supported action types:

- `x_post` -> previews changes to `launch/x_posts.json`
- `merchant_outreach` -> previews changes to `ops/prospects.json`

The command writes `work/state-update-preview.json` by default. It reads the append preview created by `npm run execution-evidence-ledger-entry`, runs the matching state reconciler, and records the changed item ids and fields.

## Flow

1. Validate the filled execution evidence.
2. Build the local ledger append preview:

```bash
npm run execution-evidence-ledger-entry -- <filled-evidence.json>
```

3. Preview the canonical state change:

```bash
npm run state-update-preview -- work/execution-evidence-ledger-entry.json
```

4. Build the local canonical update set:

```bash
npm run canonical-update-set -- work/execution-evidence-ledger-entry.json work/state-update-preview.json
```

5. Review the changed fields in `work/state-update-preview.json` and the file hashes in `work/canonical-update-set.json`.
6. Append the validated record to the matching canonical ledger only after review.
7. Apply only the previewed canonical state changes.
8. Re-run the matching state validator:

```bash
npm run x-post-state -- ops/x_post_execution_records.json
npm run outreach-state -- ops/outreach_execution_records.json
```

## Statuses

- `ready_to_apply`: the preview is valid and contains canonical state changes.
- `no_state_changes`: the preview is valid and the canonical state is already aligned with the evidence projection.
- `needs_state_fixes`: the ledger-entry preview or state reconciler failed.
- `unsupported_action_type`: the action type is not supported by this preview tool.

## Safety Boundary

This tool does not post content, send outreach, schedule interviews, sign wallet payloads, deploy contracts, run pilot traffic, move funds, store secrets, approve external actions, append canonical ledgers, mutate canonical state, mark evidence executed, or enable tokens.

It only writes a local review preview under `work/`.
