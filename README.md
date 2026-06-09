# Allow Protocol

Allow Protocol is the allowance layer for autonomous AI payments.

It gives wallet-bearing agents spend policies before they can pay APIs, MCP servers, data vendors, inference endpoints, or other services. The first version ships as a local simulator, policy engine, receipt ledger, and no-custody Solidity registry prototype.

**The problem:** giving an autonomous agent a wallet means giving it a signer that can approve anything. There is no native concept of an allowance — a bounded budget, an approved counterparty list, a per-transaction ceiling — between the agent and its funds. Allow Protocol is that layer. Every payment the agent attempts becomes a signed, replay-protected receipt that is checked against a controller-signed policy *before* value moves: allow, route to human review, or deny.

It is no-custody by design — the protocol never holds funds, it only authorizes and records. It is x402-native and MCP-native, so it sits exactly where autonomous payment volume is forming.

## Live deployment

`AllowanceRegistry` — the no-custody policy/receipt registry — is live on Base mainnet:

| | |
|---|---|
| Address | [`0x047B375f044B76efBdCE655Ab6b7EE142129c266`](https://basescan.org/address/0x047B375f044B76efBdCE655Ab6b7EE142129c266) |
| Chain | Base (8453) |
| Deploy tx | `0xaa7f127ba8a15b4bbe64ba3f1ddad9c5973286506dbaec29c4d3019c1f83f636` |

Resolve it from the SDK without hardcoding:

```js
import { allowanceRegistryAddress } from "allow-protocol/deployments";

const registry = allowanceRegistryAddress("base"); // or by chain id: allowanceRegistryAddress(8453)
```

The contract custodies no funds — it records controller-signed policies and policy-bounded receipts only. It is a prototype and has not had an independent audit.

## 30-second demo

```bash
npm install
npm run demo
```

Runs the real policy engine against five payments an agent might attempt — a metered search, an inference call, an off-policy swap, a PII leak in metadata, and a replayed receipt — and shows which clear and which get stopped. No network, no keys.

## Wrap your agent's fetch (x402 client)

The fastest integration: wrap the `fetch` your agent already uses. When a server
answers with HTTP 402, the allowance is checked **before** any payment is signed
— off-policy or over-budget payments are blocked, never paid.

```js
import { createAllowFetch } from "allow-protocol/allow-fetch";
import { createX402Payer } from "allow-protocol/x402-payer";
import { privateKeyToAccount } from "viem/accounts";

const fetch = createAllowFetch({
  policy: controllerSignedPolicy,        // daily/per-tx caps, merchant allowlist, PII rules
  resolveMerchant: (req) => merchantFor(req.payTo),
  pay: createX402Payer({ account: privateKeyToAccount(AGENT_KEY) }) // signs USDC EIP-3009; only runs if the allowance approves
});

// Use it like normal fetch. Blocked payments throw AllowancePaymentBlockedError.
const res = await fetch("https://api.vendor.com/search");
```

`createX402Payer` signs the x402 `exact`-scheme USDC authorization (EIP-3009) off-chain and returns the `X-PAYMENT` header. It is only invoked after the allowance clears the payment — over-cap, off-allowlist, PII, or replayed requests never reach the signer.

Run the live local example (mock x402 server, no network, no keys):

```bash
npm run example:allow-fetch
```

## Run

```bash
npm start
```

Open `http://127.0.0.1:4173`.

## Test

```bash
npm test
```

## Builder Quickstart

```bash
npm run builder-quickstart
```

This emits a local onboarding report with allow, deny, and replay checks plus curl commands for `PORT=4174 npm start`. The running demo also serves the same report at `GET /api/builder/quickstart`. It is descriptive only: it does not post, send outreach, sign wallet payloads, deploy contracts, move funds, use private keys, or use API tokens.

## Example API

```bash
npm run example:paid-api
```

Plain upstream for gateway demos:

```bash
npm run example:plain-api
```

MCP tool guard example:

```bash
npm run example:mcp-guard -- "agent payments"
```

Wallet policy hook example:

```bash
npm run example:wallet-hook -- "public search request"
```

Base Sepolia `viem` wallet-client compatibility example:

```bash
npm run example:viem-wallet -- "public Base wallet request"
```

## Gateway

```bash
npm run gateway -- ops/gateway.example.json
```

Validate gateway pilot receipts:

```bash
npm run pilot-report -- ops/gateway-receipts.local.jsonl
```

This exits nonzero until the log contains merchant-approved testnet or mainnet evidence with an allowed 2xx delivery and a denied guard receipt for the same merchant.

Prepare the local handoff for collecting that evidence:

```bash
npm run pilot-evidence-handoff
```

This writes `work/pilot-evidence-handoff.md` with the live pilot action-pack command, the two human approval commands, both execution-evidence validators, and the final pilot report/disclosure/state commands. It does not approve or run traffic.

Run a local gateway integration smoke:

```bash
npm run gateway-smoke -- ops/gateway.example.json
```

This proves the gateway health endpoint, one allowed upstream delivery, and one denied metadata guard response without starting external servers. It is local-only proof, not pilot evidence.

Gateway configs may include a `merchants` array for approved pilot merchant profiles. Route callers still cannot choose merchant identity or price; both come from server-side config and the controller-signed policy.

Roll pilot receipts into launch metrics:

```bash
npm run metrics-report -- ops/gateway-receipts.local.jsonl
```

Validate a hash-checked evidence bundle:

```bash
npm run evidence-bundle -- ops/evidence_bundle_template.json
```

The template exits nonzero until real artifact hashes and approval references are filled in. Use bundles to cite exact evidence files without copying raw receipts or secrets.

Validate a merchant-approved public pilot disclosure packet:

```bash
npm run pilot-disclosure -- ops/pilot_disclosure_template.json ops/gateway-receipts.local.jsonl
```

The template exits nonzero. Public usage claims need a valid, redacted disclosure packet with merchant approval before the launch pack can use that evidence reference.

Audit launch readiness:

```bash
npm run readiness
```

Show the ordered launch critical path:

```bash
npm run launch-sequence
npm run launch-handoff-brief
```

The sequencer names the next human-approved action and evidence blockers. The handoff brief writes `work/launch-handoff-brief.md` with the current stage, ready approval packets, interview prep summary, open gates, and blocked evidence. Neither command posts, sends outreach, signs, deploys, runs traffic, moves funds, or enables tokens.

Show the pending external action queue:

```bash
npm run external-action-queue
```

The queue lists draft packets that are ready for approval, packets that need fixes, and future external actions blocked by missing evidence. It does not execute anything.

Write the ready draft packets to a local review workspace:

```bash
npm run external-action-workspace
npm run external-action-workspace-audit
npm run external-action-review-brief
npm run approval-runbook
```

The workspace creates `work/external-action-workspace/manifest.json`, `REVIEW_CHECKLIST.md`, unapproved draft packet files, and incomplete post-execution evidence templates. The audit recomputes hashes and confirms those files are still draft/template-only. The review brief writes `work/external-action-review-brief.md` as a concise local reviewer summary. The approval runbook writes `work/approval-runbook.md` with per-action approval, manual execution, evidence, and safety steps. None of these commands approves or executes any external action.

Validate the no-token governance lock:

```bash
npm run token-governance -- ops/token_governance.json
```

This should pass while the token remains locked. It does not permit token launch; it only proves launch, transfer, sale, airdrop, liquidity, market-making, promotion, and return-claim switches remain disabled.

Review the no-custody registry before any deployment:

```bash
npm run contract-review
```

Validate compiler/static-analysis evidence before any deployment:

```bash
npm run deployment-check-evidence -- ops/deployment_check_evidence_template.json
```

The template exits nonzero until `npm test`, automated contract review, compiler artifact, static-analysis report, matching source hash, and no-side-effect safety flags are filled in.

Validate independent contract review evidence before any deployment:

```bash
npm run independent-contract-review -- ops/independent_contract_review_template.json
```

The template exits nonzero until a real reviewer, source hash, scope coverage, findings, redacted proof, and safety flags are filled in. Passing it does not deploy or approve deployment; it produces the evidence fields needed by the deployment manifest.

Validate the deployment manifest before any contract deploy:

```bash
npm run validate-deployment -- ops/deployment_manifest.template.json
```

The template exits nonzero until real source hash, deployment check evidence, independent-review evidence, multisig, and approval evidence is filled in.

Prepare a dry-run registry policy creation packet:

```bash
npm run registry-policy-intent -- ops/registry_policy_intent_template.json
```

The template exits nonzero until it contains the real controller, deployed registry address, settlement token, nonzero controller nonce, and agent wallet. The command emits calldata, merchant id hashes, and the expected onchain `policyId` only.

Prepare a dry-run registry lifecycle update packet:

```bash
npm run registry-lifecycle-intent -- ops/registry_lifecycle_intent_template.json
```

The template exits nonzero until it contains a real registry address, controller, chain id, nonzero policy id, and a reviewed lifecycle action. Use this for policy deactivation and merchant allowlist changes.

Validate post-execution registry transaction evidence:

```bash
npm run registry-transaction-evidence -- ops/registry_transaction_evidence_template.json
```

The template exits nonzero until a confirmed public transaction, approval reference, intent hash, registry address, and action-specific expected result are filled in.

Prepare a dry-run registry receipt write packet:

```bash
npm run receipt-registry-intent -- ops/receipt_registry_intent_template.json
```

The template exits nonzero until it contains a merchant-approved receipt, deployed registry address, recorder, and the `bytes32` policy id emitted by `AllowanceRegistry.createPolicy`. The command emits calldata and hash commitments only; it does not sign or broadcast.

Gateway health:

```bash
curl -s http://127.0.0.1:4190/health
```

## Operate

```bash
npm run operate
```

## Growth

```bash
npm run growth
```

Validate a merchant intake:

```bash
npm run validate-merchant -- ops/merchant_intake.example.json
```

Plan the next review-only merchant interview batch:

```bash
npm run interview-campaign
npm run interview-workspace
npm run interview-workspace-audit
npm run interview-review-brief
npm run interview-completion-handoff
```

This does not send outreach or count interviews. The campaign prints ready packets, blocked candidates, and the remaining shortfall before the five-interview gate can pass. The workspace writes local interview packet, completed-record, and merchant-intake templates under `work/interview-workspace/`. The audit confirms those prep files still match the manifest and remain incomplete. The review brief writes `work/interview-review-brief.md` as a concise local handoff for human review. The completion handoff writes `work/interview-completion-handoff.md` with the current valid-interview count, evidence gaps, and per-candidate completion commands.

Validate the merchant directory:

```bash
npm run merchant-directory
```

This also verifies EIP-712 signatures for any merchant marked `live`.

Validate a receipt-bound dispute packet:

```bash
npm run validate-dispute -- ops/dispute_template.json
```

Verify a signed merchant profile:

```bash
npm run verify-merchant-profile -- ops/signed-merchant-profile.local.json
```

Validate a live merchant promotion packet:

```bash
npm run merchant-promotion -- ops/merchant_promotion_template.json ops/merchant_directory.json ops/pilot_disclosure_template.json ops/gateway-receipts.local.jsonl
```

The template exits nonzero. A live directory listing needs a signed live profile, credible pilot receipts, and a merchant-approved disclosure packet scoped for `merchant_directory`.

Reconcile prospect integration and live directory state:

```bash
npm run pilot-integration-state
```

This keeps `integrationStatus: "integrated"` and directory `status: "live"` behind validated allowed and denied pilot execution evidence plus a passing pilot receipt report.

Generate an owner-only credential rotation handoff after any pasted wallet/API secret:

```bash
npm run credential-rotation-handoff
```

The handoff writes `work/credential-rotation-handoff.md` with owner actions, redacted incident update snippets, and post-rotation checks. It does not move funds, revoke tokens, store secrets, store replacement credentials, post, deploy, sign, or update canonical state.

Sign and verify an agent payment intent:

```bash
ALLOW_AGENT_PRIVATE_KEY=0x... npm run sign-agent-intent -- agent-intent.example.json allow-policy.example.json
ALLOW_REQUIRE_AGENT_SIGNATURE=1 npm run verify-agent-intent -- signed-agent-intent.local.json allow-policy.example.json
```

Generate a no-secret controller policy signing packet:

```bash
npm run production-policy-handoff
npm run policy-signing-packet -- allow-policy.example.json 0x1111111111111111111111111111111111111111
npm run controller-signing-action-pack -- allow-policy.example.json 0x1111111111111111111111111111111111111111
```

The handoff writes `work/production-policy-handoff.md` with signing, approval, execution-evidence, ceremony, readiness, and pilot follow-up commands. The signing-packet command prints the unsigned production policy and EIP-712 typed data for an external controller wallet to sign. The action-pack command turns that signing packet into a draft `controller_policy_signature` external-action approval packet. None of these commands signs, stores, or requests private keys.

Validate the post-signing execution record after the controller owner signs and stores the policy:

```bash
npm run controller-signing-execution-evidence -- ops/controller_signing_execution_template.json
```

The template exits nonzero until it includes the approved signing packet, signed production policy, human signing details, storage handoff, redacted proof, and ceremony runtime env.

Validate a production pilot agent wallet binding:

```bash
npm run validate-pilot-binding -- ops/pilot_binding.template.json ops/signed-policy.local.json
```

The template exits nonzero until a real approved wallet, merchant approval, signed policy, and runtime evidence are attached.

Generate a merchant pilot kit:

```bash
npm run pilot-kit -- ops/merchant_intake.example.json
```

Generate a review-only merchant pilot packet:

```bash
npm run pilot-packet -- ops/merchant_intake.example.json
```

This combines intake readiness, gateway config with the generated merchant profile, local smoke results, commands, and human approval checklist. It does not imply merchant approval.

Validate merchant-approved pilot scope before binding an agent wallet:

```bash
npm run pilot-authorization -- ops/pilot_authorization_template.json ops/merchant_intake.example.json ops/interviews.json
```

The template exits nonzero until a completed interview, validated intake, merchant-approved endpoint scope, spend cap, dispute path, and safety approvals are attached. It does not start traffic or approve public claims.

Build an authorized pilot gateway config draft:

```bash
npm run pilot-gateway-config -- ops/pilot_authorization_template.json ops/merchant_intake.example.json ops/interviews.json ops/pilot_gateway_payment_requirements_template.json
```

This turns a passing pilot authorization plus x402 payment requirements into a gateway config shaped for live preflight. It exits nonzero for missing payment requirements and does not start traffic.

Validate live pilot preflight before merchant-approved traffic:

```bash
npm run live-pilot-preflight -- ops/pilot_binding.template.json ops/signed-policy.local.json ops/gateway.x402.example.json ops/dispute_template.json
```

This checks signed policy, pilot binding, wallet-control proof, merchant-approved gateway config, dispute path, and runtime safety flags. It does not start traffic or move funds.

Generate human-approval packets for the two pilot traffic requests:

```bash
npm run pilot-traffic-action-pack -- ops/pilot_binding.template.json ops/signed-policy.local.json ops/gateway.x402.example.json ops/dispute_template.json
```

This creates draft `live_pilot` external-action packets for one allowed delivery request and one denied guard request. It exits nonzero until live preflight passes and never sends traffic itself.

Validate one executed pilot traffic request against its approved packet and receipt:

```bash
npm run pilot-traffic-execution-evidence -- ops/pilot_traffic_execution_template.json ops/gateway-receipts.pilot.jsonl
```

The template exits nonzero until it contains the approved `live_pilot` packet, human execution details, redacted proof, and matching merchant-approved receipt ids. It does not replace `pilot-report`, which still proves the full allowed plus denied pilot bar.

Validate the X launch pack:

```bash
npm run launch-pack
npm run x-post-action-pack
```

For quantified usage claims, pass approved disclosure evidence:

```bash
ALLOW_DISCLOSURE_PATHS=ops/approved-pilot-disclosure.json ALLOW_RECEIPT_LOG=ops/gateway-receipts.pilot.jsonl npm run launch-pack
ALLOW_DISCLOSURE_PATHS=ops/approved-pilot-disclosure.json ALLOW_RECEIPT_LOG=ops/gateway-receipts.pilot.jsonl npm run x-post-action-pack
```

The X post action pack creates unapproved `x_post` packets from the draft-only launch posts. It validates claim safety, exact text, account handle, and local assets, but it does not post. `npm run launch-post-action-pack` is kept as an alias.

Validate the final human approval packet before any external action:

```bash
npm run external-action-approval -- ops/external_action_template.json
```

This applies to X posts, outreach, wallet signing, deployment, live pilot traffic, and merchant live-listing promotion. The template exits nonzero until exact action text, approval owner, and safety flags are complete.

After a human posts from X, validate the execution evidence:

```bash
npm run x-post-execution-evidence -- ops/x_post_execution_template.json
npm run execution-evidence-ledger-entry -- ops/x_post_execution_template.json
npm run state-update-preview -- work/execution-evidence-ledger-entry.json
npm run canonical-update-set -- work/execution-evidence-ledger-entry.json work/state-update-preview.json
```

The template exits nonzero until it includes the approved `x_post` packet, exact posted text, account handle, public post URL, redacted proof, and human/no-automation execution flags. The ledger-entry command writes a local append preview for `ops/x_post_execution_records.json`; it does not mutate the canonical ledger. The state-update preview writes a local diff for `launch/x_posts.json`; it does not mutate canonical state. The canonical update set writes a local review packet with before/after hashes and proposed JSON for both files.

Reconcile public post state after adding passed execution evidence to the records ledger:

```bash
npm run x-post-state -- ops/x_post_execution_records.json
```

The default ledger starts empty. It fails if a launch post is marked `posted` without matching validated execution evidence.

Validate review-only outreach drafts:

```bash
npm run outreach-approval
```

This checks outbound messages for draft-only status, safe destination, no token hype, no unapproved partnership or usage claims, and no secret-looking text. It does not send messages.

Generate draft external-action packets for those outreach drafts:

```bash
npm run outreach-action-pack
```

These packets remain unapproved until a human owner fills approval attribution and safety flags, then runs `npm run external-action-approval -- <packet>`.

Validate post-send merchant outreach evidence:

```bash
npm run outreach-execution-evidence -- ops/outreach_execution_template.json
npm run execution-evidence-ledger-entry -- ops/outreach_execution_template.json
npm run state-update-preview -- work/execution-evidence-ledger-entry.json
npm run canonical-update-set -- work/execution-evidence-ledger-entry.json work/state-update-preview.json
```

The template exits nonzero until a human-sent outreach record includes the approved packet, exact sent text, redacted proof, and execution flags. The ledger-entry command writes a local append preview for `ops/outreach_execution_records.json`; it does not mutate the canonical ledger. The state-update preview writes a local diff for `ops/prospects.json`; it does not mutate canonical state or count interviews. The canonical update set writes a local review packet with before/after hashes and proposed JSON for both files.

Reconcile outreach evidence against prospect state:

```bash
npm run outreach-state -- ops/outreach_execution_records.json
```

This fails if prospect statuses advance beyond valid send evidence.

Generate review-only merchant interview packets:

```bash
npm run interview-packet
npm run interview-packet -- blockrun-partners
npm run interview-workspace
npm run interview-workspace-audit
npm run interview-review-brief
npm run interview-completion-handoff
```

This turns contact candidates into interview questions, intake fields, and human approval boundaries. The review brief summarizes the audited prep files, blocked candidates, and completion steps. The completion handoff maps that prep to the exact evidence required before `growth.interviews` can pass. It does not send outreach or count as a completed interview.

Validate merchant interview evidence:

```bash
npm run interview-report
```

Completed interviews count only when they include at least five answers, safety approvals, and a linked merchant intake JSON that validates.
Scheduled interviews also need `scheduledAt`, `scheduledBy`, `channel`, safety approvals, and a matching scheduled `outreachEvidenceRef`; they still do not count as completed interviews.

## What Is Included

- `index.html`: dashboard and simulator
- `src/policyEngine.mjs`: reusable policy evaluator
- `server.mjs`: static server and JSON evaluation endpoint
- `src/httpPreflight.mjs`: x402-style preflight integration module
- `src/httpMiddleware.mjs`: dependency-free paid route middleware
- `src/gateway.mjs`: config-driven Allow gateway for existing paid APIs
- `src/gatewaySmoke.mjs`: no-network local gateway allow/deny smoke harness
- `src/mcpGuard.mjs`: JSON-RPC/MCP `tools/call` payment guard
- `src/walletHook.mjs`: no-custody wallet action policy hook
- `src/agentIntentSigner.mjs`: EIP-712 agent payment intent signing and verification
- `src/policySigningPacket.mjs`: no-secret EIP-712 controller signing packet builder
- `src/pilotBinding.mjs`: production pilot binding validator for real agent wallets and signed policies
- `src/rateLimit.mjs`: fixed-window rate limits for paid routes and gateways
- `src/settlementProof.mjs`: fail-closed settlement proof verification boundary
- `src/x402Facilitator.mjs`: x402 facilitator `/verify` and optional `/settle` adapter
- `src/x402Smoke.mjs`: dry-run/live x402 facilitator smoke harness with live-readiness gates
- `src/receiptStore.mjs`: JSONL and memory receipt logs for pilot evidence
- `src/registryLifecycleIntent.mjs`: dry-run calldata builder for policy deactivation and merchant allowlist updates
- `src/interviewCampaign.mjs`: review-only interview campaign planner for the five-interview growth gate
- `src/registryPolicyIntent.mjs`: dry-run calldata and expected policy id builder for `AllowanceRegistry.createPolicy`
- `src/receiptRegistryIntent.mjs`: dry-run calldata and hash packet builder for `AllowanceRegistry.recordReceipt`
- `src/registryTransactionEvidence.mjs`: post-execution public transaction evidence validator for registry actions
- `src/pilotEvidence.mjs`: pilot evidence report and acceptance gate
- `src/evidenceBundle.mjs`: hash-checked evidence bundle manifest validator
- `src/pilotDisclosure.mjs`: merchant-approved redacted disclosure gate for public pilot claims
- `src/distributionClaims.mjs`: public launch claims guard for token, hype, and unsupported usage claims
- `src/tokenGovernance.mjs`: no-token lock and legal-review readiness gate
- `src/secretExposureResponse.mjs`: redacted incident response validator for pasted wallet/API credentials
- `src/credentialRotationActionPack.mjs`: owner-only credential rotation action pack builder
- `src/credentialRotationHandoff.mjs`: local handoff for owner credential rotation and redacted proof updates
- `src/externalActionApproval.mjs`: final approval gate for human-executed external actions
- `src/outreachActionPack.mjs`: draft external-action packet generator for merchant outreach
- `src/xPostExecutionEvidence.mjs`: post-publication evidence validator for approved X posts
- `src/outreachExecutionEvidence.mjs`: post-send merchant outreach evidence validator
- `src/outreachState.mjs`: evidence-to-prospect outreach state reconciler
- `src/disputeProcess.mjs`: receipt-bound dispute packet validator
- `src/policyVerifier.mjs`: typed-data verifier boundary for policy ownership
- `src/policyAudit.mjs`: production policy audit and controller recovery check
- `src/contractReview.mjs`: automated pre-deploy review for the no-custody registry
- `src/controllerSigningActionPack.mjs`: draft external-action packet builder for controller policy signatures
- `src/controllerSigningExecutionEvidence.mjs`: post-signing controller execution evidence validator
- `src/productionPolicyHandoff.mjs`: local handoff for controller signing approval, evidence, and runtime follow-up
- `src/deploymentReadiness.mjs`: deployment manifest validator for source hash, review, network, multisig, and token gates
- `src/launchHandoffBrief.mjs`: concise local launch handoff brief over readiness, sequence, action, and interview review surfaces
- `src/approvalRunbook.mjs`: local approval, manual execution, and post-execution evidence checklist for audited draft actions
- `src/executionEvidenceLedgerEntry.mjs`: validates filled X/outreach execution evidence and writes a local ledger append preview
- `src/stateUpdatePreview.mjs`: turns a ledger append preview into a local canonical state diff preview
- `src/canonicalUpdateSet.mjs`: combines ledger and state previews into a local canonical JSON update review packet
- `src/merchantIntake.mjs`: merchant intake validation, scoring, and policy patching
- `src/merchantDirectory.mjs`: validated merchant directory and intake conversion
- `src/merchantProfileSigner.mjs`: EIP-712 merchant profile signing and verification
- `src/merchantPromotion.mjs`: live merchant promotion gate binding signed profiles to approved evidence
- `src/pilotAuthorization.mjs`: merchant-approved pre-traffic pilot scope validator
- `src/pilotGatewayConfig.mjs`: authorized pilot gateway config builder for live preflight handoff
- `src/pilotTrafficActionPack.mjs`: draft external-action packet builder for human-run live pilot traffic
- `src/pilotTrafficExecutionEvidence.mjs`: post-execution evidence validator for one approved live pilot request
- `src/pilotEvidenceHandoff.mjs`: local handoff for collecting valid merchant-approved pilot receipt evidence
- `src/pilotIntegrationState.mjs`: evidence-to-prospect and live-directory state reconciler
- `src/pilotPacket.mjs`: review-only merchant pilot packet builder
- `src/livePilotPreflight.mjs`: fail-closed live pilot preflight validator
- `src/interviewPacket.mjs`: review-only merchant interview packet builder
- `src/interviewEvidence.mjs`: completed-interview evidence validator
- `src/interviewWorkspace.mjs`: local review-only interview prep workspace builder
- `src/interviewWorkspaceAudit.mjs`: read-only audit for interview prep workspaces
- `src/interviewReviewBrief.mjs`: local handoff brief for audited interview prep files
- `src/interviewCompletionHandoff.mjs`: local handoff from audited prep to valid completed-interview evidence
- `examples/paid-api.mjs`: copyable paid API example
- `examples/wallet-hook.mjs`: AgentKit-style wallet guard example
- `examples/viem-wallet-client.mjs`: wallet-client adapter compatibility example
- `contracts/AllowanceRegistry.sol`: no-custody receipt registry prototype
- `ops/`: launch metrics and priority backlog
- `ops/merchant_directory.json`: candidate and pilot-ready merchant listing metadata
- `ops/gateway.x402.example.json`: x402 facilitator gateway config template
- `ops/deployment_manifest.template.json`: intentionally failing deployment manifest template
- `ops/evidence_bundle_template.json`: intentionally failing evidence bundle template
- `ops/token_governance.json`: no-token lock manifest
- `ops/pilot_binding.template.json`: intentionally failing production pilot wallet binding template
- `ops/pilot_authorization_template.json`: intentionally failing pre-traffic pilot authorization template
- `ops/pilot_traffic_execution_records.json`: empty ledger for validated live pilot execution records
- `ops/pilot_gateway_payment_requirements_template.json`: intentionally failing x402 payment requirements template for authorized pilot gateway config
- `ops/pilot_traffic_execution_template.json`: intentionally failing post-execution live pilot request evidence template
- `ops/pilot_disclosure_template.json`: intentionally failing public disclosure template for merchant-approved evidence
- `ops/merchant_promotion_template.json`: intentionally failing live merchant promotion template
- `ops/external_action_template.json`: intentionally failing final external-action approval template
- `ops/controller_signing_execution_template.json`: intentionally failing post-signing controller evidence template
- `ops/x_post_execution_records.json`: empty ledger for validated post-publication X records
- `ops/outreach_execution_template.json`: intentionally failing post-send outreach evidence template
- `ops/outreach_execution_records.json`: empty ledger for validated post-send outreach records
- `scripts/operator.mjs`: daily operating report and X post draft
- `scripts/x-post-execution-evidence.mjs`: post-publication X evidence CLI
- `scripts/x-post-state.mjs`: X post execution ledger reconciler
- `scripts/outreach-approval.mjs`: outbound outreach draft approval validator
- `scripts/outreach-action-pack.mjs`: draft merchant outreach external-action packet generator
- `scripts/outreach-execution-evidence.mjs`: post-send merchant outreach evidence CLI
- `scripts/outreach-state.mjs`: outreach evidence/state reconciliation CLI
- `scripts/ceremony-audit.mjs`: controller signing ceremony audit CLI
- `scripts/controller-signing-action-pack.mjs`: draft controller signing external-action packet generator
- `scripts/controller-signing-execution-evidence.mjs`: post-signing controller execution evidence CLI
- `scripts/production-policy-handoff.mjs`: local production policy signing handoff writer
- `scripts/validate-merchant.mjs`: merchant intake validator CLI
- `scripts/validate-dispute.mjs`: dispute packet validator CLI
- `scripts/gateway.mjs`: standalone policy gateway runner
- `scripts/gateway-smoke.mjs`: local gateway smoke CLI for builder onboarding
- `scripts/x402-smoke.mjs`: dry-run/live x402 facilitator smoke CLI
- `scripts/pilot-gateway-config.mjs`: merchant-authorized gateway config builder CLI
- `scripts/pilot-traffic-action-pack.mjs`: draft live pilot traffic approval packet CLI
- `scripts/pilot-traffic-execution-evidence.mjs`: post-execution live pilot evidence validator CLI
- `scripts/pilot-evidence-handoff.mjs`: local pilot evidence collection handoff writer
- `scripts/pilot-report.mjs`: gateway receipt summary and acceptance signals
- `scripts/evidence-bundle.mjs`: hash-checked evidence bundle validator CLI
- `scripts/registry-lifecycle-intent.mjs`: no-broadcast registry lifecycle update CLI
- `scripts/registry-policy-intent.mjs`: no-broadcast registry policy creation CLI
- `scripts/receipt-registry-intent.mjs`: no-broadcast registry receipt write-intent CLI
- `scripts/registry-transaction-evidence.mjs`: registry transaction evidence validator CLI
- `scripts/pilot-disclosure.mjs`: redacted pilot disclosure validator for public usage claims
- `scripts/metrics-report.mjs`: receipt-driven launch metrics rollup
- `scripts/interview-workspace.mjs`: local interview prep workspace writer
- `scripts/interview-workspace-audit.mjs`: read-only audit for local interview prep workspaces
- `scripts/interview-review-brief.mjs`: local handoff brief for audited interview prep workspaces
- `scripts/interview-completion-handoff.mjs`: local interview completion evidence handoff writer
- `scripts/token-governance.mjs`: no-token lock and legal-review readiness CLI
- `scripts/readiness.mjs`: launch readiness gates for product, security, growth, pilots, and token discipline
- `scripts/launch-handoff-brief.mjs`: markdown launch handoff writer for the current human-approved step
- `scripts/approval-runbook.mjs`: markdown approval runbook writer for audited draft external-action packets
- `scripts/execution-evidence-ledger-entry.mjs`: local append-preview writer for validated X/outreach execution evidence
- `scripts/state-update-preview.mjs`: local canonical state diff preview for validated X/outreach execution evidence
- `scripts/canonical-update-set.mjs`: local before/after hash and JSON review packet for canonical ledger/state edits
- `scripts/external-action-approval.mjs`: final human approval packet validator
- `scripts/external-action-queue.mjs`: external action queue summarizer
- `scripts/external-action-workspace.mjs`: local draft approval workspace writer
- `scripts/external-action-workspace-audit.mjs`: hash and safety audit for local review workspaces
- `scripts/external-action-review-brief.mjs`: local reviewer brief for audited external action workspaces
- `scripts/secret-exposure-response.mjs`: redacted credential exposure incident validator CLI
- `scripts/credential-rotation-action-pack.mjs`: owner-only credential rotation action pack CLI
- `scripts/credential-rotation-handoff.mjs`: local credential rotation handoff writer
- `scripts/contract-review.mjs`: automated source review for `AllowanceRegistry`
- `scripts/validate-deployment.mjs`: deployment manifest validator CLI
- `scripts/sign-agent-intent.mjs`: agent payment intent EIP-712 signing CLI
- `scripts/verify-agent-intent.mjs`: signed agent intent verification CLI
- `scripts/validate-pilot-binding.mjs`: pilot agent wallet binding validator CLI
- `scripts/sign-merchant-profile.mjs`: merchant profile EIP-712 signing CLI
- `scripts/verify-merchant-profile.mjs`: signed merchant profile verification CLI
- `scripts/merchant-promotion.mjs`: live merchant promotion validator CLI
- `scripts/pilot-authorization.mjs`: merchant-approved pilot scope validator CLI
- `scripts/pilot-packet.mjs`: merchant pilot packet CLI
- `launch/`: screenshot and draft-only X launch pack
- `docs/`: strategy, integration, policy identity, EIP-712 verifier path, contact discovery, merchant outreach, launch pipeline, token path, token governance, legal posture, controller signing action pack, controller signing execution evidence, production policy handoff, credential rotation handoff, interview completion handoff, deployment readiness, external action approval, X post execution evidence, X post state, outreach execution evidence, outreach state, state update previews, canonical update sets, evidence bundles, pilot authorization, pilot gateway config, pilot traffic action pack, pilot traffic execution evidence, pilot agent binding, distribution claims, dispute process, rate limits, merchant promotion, pilot evidence provenance, pilot disclosure, settlement proofs, registry lifecycle intents, registry policy intents, receipt registry intents, registry transaction evidence, x402 facilitator setup, and X operating system

## Product Thesis

Autonomous agents need allowances, not blank checks.

The protocol answers:

Can this agent spend this amount with this merchant for this resource right now?

## Status

Prototype. Not audited. Not production financial infrastructure.

The EIP-712 verifier path uses `viem` for async typed-data signer recovery. Demo signatures are rejected when `production: true`.

Production-style runtime:

```bash
ALLOW_PRODUCTION=1 ALLOW_REQUIRE_AGENT_SIGNATURE=1 ALLOW_POLICY_PATH=ops/signed-policy.local.json npm start
```

Local production smoke fixture:

```bash
ALLOW_PRODUCTION=1 ALLOW_REQUIRE_AGENT_SIGNATURE=1 ALLOW_USE_FIXTURE=1 npm start
```

Generate signed policy JSON:

```bash
ALLOW_CONTROLLER_PRIVATE_KEY=0x... npm run sign-policy
```

Verify signed policy JSON:

```bash
npm run verify-policy -- ops/signed-policy.local.json
```

Production mode rejects demo signatures.

## Local Preflight API

```bash
curl -s -X POST http://127.0.0.1:4173/api/x402/preflight \
  -H 'content-type: application/json' \
  -d '{"headers":{"x-allow-merchant":"mcp_search","x-allow-amount-usd":"0.02","x-allow-resource":"/v1/search","x-allow-nonce":"demo-preflight-001","x-allow-metadata":"public request"}}'
```

## Demo Paid Route

```bash
curl -s http://127.0.0.1:4173/api/demo/paid-search?q=x402 \
  -H 'x-allow-nonce: demo-search-001' \
  -H 'x-allow-metadata: public search request'
```
