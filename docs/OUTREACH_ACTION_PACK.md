# Outreach Action Pack

Outreach drafts are not enough for an external side effect. Before any account owner sends a merchant interview ask, generate exact external-action packets:

```bash
npm run outreach-action-pack
```

The command turns review-only outreach drafts into `merchant_outreach` external-action packets. Each packet includes:

- `action.channel`
- `action.destination`
- `action.subject`
- `action.exactText`
- the original `payload.outreachDraft`
- draft approval fields

The pack can be `ready_for_human_approval`, but the packets are intentionally `status: "draft"` with approval flags set to `false`. That means `npm run external-action-approval -- <packet>` must fail until the account owner reviews the exact message, fills `approvedBy` and `approvedAt`, changes `status` to `approved`, and sets every safety flag to `true`.

## Boundary

This command does not send outreach, post content, sign wallet payloads, start pilot traffic, move funds, store secrets, or mark anything approved. It only creates the review packet a human can approve later.

## Final Check

After a human approves one packet, run:

```bash
npm run external-action-approval -- path/to/approved-outreach-action.json
```

Only a passing final approval packet should be used for an external send.

After the human sends it, record the redacted send proof and validate:

```bash
npm run outreach-execution-evidence -- ops/outreach_execution_template.json
```

That post-send evidence still does not count as a completed interview.
