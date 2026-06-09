# Allow Protocol Launch Plan

## Phase 0: Operating Posture

Status: now.

- Brand: Allow Protocol
- Category: agent payments, x402 guardrails, autonomous spending control
- Tagline: The allowance layer for autonomous payments
- Default chain: Base
- Settlement asset: USDC
- Token: none at launch
- Goal metric: verified policy decisions per day

## Phase 1: Public Build

Ship the dashboard, policy engine, and contract prototype in public.

Daily output:

- One product screenshot or short clip
- One technical note about agent payment safety
- One call for API builders to test an Allow merchant profile

Public metrics:

- Policy decisions
- Approved receipts
- Denied receipts
- Blocked value
- Integrated merchants
- Active agents

Public claims must separate local, testnet, and mainnet receipts. Launch readiness only treats merchant-approved testnet or mainnet logs as pilot evidence.

Launch readiness:

```bash
npm run readiness
```

The readiness audit must not report `not_ready` before public posting. `needs_external_action` is acceptable when the only remaining gates are real wallet signing, approved posting, and merchant interviews.

## Phase 2: Builder Integrations

Create three integrations:

- x402 API middleware
- MCP server payment guard
- AgentKit wallet policy hook

Status:

- x402 API middleware: prototype shipped
- MCP server payment guard: prototype shipped
- AgentKit wallet policy hook: prototype shipped
- Base Sepolia wallet-client compatibility harness: prototype shipped
- EIP-712 agent payment intent signatures: prototype shipped
- Controller signing ceremony audit: prototype shipped, real controller signature pending
- Fail-closed settlement proof boundary: prototype shipped
- x402 facilitator verifier adapter: prototype shipped, live smoke pending
- x402 facilitator smoke harness: dry-run shipped, live smoke pending
- Pilot agent wallet binding validator: shipped, real wallet binding pending

The first real users should be builders who already run paid APIs or agents, not speculative token buyers.

## Phase 3: Onchain Receipts

Deploy `AllowanceRegistry` to Base Sepolia after tests and review.

Record hashes only:

- policy id
- merchant id
- amount
- intent hash
- metadata hash

Do not store sensitive metadata onchain.

Status:

- No-custody receipt registry prototype: shipped
- Automated pre-deploy contract review: prototype shipped
- Deployment manifest gate: shipped, intentionally failing until real evidence is attached
- Base Sepolia deployment: gated on real controller signing, passing independent contract review evidence, and passing deployment manifest

## Phase 4: Merchant Directory

Launch a registry of payment endpoints that publish:

- price schedule
- refund rules
- data handling class
- receipt support
- uptime
- dispute contact
- risk tags

The first marketplace is not for tokens. It is for agent-spend destinations.

Status:

- Directory validator and sample candidate registry: prototype shipped
- EIP-712 merchant profile signing for live listings: prototype shipped
- Public live listings: gated on merchant approval, receipt evidence, and public proof

## Phase 5: Token Design Gate

Only design a token after there is evidence of organic usage:

- 100 active agents
- 50 merchants
- 10,000 receipts
- At least 20 percent of receipts from third-party builders

Until then, the token remains a future mechanism, not the product.

Status:

- Token governance lock: shipped
- Current command: `npm run token-governance -- ops/token_governance.json`
- Launch permission: always false in the current validator
- Legal-review readiness: gated on usage evidence, outside counsel, multisig, independent review, external approval, and evidence bundle references
