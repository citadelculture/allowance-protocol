# Approval Preflight

The approval preflight is the last local check before a human reviews exactly one external-action packet for action-time approval.

```bash
npm run launch-handoff-brief
npm run approval-runbook
npm run approval-preflight
```

By default it reads `work/external-action-workspace` plus `work/launch-handoff-brief.md`, rebuilds the external-action review brief and approval runbook, and writes `work/approval-preflight.md`.

## What It Checks

The preflight requires:

- a valid external-action review brief
- a valid approval runbook
- a current launch stage with an external action
- a primary runbook action matching the current launch stage
- a matching review-brief action
- draft packet path, evidence template path, approval command, and evidence validation command
- every approval flag still false before action-time approval
- X/outreach post-evidence steps through ledger-entry preview, state-update preview, canonical update set, and the final state validator
- safety boundaries that do not approve, execute, update canonical state, or claim usage

## Statuses

- `ready_for_action_time_approval`: local review material is coherent and the operator can proceed to final approval review.
- `needs_review_workspace_fixes`: the audited packet workspace or review brief is invalid.
- `needs_runbook_fixes`: the runbook is invalid or not ready for operator review.
- `blocked_by_launch_sequence`: the current launch stage is not ready for human action.
- `no_external_action_ready`: the current stage is not an external-action stage.
- `needs_preflight_fixes`: the packet, evidence command, runbook, or post-evidence preview path is incomplete.

## Evidence Boundary

The preflight is read-only local review material. It does not approve packets, post to X, send outreach, schedule interviews, sign wallet payloads, deploy contracts, start pilot traffic, promote merchants, move funds, store secrets, update canonical state, or enable tokens.

A passing preflight is not permission to act by itself. The exact packet still needs explicit action-time approval, manual execution by the approved human operator, post-execution evidence, and previewed ledger/state/canonical updates before any canonical edit or public claim.
