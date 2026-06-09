# Launch Pipeline

The product launch target is five qualified merchant interviews, then one protected endpoint test.

No external messages should be sent automatically. The pipeline exists to prepare and track lawful, product-first outreach.

## Data Files

- `ops/prospects.json`: target prospect slots and qualification scores
- `ops/interviews.json`: completed or scheduled interview log
- `ops/interviews_template.json`: completed interview evidence template
- `ops/merchant_intake_template.json`: template to fill after each interview
- `ops/pilot_disclosure_template.json`: template for merchant-approved public pilot evidence
- `ops/pilot_authorization_template.json`: template for merchant-approved pre-traffic pilot scope
- `ops/pilot_gateway_payment_requirements_template.json`: template for x402 requirements attached to authorized pilot gateway config
- `ops/pilot_traffic_execution_template.json`: template for post-execution live pilot request evidence
- `ops/merchant_promotion_template.json`: template for live merchant listing approval
- `ops/external_action_template.json`: template for final human approval before external side effects
- `ops/controller_signing_execution_template.json`: template for post-signing controller policy evidence
- `ops/deployment_check_evidence_template.json`: template for compiler/static-analysis deployment check evidence
- `ops/independent_contract_review_template.json`: template for independent `AllowanceRegistry` review evidence
- `ops/x_post_execution_template.json`: template for post-publication X evidence
- `ops/x_post_execution_records.json`: ledger of validated post-publication X records
- `ops/outreach_execution_template.json`: template for post-send merchant outreach evidence
- `ops/outreach_execution_records.json`: ledger of validated post-send outreach records
- `ops/evidence_bundle_template.json`: template for hash-checked evidence references
- `ops/outreach_targets.json`: source-backed segment map
- `ops/contact_candidates.json`: public contact paths and draft readiness
- `docs/LAUNCH_SEQUENCE.md`: critical-path stage definitions for human-approved launch actions
- `docs/EXTERNAL_ACTION_QUEUE.md`: unified queue for ready and blocked external action packets

## Commands

```bash
npm run growth
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
npm run interview-packet
npm run interview-workspace
npm run interview-workspace-audit
npm run interview-review-brief
npm run interview-report
npm run gateway-smoke -- ops/gateway.example.json
npm run pilot-kit -- ops/merchant_intake.example.json
npm run pilot-packet -- ops/merchant_intake.example.json
npm run pilot-authorization -- ops/pilot_authorization_template.json ops/merchant_intake.example.json ops/interviews.json
npm run pilot-gateway-config -- ops/pilot_authorization_template.json ops/merchant_intake.example.json ops/interviews.json ops/pilot_gateway_payment_requirements_template.json
npm run live-pilot-preflight -- ops/pilot_binding.template.json ops/signed-policy.local.json ops/gateway.x402.example.json ops/dispute_template.json
npm run pilot-traffic-action-pack -- ops/pilot_binding.template.json ops/signed-policy.local.json ops/gateway.x402.example.json ops/dispute_template.json
npm run pilot-traffic-execution-evidence -- ops/pilot_traffic_execution_template.json ops/gateway-receipts.pilot.jsonl
npm run pilot-integration-state -- ops/pilot_traffic_execution_records.json ops/gateway-receipts.pilot.jsonl
npm run pilot-report -- ops/gateway-receipts.local.jsonl
npm run pilot-disclosure -- ops/pilot_disclosure_template.json ops/gateway-receipts.local.jsonl
npm run merchant-promotion -- ops/merchant_promotion_template.json ops/merchant_directory.json ops/pilot_disclosure_template.json ops/gateway-receipts.local.jsonl
npm run validate-dispute -- ops/dispute_template.json
npm run policy-signing-packet -- allow-policy.example.json 0x1111111111111111111111111111111111111111
npm run controller-signing-action-pack -- allow-policy.example.json 0x1111111111111111111111111111111111111111
npm run controller-signing-execution-evidence -- ops/controller_signing_execution_template.json
npm run deployment-check-evidence -- ops/deployment_check_evidence_template.json
npm run independent-contract-review -- ops/independent_contract_review_template.json
npm run validate-deployment -- ops/deployment_manifest.template.json
npm run validate-pilot-binding -- ops/pilot_binding.template.json ops/signed-policy.local.json
npm run metrics-report -- ops/gateway-receipts.local.jsonl
npm run external-action-approval -- ops/external_action_template.json
npm run evidence-bundle -- ops/evidence_bundle_template.json
npm run token-governance -- ops/token_governance.json
npm run launch-sequence
npm run launch-handoff-brief
npm run external-action-queue
npm run external-action-workspace
npm run external-action-workspace-audit
npm run external-action-review-brief
npm run approval-runbook
```

