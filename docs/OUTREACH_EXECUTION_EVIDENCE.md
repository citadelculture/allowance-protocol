# Outreach Execution Evidence

Outreach execution evidence is the post-send audit record for merchant outreach. It proves that a human sent the exact approved message, and it tracks the response state without counting that response as an interview.

## Command

```bash
npm run outreach-execution-evidence -- ops/outreach_execution_template.json
```

The template exits nonzero until real evidence is filled in.

After a record passes, build local previews before adding it to `ops/outreach_execution_records.json` and reconciling the prospect pipeline:

```bash
npm run execution-evidence-ledger-entry -- <filled-outreach-evidence.json>
npm run state-update-preview -- work/execution-evidence-ledger-entry.json
npm run canonical-update-set -- work/execution-evidence-ledger-entry.json work/state-update-preview.json
npm run outreach-state -- ops/outreach_execution_records.json
```

## Required Evidence

Each record needs:

- `approvalRef` pointing to the final approved `merchant_outreach` external-action packet
- the full `approvalPacket`
- `candidateId` and `prospectId`
- `sent.sentAt`, `sent.sentBy`, `sent.channel`, `sent.destination`, `sent.subject`, and `sent.exactText`
- `sent.humanExecuted: true`
- `sent.accountOwnerApproved: true`
- `sent.automationUsed: false`
- a redacted `proof` reference

The validator checks that `sent.channel`, `sent.destination`, `sent.subject`, and `sent.exactText` exactly match the approved packet. It also revalidates the original outreach draft for no token pitch, safe destination, no unsupported claims, and no secret-looking text.

## Response States

`outreachStatus` can be:

- `sent`
- `replied`
- `scheduled`
- `declined`
- `bounced`

For `scheduled`, add `response.scheduledAt` and `response.interviewId`. That still does not count as a completed interview. A completed interview only counts after `npm run interview-report` passes with answers, approvals, and linked merchant intake evidence.

## Boundary

This command does not send outreach, approve external actions, schedule interviews, count completed interviews, start pilot traffic, move funds, store secrets, mark prospects integrated, or unlock token launch.
