# Allow External Action Review Brief

Generated: 2026-06-09T10:44:09.944Z
Workspace: /Users/dom/Documents/Codex/2026-06-08/your-task-is-to-build-a/outputs/allow-protocol/work/external-action-workspace
Status: ready_for_packet_review
Audit: verified_review_workspace (valid)

## Safety Boundary

- This brief is local review material only.
- No packet is approved by this brief.
- No content is posted, outreach is sent, wallet payload is signed, contract is deployed, pilot traffic is started, merchant is promoted, or funds are moved.
- Every external action still requires an explicitly approved packet and post-execution evidence.

## Review Queue

- Draft packets: 8
- Evidence templates: 8
- Packet fixes needed: 1
- Blocked future actions: 3

### 1. Human posts Allow launch draft day-one-thesis from the approved X account

- Approval id: `x_post_day_one_thesis`
- Type: `x_post`
- Stage: `public_build_post`
- Destination: `@allow_protocol`
- Packet: `packets/01-x-post-day-one-thesis.draft.json` (verified)
- Evidence template: `evidence/01-x-post-day-one-thesis.x-post-execution.template.json` (verified)
- Approval flags true: 0/9
- Approval command: `npm run external-action-approval -- work/external-action-workspace/packets/01-x-post-day-one-thesis.draft.json`
- Evidence validation: `npm run x-post-execution-evidence -- work/external-action-workspace/evidence/01-x-post-day-one-thesis.x-post-execution.template.json`

Exact action text:

```text
AI agents should not get blank-check wallets.

Allow Protocol is building the allowance layer for autonomous payments: merchant allowlists, per-tx caps, daily budgets, metadata filters, route blocks, and receipt proofs.

Day 1: policy engine, dashboard, x402-style preflight.
```

### 2. Human posts Allow launch draft core-question from the approved X account

- Approval id: `x_post_core_question`
- Type: `x_post`
- Stage: `public_build_post`
- Destination: `@allow_protocol`
- Packet: `packets/02-x-post-core-question.draft.json` (verified)
- Evidence template: `evidence/02-x-post-core-question.x-post-execution.template.json` (verified)
- Approval flags true: 0/9
- Approval command: `npm run external-action-approval -- work/external-action-workspace/packets/02-x-post-core-question.draft.json`
- Evidence validation: `npm run x-post-execution-evidence -- work/external-action-workspace/evidence/02-x-post-core-question.x-post-execution.template.json`

Exact action text:

```text
Every autonomous payment should answer one question before settlement:

Can this agent spend this amount with this merchant for this resource right now?

Allow Protocol ships the first local demo today: spend policy, nonce checks, metadata filters, and receipts.
```

### 3. Human posts Allow launch draft builder-ask from the approved X account

- Approval id: `x_post_builder_ask`
- Type: `x_post`
- Stage: `public_build_post`
- Destination: `@allow_protocol`
- Packet: `packets/03-x-post-builder-ask.draft.json` (verified)
- Evidence template: `evidence/03-x-post-builder-ask.x-post-execution.template.json` (verified)
- Approval flags true: 0/9
- Approval command: `npm run external-action-approval -- work/external-action-workspace/packets/03-x-post-builder-ask.draft.json`
- Evidence validation: `npm run x-post-execution-evidence -- work/external-action-workspace/evidence/03-x-post-builder-ask.x-post-execution.template.json`

Exact action text:

```text
x402 makes payment native to HTTP. Allow makes agent spend bounded enough to automate.

Today: no-custody policy engine, preflight middleware, signed-policy path, and merchant intake validator.

Looking for API/MCP builders to test a low-risk paid endpoint.
```

### 4. Human sends product-feedback ask to blockrun-partners

