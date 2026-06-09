# External Action Approval

Allow can prepare external actions, but it must not execute them automatically.

## Owner Authorization Amendment (2026-06-09)

The repository and X account owner has explicitly switched two action types
from `human_only` to **owner-authorized automated execution**. The
authorization was given directly in a live Claude Code session conversation
(2026-06-09, session 019fXQmJWbBsnAhKzSpfihaf), not via a handoff document:

- `contract_deployment`: deployment of `AllowanceRegistry` to Base Sepolia
  using the `ALLOW_DEPLOY_PK` env credential (`npm run deploy-registry`).
  Extended same-session (owner follow-up, 2026-06-09) to Base mainnet after
  the Sepolia attempt was blocked by an unfunded testnet deployer.
- `x_post`: posting to the owner's X account using the OAuth 1.0a env
  credentials (`npm run x-post`, with `--dry-run` preview first).
  Suspended same-session by owner direction ("forget x posts for now").
- `registry_policy_create` and `registry_receipt_write` (added same-session,
  owner follow-up): gas-only transactions from the `ALLOW_DEPLOY_PK` wallet
  against the live `AllowanceRegistry`, to take the protocol from an empty
  deployment to live verified usage ("I want this protocol to work live,
  not just as a demo"). No value transfer, no custody, dry-run intent
  packets validated before sending.

Scope notes: the authorization covers exactly these two action types with
credentials supplied through env vars only. All other action types in this
document (outreach, wallet policy signing, registry writes, pilot traffic,
merchant promotion) remain `human_only`. Executed automated actions must
still be recorded in the execution evidence ledgers after the fact.

The approval validator supports this via
`action.executionMode: "owner_authorized_automated"`, accepted only for
`x_post` and `contract_deployment` packets that carry an
`ownerAuthorization` block (`amendmentRef`, `authorizedBy`, `authorizedAt`,
`statement`) and the `ownerAuthorizedAutomation` + `automationScopeReviewed`
flags in place of `humanWillExecute`/`automationDisabled`. All remaining
safety flags are unchanged, and `human_only` packets are unaffected.

Use this gate before:

- posting from X
- sending merchant outreach
- signing policy typed data with a wallet
- deploying a contract
- changing registry policy lifecycle state
- creating an onchain registry policy
- recording an approved receipt in the onchain registry
- starting merchant-approved pilot traffic
- promoting a merchant listing to `live`

## Command

```bash
npm run external-action-approval -- ops/external_action_template.json
```

The template exits nonzero until the account, wallet, or deployment owner approves the exact action.

To see every pending packet and blocked future action in one place, run:

```bash
npm run external-action-queue
```

The queue does not approve or execute anything. It only points to the packet that needs final review, or the evidence gate that must pass first.

Before final packet approval, keep the action-time decision and packet preview chain intact:

```bash
npm run approval-decision -- <approved-decision.json> --require-approved
npm run approval-packet-preview -- <approved-decision.json> <approved-packet.preview.json>
npm run external-action-approval -- <approved-packet.preview.json>
```

The preview command derives a separate approved packet copy from the hash-bound approved decision. It does not mutate the original draft packet or perform the action.

To write ready draft packets to local review files, run:

```bash
npm run external-action-workspace
```

The workspace writes `manifest.json`, `REVIEW_CHECKLIST.md`, and draft packet JSON files. Those files still need final approval before any external action.

For launch X posts, generate draft packets from the current launch pack with:

```bash
npm run x-post-action-pack
```

Those packets are still unapproved. They should fail this final approval command until the X account owner fills approval attribution and safety flags.

After a human posts an approved X packet, validate execution evidence with:

```bash
npm run x-post-execution-evidence -- ops/x_post_execution_template.json
```

That record proves the public post matched the approved packet. It does not post or approve anything.

After that record passes, append it to the X post execution ledger and reconcile launch state:

```bash
npm run x-post-state -- ops/x_post_execution_records.json
```

Do not mark a launch post as `posted` until this reconciler passes.

For merchant outreach, generate draft packets from the current candidate pipeline with:

```bash
npm run outreach-action-pack
```

Those packets are still unapproved. They should fail this final approval command until the account owner fills approval attribution and safety flags.

After an approved merchant outreach packet is sent manually, validate the post-send record with:

```bash
npm run outreach-execution-evidence -- ops/outreach_execution_template.json
```

That evidence proves execution and response state only. It does not schedule, complete, or count an interview.

For controller policy signatures, generate a draft packet from the policy template and intended controller:

```bash
npm run controller-signing-action-pack -- allow-policy.example.json <controller-address>
```

The packet remains unapproved until the wallet owner fills approval attribution and safety flags, then passes this final approval command before signing typed data.

After the wallet owner signs and stores the signed policy, validate the post-signing evidence:

```bash
npm run controller-signing-execution-evidence -- ops/controller_signing_execution_template.json
```

That evidence binds the approved packet to the signed policy, storage handoff, ceremony runtime env, and redacted proof. It does not sign or store anything.

For merchant-approved pilot traffic, generate draft packets after live preflight with:

```bash
npm run pilot-traffic-action-pack -- ops/pilot_binding.template.json ops/signed-policy.local.json <authorized-gateway-config.json> ops/dispute_template.json
```

Those packets remain unapproved until the human owner fills approval attribution and safety flags, then passes this final approval command for each exact request.

After execution, validate the receipt-bound record with:

```bash
npm run pilot-traffic-execution-evidence -- ops/pilot_traffic_execution_template.json <receipt-log-path>
```

## Approval Rule

Every approved packet must include:

- `status: "approved"`
- `approvedBy` and `approvedAt`
- `action.executionMode: "human_only"`
- the exact text, command, wallet address, or destination the human will use
- all safety approval flags set to `true`
- no private keys, seed phrases, bearer tokens, API keys, or passwords in action text

Required safety flags:

- `humanWillExecute`
- `automationDisabled`
- `exactActionReviewed`
- `externalSideEffectAcknowledged`
- `noPrivateKeys`
- `noCustodyOrEscrow`
- `noTokenPitch`
- `noMarketManipulation`
- `legalEthicsReviewed`

## Action Types

- `x_post`: validates the post with the launch-claims guard and exact text match
- `merchant_outreach`: validates the outreach draft and exact message match
- `controller_policy_signature`: validates the no-secret policy signing packet, typed-data signing command, and controller wallet address
- `contract_deployment`: validates the deployment manifest, including compiler/static-analysis refs, independent review `evidenceRef`, and source hash binding
- `registry_lifecycle_update`: validates the dry-run registry lifecycle intent, contract destination, and controller wallet address
- `registry_policy_create`: validates the dry-run registry policy intent, contract destination, and controller wallet address
- `registry_receipt_write`: validates the dry-run receipt registry intent, contract destination, and recorder wallet address
- `live_pilot`: validates live pilot preflight plus the exact gateway command, route, merchant, receipt path, and expected allowed or denied outcome
- `merchant_promotion`: validates live merchant promotion evidence

For registry action types, keep calldata and `bytes32` values inside structured `payload` fields; do not paste them into `action.command` or notes.

## Boundary

This command does not post, send outreach, sign wallet payloads, deploy contracts, start pilot traffic, move funds, or store secrets. It creates an auditable approval artifact for the human step.
