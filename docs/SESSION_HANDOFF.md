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

## Honest status / next leverage
The hard problem is distribution, not tooling. A zero-follower launch tweet
won't move the needle alone; engaging in existing x402 / agent-payment threads
and getting real builders to wrap `createAllowFetch` matters more. Consider
publishing the SDK to npm (needs an npm token; flip `private: false`).
