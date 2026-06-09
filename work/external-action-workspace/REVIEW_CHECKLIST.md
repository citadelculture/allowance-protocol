# Allow External Action Review Checklist

Generated: 2026-06-09T10:43:54.656Z
Workspace: work/external-action-workspace
Queue status: has_ready_actions

## Before Any External Action

- Confirm the exact text, destination, account, wallet, or endpoint.
- Edit only the copied draft packet after review.
- Set `status` to `approved`, fill `approvedBy` and `approvedAt`, and set every approval flag to `true`.
- Run `npm run external-action-approval -- <approved-packet.json>` and keep the passing output.
- Have a human perform exactly the approved action.
- Fill the matching evidence template and run the post-execution evidence validator before updating state or making claims.
- Never add private keys, seed phrases, bearer tokens, API secrets, or passwords.

## Draft Packets

- x_post_day_one_thesis: `packets/01-x-post-day-one-thesis.draft.json`
  Approval: `npm run external-action-approval -- work/external-action-workspace/packets/01-x-post-day-one-thesis.draft.json`
  Evidence template: `evidence/01-x-post-day-one-thesis.x-post-execution.template.json`
  Evidence: `npm run x-post-execution-evidence -- ops/x_post_execution_template.json`
- x_post_core_question: `packets/02-x-post-core-question.draft.json`
  Approval: `npm run external-action-approval -- work/external-action-workspace/packets/02-x-post-core-question.draft.json`
  Evidence template: `evidence/02-x-post-core-question.x-post-execution.template.json`
  Evidence: `npm run x-post-execution-evidence -- ops/x_post_execution_template.json`
- x_post_builder_ask: `packets/03-x-post-builder-ask.draft.json`
  Approval: `npm run external-action-approval -- work/external-action-workspace/packets/03-x-post-builder-ask.draft.json`
  Evidence template: `evidence/03-x-post-builder-ask.x-post-execution.template.json`
  Evidence: `npm run x-post-execution-evidence -- ops/x_post_execution_template.json`
- merchant_outreach_blockrun_partners: `packets/04-merchant-outreach-blockrun-partners.draft.json`
  Approval: `npm run external-action-approval -- work/external-action-workspace/packets/04-merchant-outreach-blockrun-partners.draft.json`
  Evidence template: `evidence/04-merchant-outreach-blockrun-partners.outreach-execution.template.json`
  Evidence: `npm run outreach-execution-evidence -- ops/outreach_execution_template.json`
- merchant_outreach_blockrun_github_franklin: `packets/05-merchant-outreach-blockrun-github-franklin.draft.json`
  Approval: `npm run external-action-approval -- work/external-action-workspace/packets/05-merchant-outreach-blockrun-github-franklin.draft.json`
  Evidence template: `evidence/05-merchant-outreach-blockrun-github-franklin.outreach-execution.template.json`
  Evidence: `npm run outreach-execution-evidence -- ops/outreach_execution_template.json`
- merchant_outreach_parallel_contact: `packets/06-merchant-outreach-parallel-contact.draft.json`
  Approval: `npm run external-action-approval -- work/external-action-workspace/packets/06-merchant-outreach-parallel-contact.draft.json`
  Evidence template: `evidence/06-merchant-outreach-parallel-contact.outreach-execution.template.json`
  Evidence: `npm run outreach-execution-evidence -- ops/outreach_execution_template.json`
- merchant_outreach_agentic_market_seller_tools: `packets/07-merchant-outreach-agentic-market-seller-tools.draft.json`
  Approval: `npm run external-action-approval -- work/external-action-workspace/packets/07-merchant-outreach-agentic-market-seller-tools.draft.json`
  Evidence template: `evidence/07-merchant-outreach-agentic-market-seller-tools.outreach-execution.template.json`
  Evidence: `npm run outreach-execution-evidence -- ops/outreach_execution_template.json`
- merchant_outreach_the402_contact: `packets/08-merchant-outreach-the402-contact.draft.json`
  Approval: `npm run external-action-approval -- work/external-action-workspace/packets/08-merchant-outreach-the402-contact.draft.json`
  Evidence template: `evidence/08-merchant-outreach-the402-contact.outreach-execution.template.json`
  Evidence: `npm run outreach-execution-evidence -- ops/outreach_execution_template.json`

## Evidence Templates

- x_post_day_one_thesis: `evidence/01-x-post-day-one-thesis.x-post-execution.template.json`
- x_post_core_question: `evidence/02-x-post-core-question.x-post-execution.template.json`
- x_post_builder_ask: `evidence/03-x-post-builder-ask.x-post-execution.template.json`
- merchant_outreach_blockrun_partners: `evidence/04-merchant-outreach-blockrun-partners.outreach-execution.template.json`
- merchant_outreach_blockrun_github_franklin: `evidence/05-merchant-outreach-blockrun-github-franklin.outreach-execution.template.json`
- merchant_outreach_parallel_contact: `evidence/06-merchant-outreach-parallel-contact.outreach-execution.template.json`
- merchant_outreach_agentic_market_seller_tools: `evidence/07-merchant-outreach-agentic-market-seller-tools.outreach-execution.template.json`
- merchant_outreach_the402_contact: `evidence/08-merchant-outreach-the402-contact.outreach-execution.template.json`

## Packet Fixes Needed

- controller_policy_signature:controller_policy_signature_allow_policy_demo_alpha: Production policy controller must be a 20-byte EVM address

## Blocked Future Actions

- deployment_review_package:pending_packet: deployment check evidence has not passed; independent contract review evidence has not passed; deployment manifest has not passed
- live_pilot_traffic:missing_packet: five valid merchant interviews are not complete; production signed policy is not configured
- live_directory_claims:pending_packet: pilot evidence has not passed
