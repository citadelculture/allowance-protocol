# Allow Pilot Evidence Handoff

Generated: 2026-06-09T16:28:30.196Z
Status: blocked_by_preflight
Merchant: not selected
Receipt log: ops/gateway-receipts.pilot.jsonl

## Safety Boundary

- This handoff is local review material only.
- It does not start pilot traffic, approve external actions, post content, send outreach, sign wallet payloads, deploy contracts, move funds, store secrets, promote merchants, approve public claims, or enable a token.
- Live pilot traffic requires human approval for the exact command and post-execution evidence for each request.

## Current State

- Traffic action pack ready: no
- Pilot evidence complete: no
- Request drafts: 0
- External-action packets: 0

## Blockers

- traffic action pack: preflight: Unable to load policy JSON from ops/signed-policy.local.json: ENOENT: no such file or directory, open '/Users/dom/Documents/Codex/2026-06-08/your-task-is-to-build-a/outputs/allow-protocol/ops/signed-policy.local.json'
- traffic action pack: preflight: policy: Policy must be a JSON object
- traffic action pack: preflight: binding: Missing pilot.merchantId
- traffic action pack: preflight: binding: Missing pilot.approvalRef
- traffic action pack: preflight: binding: Missing pilot.approvedBy
- traffic action pack: preflight: binding: Missing pilot.approvedAt
- traffic action pack: preflight: binding: Missing agent.agentId
- traffic action pack: preflight: binding: agent.walletAddress must not be the zero address
- traffic action pack: preflight: binding: Missing agent.controlEvidenceRef
- traffic action pack: preflight: binding: Missing agent.controlChallenge
- traffic action pack: preflight: binding: Missing agent.controlSignature
- traffic action pack: preflight: binding: Missing agent.approvedBy
- traffic action pack: preflight: binding: Missing agent.approvedAt
- traffic action pack: preflight: binding: Missing policy.policyId
- traffic action pack: preflight: binding: Missing policy.policyFingerprint
- traffic action pack: preflight: binding: runtime.allowAgentAddress must not be the zero address
- traffic action pack: preflight: binding: A signed policy document is required to validate pilot binding
- traffic action pack: preflight: walletControl: Missing agent.controlChallenge
- traffic action pack: preflight: walletControl: Missing agent.controlSignature
- traffic action pack: preflight: gateway: Pilot binding must include pilot.merchantId
- traffic action pack: preflight: gateway: Gateway config has no route for pilot merchant unknown
- traffic action pack: preflight: gateway: Live pilot upstream.baseUrl must not be localhost
- traffic action pack: preflight: gateway: Gateway evidence environment must be testnet or mainnet
- traffic action pack: preflight: gateway: Gateway evidence must set merchantApproved=true
- traffic action pack: preflight: gateway: Live pilot payment requirements need merchant approval
- traffic action pack: preflight: gateway: Live pilot merchant approval needs approvalRef, evidenceRef, or source
- traffic action pack: preflight: runtime: ALLOW_PRODUCTION=1 or NODE_ENV=production is required for live pilot runtime
- traffic action pack: preflight: runtime: ALLOW_REQUIRE_AGENT_SIGNATURE=1 is required for live pilot runtime
- traffic action pack: Preflight must identify the pilot gateway merchant route
- traffic action pack: Pilot traffic action pack requires allowed and denied request drafts
- No pilot merchant id is selected
- Pilot traffic handoff needs exactly two request drafts
- Missing allowed_delivery request draft
- Missing denied_guard request draft
- Pilot traffic handoff needs exactly two external-action packets

## Evidence Gaps

- pilot evidence: No receipt records found
- pilot evidence: No merchant-approved testnet or mainnet receipt evidence found
- pilot evidence: No credible allowed receipt with successful upstream response
- pilot evidence: No credible denied receipt proving the guard blocks unsafe intent
- pilot evidence: No merchant has both credible allowed delivery and credible denied guard evidence
- pilot evidence: Credible pilot needs at least 1 active agent

## Request Drafts

No pilot request drafts are ready yet.

## Packet Review

No live_pilot external-action packets are ready yet.

## Commands

- prepareActionPack: `npm run pilot-traffic-action-pack -- ops/pilot_binding.template.json ops/signed-policy.local.json ops/gateway.x402.example.json ops/dispute_template.json`
- approveAllowedTraffic: `npm run external-action-approval -- <approved-allowed-live-pilot-packet.json>`
- approveDeniedTraffic: `npm run external-action-approval -- <approved-denied-live-pilot-packet.json>`
- validateAllowedExecution: `npm run pilot-traffic-execution-evidence -- work/pilot-traffic-allowed-execution.json ops/gateway-receipts.pilot.jsonl`
- validateDeniedExecution: `npm run pilot-traffic-execution-evidence -- work/pilot-traffic-denied-execution.json ops/gateway-receipts.pilot.jsonl`
- pilotReport: `npm run pilot-report -- ops/gateway-receipts.pilot.jsonl`
- pilotDisclosure: `npm run pilot-disclosure -- ops/pilot_disclosure_template.json ops/gateway-receipts.pilot.jsonl`
- pilotIntegrationState: `npm run pilot-integration-state -- ops/pilot_traffic_execution_records.json ops/gateway-receipts.pilot.jsonl`

## Acceptance Criteria

- Live pilot preflight passes before any traffic is approved.
- Exactly two live_pilot packets are approved by a human: one allowed delivery and one denied guard.
- Allowed delivery execution evidence validates with a merchant-approved 2xx receipt.
- Denied guard execution evidence validates with a merchant-approved denied receipt and no upstream 2xx delivery.
- npm run pilot-report passes for the same receipt log before any usage, merchant-live, or distribution claim is made.

## Warnings

- Receipt log missing: /Users/dom/Documents/Codex/2026-06-08/your-task-is-to-build-a/outputs/allow-protocol/ops/gateway-receipts.pilot.jsonl
- traffic action pack: dispute: Draft dispute is not ready for merchant review
- traffic action pack: runtime: Runtime policy source was not provided in env

## Next Action

Create the signed production policy outside the repository, set ALLOW_POLICY_PATH, then rerun the pilot evidence handoff.