The growth report returns:

- top outreach segments
- scored prospects
- next recruiting action
- contact candidates
- draft external-action packets for X post approval
- post-publication X execution evidence checklist
- evidence-backed X post state report
- review-only outreach drafts
- draft external-action packets for outreach approval
- approval runbook for one-at-a-time approval, manual execution, and evidence collection
- post-send outreach execution evidence checklist
- local state update preview for evidence-backed X and outreach state changes
- local canonical update set with before/after hashes for reviewed ledger and state JSON edits
- evidence-adjusted outreach state report
- review-only interview packets
- validated interview evidence report
- public tester ask
- first interview questions

The pilot kit turns a validated intake into gateway config, smoke-test commands, and acceptance criteria. The pilot authorization report validates merchant-approved pre-traffic scope after a completed interview and validated intake. The pilot gateway config report turns that authorization plus x402 payment requirements into a gateway config draft for live preflight without starting traffic. The live pilot preflight validates signed policy, binding, wallet-control proof, merchant-approved gateway config, dispute path, and runtime safety before traffic. The pilot traffic action pack turns a passing preflight into draft `live_pilot` external-action packets for the allowed and denied requests. The pilot traffic execution evidence report validates one human-run request against the approved packet and receipt ids. The pilot report validates gateway receipt logs after a merchant-approved test and exits nonzero until the full pilot evidence is credible. The pilot disclosure report validates the redacted, merchant-approved evidence packet before any public usage claim. The merchant promotion report validates the signed live listing against that approved evidence before the directory status changes to `live`.

The metrics report rolls receipt logs into launch metrics for public updates. Keep `integratedMerchants` at zero until the merchant confirms the test integration bar. The X post action pack turns draft-only X posts into unapproved `x_post` packets before the account owner posts. The X post execution evidence report validates the exact public post after a human publishes it. The execution evidence ledger-entry report previews the appendable record for the matching execution ledger. The state update preview shows the exact `launch/x_posts.json` or `ops/prospects.json` changes implied by that append preview before canonical state is edited. The canonical update set packages the reviewed ledger and state JSON replacements with before/after hashes while still leaving canonical files untouched. The X post state report reconciles those records against `launch/x_posts.json` so public post state is evidence-backed. The controller signing action pack turns a no-secret policy signing packet into a draft `controller_policy_signature` external-action packet before the wallet owner signs typed data. The controller signing execution evidence report validates the signed policy, storage handoff, ceremony env, and redacted proof after the human signs. The deployment check evidence report validates `npm test`, automated contract review, compiler artifact, static-analysis report, source hash, and no-side-effect safety flags. The independent contract review evidence report validates reviewer independence, exact source hash, scope coverage, finding status, redacted proof, and safety flags before the deployment manifest can cite the review. The external action approval report validates the exact human step before any account, wallet, deployment, pilot, or directory side effect. The outreach execution evidence report validates the exact post-send merchant outreach record without counting an interview. The outreach state report reconciles those records against prospect statuses so pipeline movement is evidence-backed. The evidence bundle report hashes the exact files behind a claim or approval without copying raw evidence.

The launch sequence report orders those validators into the current critical path. It can say a stage is ready for human action, waiting for evidence, or blocked by prior evidence, but it never executes the external action itself. The launch handoff brief turns the sequence plus local action/interview review briefs into one concise markdown file for the next human-approved step.

The external action queue turns the current action packs into one approval board. It highlights draft packets ready for final approval, packet generators that need data fixes, and future actions that are still blocked by evidence gates.

The external action workspace writes the ready draft packets from that board into local review files with a manifest, checklist, and incomplete evidence templates. The audit verifies hashes and confirms the files remain draft/template-only. Neither command changes approval status or executes the actions.

## Prospect States

`contactStatus`:

- `needs_contact_discovery`
- `identified`

`outreachStatus`:

- `not_started`
- `sent`
- `replied`
- `declined`

`interviewStatus`:

- `not_started`
- `scheduled`
- `completed`

Completed interviews count toward readiness only when `npm run interview-report` passes. Before interview execution, use `npm run interview-workspace`, `npm run interview-workspace-audit`, and `npm run interview-review-brief` so the human operator reviews audited prep files rather than ad hoc notes. Each completed record needs at least five answered questions, safety approvals, and a linked merchant intake JSON that validates.

