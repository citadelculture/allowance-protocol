# Approval Packet Preview

The approval packet preview derives a separate approved packet copy from a validated, hash-bound action-time approval decision.

```bash
npm run approval-decision -- <approved-decision.json> --require-approved
npm run approval-packet-preview -- <approved-decision.json> <approved-packet.preview.json>
npm run external-action-approval -- <approved-packet.preview.json>
```

The preview tool reads the current draft packet, current approval request context, and the filled decision JSON. It refuses to write an approved packet preview unless:

- the decision is `approved`
- the decision still matches the current draft packet path and SHA-256
- all approval flags are true
- all approval assertions are true
- reviewer fields are filled
- the derived packet passes `external-action-approval`

## What It Writes

When valid, the command writes only the requested preview file. It does not mutate the original draft packet in `work/external-action-workspace`.

The derived preview sets:

- `status: "approved"`
- `approvedBy` and `approvedAt` from the decision reviewer fields
- all approval flags from the approved decision
- `approvalDecisionRef` with the decision timestamp, packet SHA-256, exact-text SHA-256, and preview timestamp

## Boundary

This command does not approve by itself, post to X, send outreach, schedule interviews, sign wallet payloads, deploy contracts, start pilot traffic, promote merchants, move funds, store secrets, update canonical state, or enable tokens.

After a preview is written, the operator must still run `npm run external-action-approval -- <approved-packet.preview.json>` and manually execute only after that final validator passes.
