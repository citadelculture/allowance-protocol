# Action-Time Approval Decision Template

The approval decision template is a local JSON form for recording a future human yes/no decision against exactly one draft packet.

```bash
npm run launch-handoff-brief
npm run approval-preflight
npm run approval-request
npm run approval-decision-template
npm run approval-decision -- work/approval-decision.template.json
```

By default it reads `work/external-action-workspace` plus `work/launch-handoff-brief.md`, rebuilds the review brief, runbook, preflight, and approval request, reads the current draft packet bytes, and writes `work/approval-decision.template.json`.

To validate a filled approval decision before editing any packet, run:

```bash
npm run approval-decision -- <approved-decision.json> --require-approved
npm run approval-packet-preview -- <approved-decision.json> <approved-packet.preview.json>
```

Without `--require-approved`, the validator accepts a valid `pending`, `approved`, or `rejected` decision and reports the next safe action. With `--require-approved`, it fails unless the decision is approved and still matches the current draft packet hash.

After the approved decision validator passes, use `npm run approval-packet-preview` to derive a separate approved packet copy. The original draft packet remains unchanged.

## What It Binds

The template records:

- approval id and action type
- draft packet path
- SHA-256 of the exact draft packet bytes
- byte length of the draft packet source
- SHA-256 and character count of exact action text when present
- reviewer fields left blank
- every approval flag set to `false`
- every approval assertion set to `false`
- approval and evidence commands from the request

## Decision Rules

Keep `decision` and `status` as `pending` unless a real human decision is made at action time.

For approval, set both fields to `approved`, fill `reviewer.approvedBy` and `reviewer.approvedAt`, set every approval flag to `true`, and set every assertion to `true` only after confirming the current draft packet hash still equals `packet.sha256`.

For rejection, set both fields to `rejected`, fill the reviewer fields and `decisionReason`, and do not execute the action.

## What The Validator Checks

`npm run approval-decision` checks:

- the decision artifact shape
- `status` matches `decision`
- approval id and action type match the current approval request
- packet path and SHA-256 match the current draft packet bytes
- exact action text hash still matches when present
- the current packet is still `draft`
- approved decisions have reviewer fields, every approval flag, and every assertion set
- rejected decisions have reviewer fields and a rejection reason

## What It Does Not Do

The template command writes a pending local template only. The validator reads local files only. Neither command approves the packet, post to X, send outreach, schedule interviews, sign wallet payloads, deploy contracts, start pilot traffic, promote merchants, move funds, store secrets, update canonical state, or enable tokens.

After a real approval, the operator must still derive the approved packet preview, run `npm run external-action-approval -- <approved-packet.preview.json>`, execute manually, collect post-execution evidence, and preview every state update before any canonical edit or public claim.
