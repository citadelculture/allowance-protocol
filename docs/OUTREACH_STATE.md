# Outreach State

Outreach state reconciles validated post-send evidence with `ops/prospects.json`.

Use it to keep the growth pipeline honest: a prospect should not be marked `sent`, `replied`, or `scheduled` unless there is matching outreach execution evidence.

## Command

```bash
npm run outreach-state -- ops/outreach_execution_records.json
```

The default records file starts empty because no outreach has been sent from this workspace.

## What It Checks

- every evidence record passes `npm run outreach-execution-evidence`
- `prospectId` exists in `ops/prospects.json`
- `candidateId` exists in `ops/contact_candidates.json`
- duplicate `evidenceId` values are rejected
- advanced prospect `outreachStatus` values have matching valid evidence
- scheduled prospect interview state has scheduled outreach evidence or a scheduled interview record

## Boundary

This report does not send outreach, approve external actions, count completed interviews, mark prospects integrated, start pilot traffic, move funds, store secrets, or unlock token work.

Scheduled outreach responses still do not count as completed interviews. Completed interviews only count after `npm run interview-report` passes with answers, safety approvals, and linked merchant intake evidence.
