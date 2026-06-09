# Allow Production Policy Handoff

Generated: 2026-06-09T17:36:28.707Z
Status: blocked_by_policy_template
Controller: 0xController
Policy: allow_policy_demo_alpha
Fingerprint: 10cee07e

## Safety Boundary

- This handoff is local review material only.
- It does not approve external actions, sign wallet payloads, store signed policies, store secrets, start runtime, start pilot traffic, deploy contracts, move funds, post content, send outreach, or enable a token.
- The controller wallet owner must approve the exact packet before signing typed data.

## Current State

- Controller signing action pack ready: no
- Controller signing evidence verified: no
- Controller signing packets: 1

## Blockers

- controller signing action pack: Production policy controller must be a 20-byte EVM address

## Evidence Gaps

- controller signing evidence: Missing evidenceId
- controller signing evidence: Missing generatedAt
- controller signing evidence: Missing approvalRef
- controller signing evidence: approvalPacket must include the final approved controller_policy_signature external-action packet
- controller signing evidence: signedPolicy must include the post-signature production policy JSON
- controller signing evidence: Missing signing.signedAt
- controller signing evidence: Missing signing.signedBy
- controller signing evidence: Missing signing.walletAddress
- controller signing evidence: Invalid signing.method
- controller signing evidence: signing.humanExecuted must be true
- controller signing evidence: signing.walletOwnerApproved must be true
- controller signing evidence: Invalid storage.type
- controller signing evidence: Missing storage.path
- controller signing evidence: Missing storage.storedAt
- controller signing evidence: Missing storage.storedBy
- controller signing evidence: storage.accessLimited must be true
- controller signing evidence: storage.noPrivateKeyMaterial must be true
- controller signing evidence: storage.runtimeSourceConfigured must be true
- controller signing evidence: Invalid proof.type
- controller signing evidence: Missing proof.ref
- controller signing evidence: Missing proof.capturedAt
- controller signing evidence: proof.redacted must be true

## Packet Review

- `controller_policy_signature_allow_policy_demo_alpha` (draft): Controller wallet signs Allow production policy allow_policy_demo_alpha

## Commands

- signingPacket: `npm run policy-signing-packet -- allow-policy.example.json <controller-address>`
- actionPack: `npm run controller-signing-action-pack -- allow-policy.example.json <controller-address>`
- approvePacket: `npm run external-action-approval -- <approved-controller-signing-packet.json>`
- validateExecutionEvidence: `npm run controller-signing-execution-evidence -- ops/controller_signing_execution_template.json`
- verifySignedPolicy: `npm run verify-policy -- <signed-policy.json>`
- ceremonyAudit: `ALLOW_PRODUCTION=1 ALLOW_REQUIRE_AGENT_SIGNATURE=1 ALLOW_EXPECTED_CONTROLLER=<controller-address> npm run ceremony-audit -- <signed-policy.json>`
- readinessWithPolicy: `ALLOW_POLICY_PATH=<signed-policy.json> npm run readiness`
- pilotEvidenceHandoff: `ALLOW_POLICY_PATH=<signed-policy.json> npm run pilot-evidence-handoff`

## Acceptance Criteria

- Production policy template uses a real 20-byte controller address.
- controller_policy_signature packet is approved by a human owner before signing.
- Typed data is signed in a wallet UI, hardware wallet, Safe, or approved wallet flow without exposing private-key material.
- Signed policy JSON is stored outside the repository or in a gitignored local path.
- controller-signing-execution-evidence passes before ALLOW_POLICY_PATH is used for pilot runtime.

## Warnings

- controller signing action pack: verifyingContract is zero address; set the deployed verifier or registry before public mainnet use
- controller signing action pack: Controller still matches the demo placeholder

## Next Action

Set ALLOW_EXPECTED_CONTROLLER to the real controller wallet address and regenerate the production policy handoff.
