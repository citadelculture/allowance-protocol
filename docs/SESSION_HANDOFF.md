# Session Handoff

Context for continuing Allow Protocol in a fresh Claude Code session. A new
session has no memory of prior chats — this file is the orientation.

## Mission
Build Allow Protocol — a no-custody allowance / spend-guardrail layer for
autonomous AI agents that hold wallets. Enforce per-tx + daily caps, a merchant
allowlist, and PII guards *before* any payment (x402) is signed. Then take it
live (deploy to Base, distribute on X).

## What is already built and shipped (branch: claude/allow-protocol-build-9w62z6)
- `npm run demo` — policy engine vs. 5 agent payment attempts (human-readable).
- `createAllowFetch` (`allow-protocol/allow-fetch`) — client-side `fetch`
  wrapper that runs the allowance policy on any HTTP 402 before paying.
- `createX402Payer` (`allow-protocol/x402-payer`) — signs the x402 exact-scheme
  USDC EIP-3009 authorization off-chain. Verified offline.
- `src/xClient.mjs` + `npm run x-post` — post to X via OAuth 1.0a (signing
  verified against X's documented example + openssl).
- `npm run compile-registry` / `npm run deploy-registry` — offline solc compile
  + viem deploy of `AllowanceRegistry` to Base / Base Sepolia.
- `npm test` — full suite green.

## Prerequisites for live actions (see docs/GO_LIVE.md)
This must run in an environment with **Custom/Full network access** allowlisting:
api.x.com, api.twitter.com, go.getblock.io, mainnet.base.org, sepolia.base.org,
api.basescan.org, api-sepolia.basescan.org — and these env vars set:
`X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET, ALLOW_DEPLOY_PK,
ALLOW_RPC_URL`. Secrets live only in env vars, never in the repo.

## First actions in a network-enabled session
1. Verify: `curl -s -o /dev/null -w "%{http_code}\n" https://api.x.com` (want
   NOT 403) and `node -e "console.log(!!process.env.X_API_KEY, !!process.env.ALLOW_RPC_URL)"`.
2. Deploy testnet: `ALLOW_CHAIN=base-sepolia npm run deploy-registry`.
3. Post launch: `npm run x-post "<text>"` (preview first with `--dry-run`).

## Live attempt status (2026-06-09, network-enabled session)

Owner authorized automated execution of the Sepolia deploy and the launch X
post (see `docs/EXTERNAL_ACTION_APPROVAL.md` amendment). Both commands run
correctly end-to-end but are blocked on account resources only the owner can
provide:

- **Deploy**: DONE on Base mainnet (owner redirected from Sepolia after the
  testnet deployer was unfunded). `AllowanceRegistry` is live at
  `0x047b375f044b76efbdce655ab6b7ee142129c266` (tx
  `0xaa7f127ba8a15b4bbe64ba3f1ddad9c5973286506dbaec29c4d3019c1f83f636`,
  block 47121983) — see `deployments/base.json`. Remaining: verify source on
  Basescan (UI single-file verifier with `contracts/AllowanceRegistry.sol`,
  solc 0.8.35) and complete the deployment-check evidence chain (manifest,
  static analysis, independent review) — `npm run contract-review` passes
  but is not an audit.
- **X post**: OAuth 1.0a signing is accepted, but the API returns HTTP 402
  `CreditsDepleted` for enrolled account `2064326404553027584`. Add X API
  credits (or a plan with post quota) in the developer portal, then rerun
  `npm run x-post -- "<text>"` (dry-run preview verified, 66/280 chars).

After either succeeds, record it in the execution evidence ledgers
(`x-post-execution-evidence` / `deployment-check-evidence`).

## Continuous improvement loop (2026-06-09, same session)

Owner directed an indefinite autonomous improvement loop ("don't disturb").
Standing limits: only the two owner-authorized external actions (launch X
post — retried every cycle, still blocked on API credits — and the completed
mainnet deploy), no further mainnet transactions, no npm publish, no
outreach, secrets in env vars only. Completed cycles, all tested and pushed:

1. `allow-protocol/deployments` — live registry as an SDK export.
2. `allow-protocol/registry-reader` — read-only onchain policy/spend/replay
   queries with epoch-rollover-aware remaining-allowance math.
3. `npm run verification-input` — Basescan standard-JSON packet; recompiled
   runtime bytecode matches eth_getCode byte-for-byte (see work/verification/).
4. Live-path bug fixes: paid retries dropped Headers-instance headers;
   malformed x402 amounts crashed instead of denying; USDC EIP-712 domain
   name fallback was wrong on Base Sepolia ("USDC", verified onchain).
5. `allow-protocol/registry-events` — decoded PolicyCreated/PolicyActiveSet/
   ReceiptRecorded logs, deploy-block-bounded, verified against the live contract.
6. `npm run registry-status` — live health CLI with wrong-chain RPC guard and
   windowed eth_getLogs for capped providers (ALLOW_RPC_URL is the Sepolia
   deployer endpoint; GetBlock caps ranges at 1500 blocks).
7. Example sanity pass after the allowFetch changes (`npm run demo`,
   `npm run example:allow-fetch`) — all green.

## Honest status / next leverage
The hard problem is distribution, not tooling. A zero-follower launch tweet
won't move the needle alone; engaging in existing x402 / agent-payment threads
and getting real builders to wrap `createAllowFetch` matters more. Consider
publishing the SDK to npm (needs an npm token; flip `private: false`).
