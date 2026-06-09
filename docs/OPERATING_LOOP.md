# Operating Loop

Allow Protocol should run as a public build cycle until usage becomes the center of gravity.

## Daily Loop

1. Ship one product improvement.
2. Run tests and browser smoke checks.
3. Update metrics.
4. Publish one X build post.
5. Reply to builders in the agent-payment, MCP, x402, Base, and Solana identity ecosystems.
6. Ask one real merchant or agent builder to test a policy.

## Weekly Loop

1. Publish receipt metrics.
2. Publish one risk note.
3. Add one integration example.
4. Review legal and security assumptions.
5. Decide whether token design remains blocked by missing usage.

## Command

```bash
npm run operate
npm run x-post-action-pack
npm run x-post-execution-evidence -- ops/x_post_execution_template.json
npm run execution-evidence-ledger-entry -- ops/x_post_execution_template.json
npm run state-update-preview -- work/execution-evidence-ledger-entry.json
npm run canonical-update-set -- work/execution-evidence-ledger-entry.json work/state-update-preview.json
npm run x-post-state -- ops/x_post_execution_records.json
npm run outreach-approval
npm run outreach-action-pack
npm run outreach-execution-evidence -- ops/outreach_execution_template.json
npm run execution-evidence-ledger-entry -- ops/outreach_execution_template.json
npm run state-update-preview -- work/execution-evidence-ledger-entry.json
npm run canonical-update-set -- work/execution-evidence-ledger-entry.json work/state-update-preview.json
npm run outreach-state -- ops/outreach_execution_records.json
npm run interview-campaign
npm run interview-packet
npm run interview-workspace
npm run interview-workspace-audit
npm run interview-review-brief
npm run interview-report
npm run gateway-smoke -- ops/gateway.example.json
npm run pilot-packet -- ops/merchant_intake.example.json
npm run pilot-authorization -- ops/pilot_authorization_template.json ops/merchant_intake.example.json ops/interviews.json
npm run pilot-gateway-config -- ops/pilot_authorization_template.json ops/merchant_intake.example.json ops/interviews.json ops/pilot_gateway_payment_requirements_template.json
npm run live-pilot-preflight -- ops/pilot_binding.template.json ops/signed-policy.local.json ops/gateway.x402.example.json ops/dispute_template.json
npm run pilot-traffic-action-pack -- ops/pilot_binding.template.json ops/signed-policy.local.json ops/gateway.x402.example.json ops/dispute_template.json
npm run pilot-traffic-execution-evidence -- ops/pilot_traffic_execution_template.json ops/gateway-receipts.pilot.jsonl
npm run pilot-disclosure -- ops/pilot_disclosure_template.json ops/gateway-receipts.local.jsonl
npm run merchant-promotion -- ops/merchant_promotion_template.json ops/merchant_directory.json ops/pilot_disclosure_template.json ops/gateway-receipts.local.jsonl
npm run metrics-report -- ops/gateway-receipts.local.jsonl
npm run evidence-bundle -- ops/evidence_bundle_template.json
npm run token-governance -- ops/token_governance.json
npm run readiness
npm run launch-sequence
npm run launch-handoff-brief
npm run external-action-queue
npm run external-action-workspace
npm run external-action-workspace-audit
npm run external-action-review-brief
npm run approval-runbook
npm run policy-signing-packet -- allow-policy.example.json 0x1111111111111111111111111111111111111111
npm run controller-signing-action-pack -- allow-policy.example.json 0x1111111111111111111111111111111111111111
npm run controller-signing-execution-evidence -- ops/controller_signing_execution_template.json
npm run deployment-check-evidence -- ops/deployment_check_evidence_template.json
npm run independent-contract-review -- ops/independent_contract_review_template.json
npm run validate-deployment -- ops/deployment_manifest.template.json
npm run registry-policy-intent -- ops/registry_policy_intent_template.json
npm run registry-lifecycle-intent -- ops/registry_lifecycle_intent_template.json
npm run receipt-registry-intent -- ops/receipt_registry_intent_template.json
npm run registry-transaction-evidence -- ops/registry_transaction_evidence_template.json
npm run validate-pilot-binding -- ops/pilot_binding.template.json ops/signed-policy.local.json
npm run external-action-approval -- ops/external_action_template.json
```

The operator script prints:

