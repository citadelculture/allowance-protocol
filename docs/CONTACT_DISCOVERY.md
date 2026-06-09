# Contact Discovery

The first recruiting action is to identify public contact paths for the top prospect slot: Agentic Market Market Research services.

No outreach should be sent automatically. Drafts in the operator report are review-only.

## Contact Candidates

Data lives in `ops/contact_candidates.json`.

Current draft-ready candidates:

- BlockRun Labs website or partner/contact surface
- BlockRunAI Franklin GitHub repository
- Parallel contact form
- Agentic Market seller tooling path
- the402 contact form

Discovery lead:

- toon.haus finance endpoint operator through the Market Research bundle page

## Outreach Approval Rule

Before sending any message:

1. Confirm destination and channel.
2. Confirm the message text.
3. Confirm no private data is included.
4. Confirm the ask is product feedback or middleware testing, not token promotion.

## Draft Command

```bash
npm run growth
```

Review `growth.outreachDrafts`.

Each draft is marked `draft_only`. It is not sent by any script.

## Action Pack Command

```bash
npm run outreach-action-pack
```

Review `growth.outreachActionPack` before account-owner approval. It creates draft `merchant_outreach` external-action packets with exact text and destination, but it does not approve or send them.

## Execution Evidence Command

```bash
npm run outreach-execution-evidence -- ops/outreach_execution_template.json
```

Run this only after a human sends a final approved packet. It validates the approved packet reference, exact sent text, human execution flags, redacted proof, and response status. It does not count the outreach as an interview.

## State Reconciliation Command

```bash
npm run outreach-state -- ops/outreach_execution_records.json
```

Run this after adding passed execution evidence to the records ledger. It fails if `ops/prospects.json` marks outreach or scheduling ahead of valid evidence.

## Interview Packet Command

```bash
npm run interview-campaign
```

Review `growth.interviewCampaign` before sending anything. It shows the five-interview shortfall, ready packets, blocked candidates, and any remaining contact-discovery gap.

```bash
npm run interview-packet
npm run interview-packet -- blockrun-partners
```

Review `growth.interviewPackets` or the command output before scheduling. Packets include questions, intake fields, and human approval checks; they do not send outreach or count as completed interviews.

After an interview, record evidence with `ops/interviews_template.json`, fill the linked merchant intake, then run:

```bash
npm run interview-report
```

## Public Sources

- BlockRun: https://blockrun.ai/
- BlockRun Franklin: https://github.com/BlockRunAI/Franklin
- Parallel docs: https://docs.parallel.ai/introduction/welcome
- Parallel contact: https://contact.parallel.ai/
- Agentic Market seller tools: https://agentic.market/tools/sellers
- Market Research bundle: https://agentic.market/bundles/market-research
- the402 marketplace: https://the402.ai/
- the402 contact: https://the402.ai/contact/
