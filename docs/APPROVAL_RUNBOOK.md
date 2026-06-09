# Approval Runbook

The approval runbook converts the audited external-action review brief into a local checklist for the next human-approved action.

```bash
npm run approval-runbook
```

By default it reads `work/external-action-workspace`, audits it through the external-action review brief, and writes `work/approval-runbook.md`.

The runbook is intentionally not an approval artifact. It does not approve packets, post to X, send outreach, schedule interviews, sign wallet payloads, deploy contracts, start pilot traffic, promote merchants, move funds, store secrets, update state, or enable tokens.

## Flow

1. Generate or refresh the local packet workspace.
2. Audit the workspace.
3. Generate the review brief.
4. Generate the approval runbook.
5. Run the approval preflight for the current external-action stage.
6. Generate the action-time approval request.
7. Generate the pending approval decision template bound to the packet hash.
8. Validate the filled action-time decision with `--require-approved` before editing the packet.
9. Derive a separate approved packet preview from the validated decision.
10. Pick exactly one action.
11. Fill the final approval packet only after action-time review.
12. Run the external-action approval validator.
13. Execute the approved action manually.
14. Fill and validate the matching post-execution evidence template.
15. For X posts and outreach, build the ledger-entry preview, state-update preview, and canonical update set.
16. Reconcile the matching state surface only after evidence passes and the update set has been reviewed.

```bash
npm run external-action-workspace
npm run external-action-workspace-audit
npm run external-action-review-brief
npm run approval-runbook
npm run approval-preflight
npm run approval-request
npm run approval-decision-template
npm run approval-decision -- <approved-decision.json> --require-approved
npm run approval-packet-preview -- <approved-decision.json> <approved-packet.preview.json>
```

## What It Checks

Each ready action includes:

- the approval id
- action type, stage, channel, and destination
- draft packet path
- matching evidence template path
- approval command
- evidence validation command
- ledger-entry, state-preview, and canonical update-set commands for X posts and outreach
- remaining approval flags
- exact action text when available
- pre-approval, human execution, evidence, and safety steps

The command exits nonzero if the review workspace is invalid. It exits successfully when the workspace is valid, even if there are no ready actions, because that is a state to handle in the launch sequence rather than a corrupted workspace.

## Evidence Boundary

The runbook reads local review material and writes a markdown checklist. It does not change packet state, mark anything executed, update ledgers, or claim usage. A passing runbook means the human operator has a safer checklist, not that Allow has executed or validated an external action.

`npm run approval-preflight` is the final read-only local check before action-time approval. It verifies the current launch stage, review brief, runbook action, approval command, evidence command, and post-evidence preview path agree with one another.

`npm run approval-request` writes `work/approval-request.md`. It packages the exact current draft packet and decision checklist for human review, while requiring the packet to remain draft and all approval flags to remain false.

`npm run approval-decision-template` writes `work/approval-decision.template.json`. It keeps `decision` and `status` as `pending`, binds the current draft packet bytes to `packet.sha256`, and leaves reviewer fields, approval flags, and assertions empty or false until explicit action-time approval or rejection.

`npm run approval-decision -- <approved-decision.json> --require-approved` is the local read-only checkpoint after a real action-time yes. It fails unless the decision is approved, all flags/assertions are true, and the draft packet hash still matches.

`npm run approval-packet-preview -- <approved-decision.json> <approved-packet.preview.json>` writes a separate approved packet copy from that validated decision. It does not mutate the original draft packet and the preview still must pass `external-action-approval` before any manual execution.