- Approval id: `merchant_outreach_blockrun_partners`
- Type: `merchant_outreach`
- Stage: `merchant_outreach`
- Destination: `https://blockrun.ai/`
- Packet: `packets/04-merchant-outreach-blockrun-partners.draft.json` (verified)
- Evidence template: `evidence/04-merchant-outreach-blockrun-partners.outreach-execution.template.json` (verified)
- Approval flags true: 0/9
- Approval command: `npm run external-action-approval -- work/external-action-workspace/packets/04-merchant-outreach-blockrun-partners.draft.json`
- Evidence validation: `npm run outreach-execution-evidence -- work/external-action-workspace/evidence/04-merchant-outreach-blockrun-partners.outreach-execution.template.json`

Exact action text:

```text
Hi BlockRun Labs,

I am building Allow Protocol, a no-custody policy layer for agent payments.

I found Agentic Market Market Research bundle / Exa Neural Search service wrapper while mapping early x402 and agent-service merchants. The specific question: would a pre-settlement guard help before an agent pays for services like this?

Allow blocks unsafe paid requests before settlement:
- merchant allowlists
- per-transaction and daily spend caps
- metadata filters
- per-policy nonce/replay checks
- receipts for allowed and denied attempts

Would you be open to giving blunt feedback on the middleware shape, or testing one low-risk endpoint?

No token pitch. I am trying to learn where agent-payment guardrails are actually painful.
```

### 5. Human sends product-feedback ask to blockrun-github-franklin

- Approval id: `merchant_outreach_blockrun_github_franklin`
- Type: `merchant_outreach`
- Stage: `merchant_outreach`
- Destination: `https://github.com/BlockRunAI/Franklin`
- Packet: `packets/05-merchant-outreach-blockrun-github-franklin.draft.json` (verified)
- Evidence template: `evidence/05-merchant-outreach-blockrun-github-franklin.outreach-execution.template.json` (verified)
- Approval flags true: 0/9
- Approval command: `npm run external-action-approval -- work/external-action-workspace/packets/05-merchant-outreach-blockrun-github-franklin.draft.json`
- Evidence validation: `npm run outreach-execution-evidence -- work/external-action-workspace/evidence/05-merchant-outreach-blockrun-github-franklin.outreach-execution.template.json`

Exact action text:

```text
Hi BlockRun Franklin maintainers,

I am building Allow Protocol, a no-custody policy layer for agent payments.

I found x402-enabled API marketplace repository while mapping early x402 and agent-service merchants. The specific question: would a pre-settlement guard help before an agent pays for services like this?

Allow blocks unsafe paid requests before settlement:
- merchant allowlists
- per-transaction and daily spend caps
- metadata filters
- per-policy nonce/replay checks
- receipts for allowed and denied attempts

Would you be open to giving blunt feedback on the middleware shape, or testing one low-risk endpoint?

No token pitch. I am trying to learn where agent-payment guardrails are actually painful.
```

### 6. Human sends product-feedback ask to parallel-contact

- Approval id: `merchant_outreach_parallel_contact`
- Type: `merchant_outreach`
- Stage: `merchant_outreach`
- Destination: `https://contact.parallel.ai/`
- Packet: `packets/06-merchant-outreach-parallel-contact.draft.json` (verified)
- Evidence template: `evidence/06-merchant-outreach-parallel-contact.outreach-execution.template.json` (verified)
- Approval flags true: 0/9
- Approval command: `npm run external-action-approval -- work/external-action-workspace/packets/06-merchant-outreach-parallel-contact.draft.json`
- Evidence validation: `npm run outreach-execution-evidence -- work/external-action-workspace/evidence/06-merchant-outreach-parallel-contact.outreach-execution.template.json`

Exact action text:

```text
Hi Parallel,

I am building Allow Protocol, a no-custody policy layer for agent payments.

I found Parallel Search / task API while mapping early x402 and agent-service merchants. The specific question: would a pre-settlement guard help before an agent pays for services like this?

Allow blocks unsafe paid requests before settlement:
- merchant allowlists
- per-transaction and daily spend caps
- metadata filters
- per-policy nonce/replay checks
- receipts for allowed and denied attempts

Would you be open to giving blunt feedback on the middleware shape, or testing one low-risk endpoint?

No token pitch. I am trying to learn where agent-payment guardrails are actually painful.
```