- current metrics
- receipt-log derived pilot evidence when `ALLOW_RECEIPT_LOG` or `ALLOW_RECEIPT_LOGS` is set
- launch readiness gates and external-action blockers
- launch critical-path sequence with the next human-approved action
- concise launch handoff brief for the current stage and evidence blockers
- external action queue with ready, blocked, and needs-fix packets
- external action workspace summary with local draft packet files and evidence templates
- external action workspace audit with hash and draft-safety checks
- approval runbook for one-at-a-time human approval, execution, and evidence validation
- execution evidence ledger-entry preview for validated X posts and outreach
- local state update preview for evidence-backed X and outreach state changes
- local canonical update set with before/after hashes for reviewed ledger and state JSON edits
- review-only pilot packet for the sample merchant intake
- merchant-approved pilot authorization checklist
- authorized pilot gateway config handoff and x402 payment-requirements checklist
- draft live pilot traffic approval packets for the allowed and denied requests
- post-execution live pilot request evidence checklist
- evidence-backed pilot integration and live-directory state report
- next backlog items
- a ready-to-edit X post
- draft external-action packets for X post approval
- post-publication X execution evidence checklist
- evidence-backed X post state report
- priority merchant outreach targets
- scored merchant prospects
- next recruiting action
- public contact candidates
- review-only outreach drafts
- draft external-action packets for outreach approval
- post-send outreach execution evidence checklist
- evidence-adjusted outreach state report
- review-only interview campaign planner with current shortfall
- review-only interview packets
- local interview prep workspace summary
- interview workspace audit with hash and incompleteness checks
- interview review brief for human handoff
- completed interview evidence report
- controller signing external-action packet status
- controller signing post-execution evidence checklist
- deployment compiler/static-analysis evidence checklist
- independent contract review evidence checklist
- the first interview questions
- a public tester ask

It does not post automatically. External posting, outreach, wallet signing, deployment, live pilot traffic, and live merchant promotion should remain human-approved. Use `npm run x-post-action-pack` to prepare X post packets, `npm run external-action-approval` for the exact final packet, `npm run x-post-execution-evidence` after human-posted X updates, `npm run execution-evidence-ledger-entry` to preview the appendable record, `npm run state-update-preview` to preview the canonical state diff, `npm run canonical-update-set` to review exact file hashes and proposed JSON, `npm run x-post-state` after adding passed records to the ledger, then repeat the evidence, ledger-preview, state-preview, and update-set flow after human-sent merchant outreach.

## Current Next Moves

- Replace the v0 signed-policy envelope with production EIP-712 verification.
- Package the paid-search demo as a copyable example for API builders.
- Recruit API and MCP builders who already charge for data, search, or inference.
- Publish simulated metrics separately from any future testnet or mainnet metrics.
- Generate a real controller-signed policy, passing deployment check evidence, passing independent contract review evidence, passing pilot wallet binding, and passing deployment manifest before public deployment.

## Growth Command

```bash
npm run growth
```

This is an alias for the operator report, tuned around merchant recruitment.

## Receipt-Driven Metrics

Gateway pilots write JSONL receipt logs. Include them in the operator report with:

```bash
ALLOW_RECEIPT_LOG=/path/to/gateway-receipts.jsonl npm run operate
```

For multiple logs:

```bash
ALLOW_RECEIPT_LOGS=/path/a.jsonl,/path/b.jsonl npm run operate
```

The derived metrics count policy decisions, allowed receipts, denied receipts, blocked value, active agents, merchants with successful upstream responses, and upstream failures. They do not mark a merchant as integrated; integration still requires merchant confirmation. Readiness treats only merchant-approved `testnet` or `mainnet` receipts as pilot evidence. Public usage claims also need a passing `npm run pilot-disclosure` packet with merchant approval and redacted receipt ids.

## Readiness Audit

Run:

```bash
npm run readiness
```

The audit checks package scripts, gateway artifacts and smoke tooling, pilot tooling, launch-pack validity, X post action-pack tooling, X post execution evidence tooling, X post state reconciliation, state update preview tooling, canonical update set tooling, prospect pipeline, merchant interview count, receipt evidence, production signed policy status, controller signing execution evidence tooling, deployment check evidence tooling, independent contract review evidence tooling, pilot wallet binding tooling, deployment manifest tooling, launch sequence tooling, external action queue, workspace, and workspace-audit tooling, required legal/security docs, and the token usage gate. A status of `needs_external_action` is expected before public launch because posting, interviews, real review, and real wallet signing require approval.
