# Threat Model

Allow Protocol exists because autonomous payments fail in boring, expensive ways. The project should keep its security posture explicit from day one.

## Assets

- Agent spending policy
- Controller identity
- Merchant trust profile
- Receipt history
- Metadata hashes
- Settlement records

## Adversaries

- Agent prompt injection that tries to spend outside policy
- Merchant that misquotes price or resource
- Client that forges merchant or amount headers
- Replay attacker that reuses an old receipt or intent
- Data broker that hides personal data inside metadata
- Speculator trying to turn product metrics into misleading token claims

## Current Controls

- Server-side paid route pricing in `createPaidRoute`
- Merchant allowlists
- Per-transaction caps
- Daily caps
- Blocked route categories
- Metadata filtering for common sensitive patterns
- Required intent nonces and per-policy replay checks
- Denied receipts for blocked attempts
- No custody of user funds
- No token launch before usage gates
- Automated pre-deploy source review for `AllowanceRegistry`
- Deployment check evidence validator binds test, automated review, compiler artifact, and static-analysis report to the exact source hash
- Independent contract review evidence validator for reviewer independence, exact source hash, scope coverage, findings, and redacted proof
- Deployment manifest validator binds source hash, network, review evidence, multisig addresses, and disabled-token posture
- EIP-712 merchant profile signing for live directory listings
- Fixed-window rate limits before policy evaluation and upstream delivery
- Optional EIP-712 agent intent signatures before payment evaluation
- Production runtime guard requires signed agent intents and blocks runtime private-key exposure
- Pilot agent binding validator ties real agent wallets to merchant approval, signed policy, deterministic wallet-control signature, and runtime config before public pilots
- Fail-closed settlement proof boundary before paid delivery
- x402 facilitator adapter for `PAYMENT-SIGNATURE` verification and optional `/settle`
- Live x402 smoke readiness blocks local, unapproved, verify-only, or synthetic-payment configs
- Receipt evidence provenance separates local demos from merchant-approved testnet and mainnet pilot evidence
- Receipt-bound dispute packet validator blocks raw sensitive metadata and runtime secrets

## Known Gaps

- Production smoke tests can use a deterministic fixture when `ALLOW_USE_FIXTURE=1`; public deployments still need a real controller-signed policy
- x402 facilitator adapter and live-readiness gate exist, but still need an external live merchant-approved smoke with real payment requirements and facilitator credentials
- Independent contract review evidence tooling exists, but no real independent review has been completed yet
- No independent smart contract audit has been completed yet
- Compiler and static-analysis evidence tooling exists, but no real compiler artifact or static-analysis report has been attached yet
- Deployment manifest template is intentionally incomplete until real external evidence is collected

## Required Before Production

- Sign policy ids with the controller wallet
- Verify recovered controller address from an EIP-712 policy signature
- Disable demo signatures in production deployments
- Require `ALLOW_POLICY_PATH` or `ALLOW_POLICY_JSON` before public deployment
- Bind each policy to a chain, agent address, settlement asset, and nonce domain
- Verify x402 payment proofs before delivering paid resources
- Configure the real settlement facilitator URL/token, set merchant approval metadata, and run a live smoke before public paid delivery
- Store only hashes for metadata and resource claims
- Require merchant profile signatures before marking directory listings live
- Bind EIP-712 agent intent signatures to the approved pilot agent wallet
- Validate the pilot agent binding packet before accepting production signed intents
- Configure production rate limits by controller, agent, and route
- Put treasury and deployer privileges behind a multisig
- Validate deployment check evidence for compiler/static-analysis outputs
- Validate independent contract review evidence for the exact source hash
- Require `npm run validate-deployment -- <manifest>` to pass before contract deployment

## Public Disclosure Standard

Every metric should distinguish simulated receipts, testnet receipts, and mainnet receipts. Do not merge these in public reporting.