Scheduled interviews need `scheduledAt`, `scheduledBy`, `channel`, safety approvals, and `outreachEvidenceRef` pointing to validated scheduled outreach evidence. Scheduling still does not count toward the five completed interviews.

`integrationStatus`:

- `not_started`
- `testing`
- `integrated`

## Execution Rule

Do not mark a prospect as `integrated` until:

- one allowed receipt is captured
- one denied receipt is captured
- `npm run pilot-packet` is reviewed with the merchant before traffic
- `npm run pilot-authorization` passes with completed interview, validated intake, merchant-approved scope, spend cap, dispute path, and no-public-claims boundary
- `npm run pilot-gateway-config` passes with merchant-approved authorization and matching x402 payment requirements
- `npm run validate-pilot-binding` passes for the approved agent wallet and signed policy
- `npm run controller-signing-execution-evidence` passes before the signed policy is used for production-mode pilot runtime
- `npm run live-pilot-preflight` passes before merchant-approved traffic
- `npm run pilot-traffic-action-pack` generates two draft `live_pilot` packets and each passes `npm run external-action-approval` after human approval
- `npm run pilot-traffic-execution-evidence` passes for each human-run allowed and denied request
- `npm run gateway-smoke` passes locally before merchant traffic
- `npm run pilot-report` passes for merchant-approved testnet or mainnet evidence
- `npm run pilot-disclosure` passes before public claims, screenshots, directory proof links, or case studies reference those receipts
- `npm run merchant-promotion` passes before a directory entry is marked `live`
- `npm run validate-dispute` passes for the agreed dispute packet path
- `npm run metrics-report` shows the pilot in policy decision metrics
- `npm run evidence-bundle` passes before public claims cite multiple evidence artifacts
- `/health` confirms the gateway route and receipt log path
- the merchant confirms the denial reason was useful
- the merchant understands Allow is experimental and not audited
- `npm run token-governance` keeps token launch disabled until legal-review readiness is proven

## First Five Prospect Slots

1. Agentic Market: Market Research services
2. Agentic Market: Morning Briefing services
3. Agentic Market: IPO Analysis services
4. Public MCP remote research servers
5. Base agent wallet and x402 service builders

These are slots to investigate, not claims of partnership.

## Contact Discovery

Start with the top prospect:

- Market Research bundle: https://agentic.market/bundles/market-research
- Provider hints: Blockrun / Exa Neural Search, Parallel / Parallel Search, toon.haus finance endpoints
- Ask: whether Allow should guard the whole bundle, each service call, or the agent wallet before bundle execution.

Do not record a partnership or integration until the test integration bar is satisfied.

## Review-Only Drafts

`npm run growth` includes outreach drafts, but it does not send them. `npm run x-post-action-pack` turns draft-only X posts into unapproved `x_post` packets with exact text and destination. `npm run outreach-approval` validates outreach drafts before any account owner approves external sending. `npm run outreach-action-pack` turns valid drafts into unapproved `merchant_outreach` external-action packets with exact text and destination.

Every external message needs action-time approval for:

- destination
- channel
- exact text
- data being sent

Run `npm run external-action-approval` for the final packet before the human sends or posts it.

After a human posts from X, run `npm run x-post-execution-evidence` with the approved packet, exact posted text, public post URL, and redacted proof before citing the post in an evidence bundle. Then run `npm run execution-evidence-ledger-entry -- <filled-x-post-evidence.json>` to build a local append preview, `npm run state-update-preview -- work/execution-evidence-ledger-entry.json` to preview the `launch/x_posts.json` diff, and `npm run canonical-update-set -- work/execution-evidence-ledger-entry.json work/state-update-preview.json` to review file hashes and proposed JSON. Add the reviewed passed record to `ops/x_post_execution_records.json`, apply only the previewed state change, then run `npm run x-post-state` before marking any launch post as posted.

After a human sends merchant outreach, run `npm run outreach-execution-evidence` with the approved packet and redacted proof, then `npm run execution-evidence-ledger-entry -- <filled-outreach-evidence.json>`, `npm run state-update-preview -- work/execution-evidence-ledger-entry.json`, and `npm run canonical-update-set -- work/execution-evidence-ledger-entry.json work/state-update-preview.json` before changing prospect response state.

Before changing `ops/prospects.json`, run `npm run outreach-state` to confirm the proposed outreach state is not ahead of validated execution evidence. Before marking a prospect `integrated` or a merchant directory entry `live`, run `npm run pilot-integration-state` to confirm the proposed integration state is backed by allowed and denied pilot execution evidence plus a passing pilot report.
