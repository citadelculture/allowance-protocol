# External Action Workspace

The external action workspace writes the current ready-for-review external action packets into local draft files.

```bash
npm run external-action-workspace
```

By default this creates:

- `work/external-action-workspace/manifest.json`
- `work/external-action-workspace/REVIEW_CHECKLIST.md`
- `work/external-action-workspace/packets/*.draft.json`
- `work/external-action-workspace/evidence/*.template.json`

The packet files are intentionally still drafts. They keep `status: "draft"`, empty approval attribution, and false approval flags. The command does not approve, post, send, sign, deploy, start pilot traffic, promote merchants, move funds, store secrets, or use private keys.

The evidence templates are intentionally incomplete. They prefill references, exact text, destination, and draft packet context, but they keep human execution fields and proof fields empty or false. They must fail until the corresponding action has been approved, executed by a human, and backed by redacted proof.

## Audit

Before review, verify the workspace files still match the manifest and remain unapproved:

```bash
npm run external-action-workspace-audit
```

The audit is read-only. It recomputes each packet and evidence-template hash, checks byte counts, flags missing or unexpected files, confirms draft packets still have false approval flags, and confirms evidence templates still fail before human execution proof exists. If the audit fails, regenerate the workspace before using any packet for approval review.

## Review Brief

After the audit passes, generate a concise local brief for human review:

```bash
npm run external-action-review-brief
```

By default this writes `work/external-action-review-brief.md`. The brief lists each draft packet, destination, exact action text, approval command, matching evidence template, blocked future actions, and the safety boundary. It depends on the audit and fails if the workspace has been changed into an unsafe or unverified state. It does not approve, post, send, sign, deploy, start pilot traffic, promote merchants, move funds, or store secrets.

## Approval Runbook

After the review brief is valid, generate a per-action execution-safe checklist:

```bash
npm run approval-runbook
npm run approval-preflight
npm run approval-request
npm run approval-decision-template
npm run approval-decision -- <approved-decision.json> --require-approved
npm run approval-packet-preview -- <approved-decision.json> <approved-packet.preview.json>
```

By default the runbook writes `work/approval-runbook.md`, the preflight writes `work/approval-preflight.md`, the approval request writes `work/approval-request.md`, and the decision template writes `work/approval-decision.template.json`. The decision validator reads the filled decision and current packet; the packet preview writes a separate approved packet copy only after a valid approved decision. Together they name the primary action, remaining approval flags, approval validator command, exact manual execution constraints, matching evidence template, evidence validator, current packet hash, and the post-evidence preview/update commands for X posts and outreach. They are guidance only: they do not approve, execute, mark evidence complete, update state, or make public claims.

## Approval Flow

1. Review the draft packet and exact action.
2. Generate `work/approval-decision.template.json`.
3. Keep `decision` as `pending` unless a real action-time approval or rejection is provided.
4. If approved, confirm the current packet bytes still match `packet.sha256`.
5. Run `npm run approval-decision -- <approved-decision.json> --require-approved`.
6. Run `npm run approval-packet-preview -- <approved-decision.json> <approved-packet.preview.json>`.
7. Use the preview file for final validation.
8. Run:

```bash
npm run external-action-approval -- <approved-packet.preview.json>
```

Only a passing final approval packet should be used for a human-executed external action.

## After Execution

After a human performs the exact approved action, collect evidence with the matching validator:

```bash
npm run x-post-execution-evidence -- ops/x_post_execution_template.json
npm run outreach-execution-evidence -- ops/outreach_execution_template.json
npm run controller-signing-execution-evidence -- ops/controller_signing_execution_template.json
npm run pilot-traffic-execution-evidence -- ops/pilot_traffic_execution_template.json <receipt-log-path>
```

For X posts and merchant outreach, build local ledger, state, and canonical update previews before editing any canonical JSON:

```bash
npm run execution-evidence-ledger-entry -- <filled-x-post-or-outreach-evidence.json>
npm run state-update-preview -- work/execution-evidence-ledger-entry.json
npm run canonical-update-set -- work/execution-evidence-ledger-entry.json work/state-update-preview.json
```

Do not update public state, merchant state, launch state, or usage claims until the post-execution evidence passes and the reviewed record is added to the matching ledger.

## Custom Output Directory

```bash
npm run external-action-workspace -- work/review-batch-001
```

The output directory is local project state for review and handoff. It is not a signal that any external action was approved or executed.
