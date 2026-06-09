# X Post Action Pack

The X post action pack turns validated launch-pack drafts into draft `x_post` external-action approval packets.

```bash
npm run x-post-action-pack
npm run x-post-action-pack -- launch/x_posts.json @allow_protocol
```

The command validates the launch post drafts, local screenshot assets, and any disclosure evidence provided through `ALLOW_DISCLOSURE_PATHS`. It prints one draft packet per post.

The generated packets remain unapproved. Before posting, the X account owner must set approval attribution and every safety flag, then run:

```bash
npm run external-action-approval -- <approved-x-post-packet.json>
```

The final approval gate checks exact text, destination handle, draft-only status, claim policy, and secret redaction.

After a human posts the approved packet, validate the public execution record:

```bash
npm run x-post-execution-evidence -- ops/x_post_execution_template.json
```

Then build the local ledger, state, and canonical update previews before editing canonical files:

```bash
npm run execution-evidence-ledger-entry -- <filled-x-post-evidence.json>
npm run state-update-preview -- work/execution-evidence-ledger-entry.json
npm run canonical-update-set -- work/execution-evidence-ledger-entry.json work/state-update-preview.json
npm run x-post-state -- ops/x_post_execution_records.json
```

Boundary:

- does not post to X
- does not send outreach
- does not approve the packet
- does not make token sale, investment, return, or unsupported usage claims
- does not start pilot traffic
- does not move funds
- does not store secrets