### 7. Human sends product-feedback ask to agentic-market-seller-tools

- Approval id: `merchant_outreach_agentic_market_seller_tools`
- Type: `merchant_outreach`
- Stage: `merchant_outreach`
- Destination: `https://agentic.market/tools/sellers`
- Packet: `packets/07-merchant-outreach-agentic-market-seller-tools.draft.json` (verified)
- Evidence template: `evidence/07-merchant-outreach-agentic-market-seller-tools.outreach-execution.template.json` (verified)
- Approval flags true: 0/9
- Approval command: `npm run external-action-approval -- work/external-action-workspace/packets/07-merchant-outreach-agentic-market-seller-tools.draft.json`
- Evidence validation: `npm run outreach-execution-evidence -- work/external-action-workspace/evidence/07-merchant-outreach-agentic-market-seller-tools.outreach-execution.template.json`

Exact action text:

```text
Hi Agentic Market seller tooling,

I am building Allow Protocol, a no-custody policy layer for agent payments.

I found x402 service discovery and seller validation while mapping early x402 and agent-service merchants. The specific question: would a pre-settlement guard help before an agent pays for services like this?

Allow blocks unsafe paid requests before settlement:
- merchant allowlists
- per-transaction and daily spend caps
- metadata filters
- per-policy nonce/replay checks
- receipts for allowed and denied attempts

Would you be open to giving blunt feedback on the middleware shape, or testing one low-risk endpoint?

No token pitch. I am trying to learn where agent-payment guardrails are actually painful.
```

### 8. Human sends product-feedback ask to the402-contact

- Approval id: `merchant_outreach_the402_contact`
- Type: `merchant_outreach`
- Stage: `merchant_outreach`
- Destination: `https://the402.ai/contact/`
- Packet: `packets/08-merchant-outreach-the402-contact.draft.json` (verified)
- Evidence template: `evidence/08-merchant-outreach-the402-contact.outreach-execution.template.json` (verified)
- Approval flags true: 0/9
- Approval command: `npm run external-action-approval -- work/external-action-workspace/packets/08-merchant-outreach-the402-contact.draft.json`
- Evidence validation: `npm run outreach-execution-evidence -- work/external-action-workspace/evidence/08-merchant-outreach-the402-contact.outreach-execution.template.json`

Exact action text:

```text
Hi the402,

I am building Allow Protocol, a no-custody policy layer for agent payments.

I found Base mainnet x402 service marketplace, MCP catalog, and provider onboarding while mapping early x402 and agent-service merchants. The specific question: would a pre-settlement guard help before an agent pays for services like this?

Allow blocks unsafe paid requests before settlement:
- merchant allowlists
- per-transaction and daily spend caps
- metadata filters
- per-policy nonce/replay checks
- receipts for allowed and denied attempts

Would you be open to giving blunt feedback on the middleware shape, or testing one low-risk endpoint?

No token pitch. I am trying to learn where agent-payment guardrails are actually painful.
```


## Packet Fixes Needed

- controller_policy_signature:controller_policy_signature_allow_policy_demo_alpha: Production policy controller must be a 20-byte EVM address

## Blocked Future Actions

- deployment_review_package:pending_packet: deployment check evidence has not passed; independent contract review evidence has not passed; deployment manifest has not passed
- live_pilot_traffic:missing_packet: five valid merchant interviews are not complete; production signed policy is not configured
- live_directory_claims:pending_packet: pilot evidence has not passed

## Final Reminder

Run `npm run external-action-workspace-audit` before review and `npm run external-action-approval -- <approved-packet.json>` before any human executes an external action.
