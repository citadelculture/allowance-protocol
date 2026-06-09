# Action-Time Approval Request

The action-time approval request is the final local handoff artifact before a human decides whether to approve exactly one external action.

```bash
npm run launch-handoff-brief
npm run approval-preflight
npm run approval-request
npm run approval-decision-template
npm run approval-decision -- work/approval-decision.template.json
```

By default it reads `work/external-action-workspace` plus `work/launch-handoff-brief.md`, rebuilds the review brief, runbook, and preflight, reads the current draft packet, and writes `work/approval-request.md`.

## What It Checks

The request requires:

- a passing approval preflight
- a matching draft packet for the current external-action stage
- `status` still set to `draft`
- empty `approvedBy` and `approvedAt`
- every approval flag still explicitly `false`
- `human_only` execution mode
- no automated action flag
- exact action text available for X posts and outreach
- approval, evidence, ledger-preview, state-preview, canonical-update, and final state commands

## What It Does Not Do

The request does not approve the packet. It does not set approval flags, post to X, send outreach, schedule interviews, sign wallet payloads, deploy contracts, start pilot traffic, promote merchants, move funds, store secrets, update canonical state, or enable tokens.

If the action is approved, the operator still must edit the packet after action-time review, run `npm run external-action-approval -- <approved-packet.json>`, execute manually, collect post-execution evidence, and preview every state update before any canonical edit or public claim.

`npm run approval-decision-template` follows this request with a pending JSON decision template at `work/approval-decision.template.json`. It records the current draft packet SHA-256 and exact-text hash so any later `approved` or `rejected` decision can be checked against the same bytes.

After a real action-time yes, validate the filled decision with `npm run approval-decision -- <approved-decision.json> --require-approved` before editing the packet or running `external-action-approval`.
