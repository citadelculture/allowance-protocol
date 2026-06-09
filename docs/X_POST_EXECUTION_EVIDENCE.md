# X Post Execution Evidence

X post execution evidence is the post-publication audit record for one approved `x_post` external action.

Run:

```bash
npm run x-post-execution-evidence -- ops/x_post_execution_template.json
```

The template exits nonzero until it includes:

- the final approved `x_post` external-action packet
- `approvalRef` pointing to that packet id
- exact posted text matching the approval packet
- the approved X account handle
- the public X/Twitter status URL
- redacted proof, such as a permalink or screenshot reference
- human execution flags with automation disabled

## Boundary

This command does not post to X, approve the external action, change launch metrics, send outreach, sign wallet payloads, move funds, or store secrets. It only validates the evidence record created after a human posts.

After validation passes, build local previews before appending the record to `ops/x_post_execution_records.json`:

```bash
npm run execution-evidence-ledger-entry -- <filled-x-post-evidence.json>
npm run state-update-preview -- work/execution-evidence-ledger-entry.json
npm run canonical-update-set -- work/execution-evidence-ledger-entry.json work/state-update-preview.json
npm run x-post-state -- ops/x_post_execution_records.json
```

That reconciler is the gate for marking a launch post as posted or citing the public post in an evidence bundle.
