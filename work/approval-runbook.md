# Allow Approval Runbook

Generated: 2026-06-09T07:13:02.158Z
Status: ready_for_operator_review
Review brief: ready_for_packet_review
Current stage: public_build_post

## Safety Boundary

- This runbook is local operator guidance only.
- It does not approve packets, post to X, send outreach, schedule interviews, sign wallet payloads, deploy contracts, start pilot traffic, promote merchants, move funds, store secrets, update state, or enable tokens.
- Every external action still requires a passing final approval packet and post-execution evidence.

## Primary Action

- Approval id: `x_post_day_one_thesis`
- Type: `x_post`
- Stage: `public_build_post`
- Destination: `@allow_protocol`
- Packet: `packets/01-x-post-day-one-thesis.draft.json`
- Evidence template: `evidence/01-x-post-day-one-thesis.x-post-execution.template.json`
- Approval flags still false: 9

### Before Approval

- Open the draft packet `packets/01-x-post-day-one-thesis.draft.json` and confirm it still represents the intended action.
- Confirm the destination is `@allow_protocol` and the channel is `x`.
- Review the exact text (275 characters) and do not approve edits that are outside the packet.
- Set status to approved only after action-time human approval.
- Fill approvedBy and approvedAt with the real reviewer and timestamp.
- Set every required approval flag to true: humanWillExecute, automationDisabled, exactActionReviewed, externalSideEffectAcknowledged, noPrivateKeys, noCustodyOrEscrow, noTokenPitch, noMarketManipulation, legalEthicsReviewed.
- Run npm run external-action-approval -- work/external-action-workspace/packets/01-x-post-day-one-thesis.draft.json and require a passing result before execution.

### Human Execution

- The approved account owner posts the exact text from the approved packet manually.
- Use the approved destination only; do not add thread posts, media, tags, or claims that were not reviewed.
- Capture the public post URL immediately after posting.

### Evidence After Execution

- Fill the matching evidence template `evidence/01-x-post-day-one-thesis.x-post-execution.template.json` after the human action is complete.
- Attach the approved packet reference, execution timestamp, actor, destination, and redacted proof.
- Run npm run x-post-execution-evidence -- work/external-action-workspace/evidence/01-x-post-day-one-thesis.x-post-execution.template.json and require a passing result before updating state or making public claims.
- After evidence passes, reconcile post state with npm run x-post-state -- ops/x_post_execution_records.json.

### Safety Checks

- Do not execute unless the approval validator passes on the final approved packet.
- Do not change the destination, channel, text, typed data, or command after approval.
- Do not expose private keys, seed phrases, unredacted customer data, or custody credentials.
- Do not add token, investment, usage, partnership, or return claims without validated evidence.

### Exact Action Text

```text
AI agents should not get blank-check wallets.

Allow Protocol is building the allowance layer for autonomous payments: merchant allowlists, per-tx caps, daily budgets, metadata filters, route blocks, and receipt proofs.

Day 1: policy engine, dashboard, x402-style preflight.
```

## Remaining Ready Actions

- `x_post_core_question` (x_post) for @allow_protocol: Human posts Allow launch draft core-question from the approved X account
- `x_post_builder_ask` (x_post) for @allow_protocol: Human posts Allow launch draft builder-ask from the approved X account
- `merchant_outreach_blockrun_partners` (merchant_outreach) for https://blockrun.ai/: Human sends product-feedback ask to blockrun-partners
- `merchant_outreach_blockrun_github_franklin` (merchant_outreach) for https://github.com/BlockRunAI/Franklin: Human sends product-feedback ask to blockrun-github-franklin
- `merchant_outreach_parallel_contact` (merchant_outreach) for https://contact.parallel.ai/: Human sends product-feedback ask to parallel-contact
- `merchant_outreach_agentic_market_seller_tools` (merchant_outreach) for https://agentic.market/tools/sellers: Human sends product-feedback ask to agentic-market-seller-tools
- `merchant_outreach_the402_contact` (merchant_outreach) for https://the402.ai/contact/: Human sends product-feedback ask to the402-contact

## Final Reminder

Approve exactly one action at a time. Execute it manually only after approval passes, then validate evidence before touching state or claims.
