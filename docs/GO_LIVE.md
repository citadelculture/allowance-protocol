# Go Live

Everything below is built and verified locally. The only missing ingredient is
real-world access (network + credentials + funds). When those are provided, each
step is one command.

## Current owner checklist (2026-06-09)

0. **SECURITY FIRST — unresolved credential exposure.** The incident record
   (`ops/secret_exposure_incident.template.json`, reported 2026-06-09 12:50)
   says a Base wallet private key and an X bearer token were pasted into chat
   and remain unrotated. If the exposed key is the current deployer
   (`0xFB7F…7BdF`, ~0.0998 ETH on Base mainnet), move those funds to a fresh
   wallet before doing anything else, and use the fresh wallet — not the
   exposed one — as the controller for the first onchain policy. Owner steps:
   `work/credential-rotation-handoff.md`. The deployed registry itself is safe
   (no owner privileges), but a compromised controller key means hijackable
   policy control.

1. **X API credits** — posting returns HTTP 402 `CreditsDepleted` for enrolled
   account `2064326404553027584`. Add credits in the developer portal; the
   session loop retries the approved launch text automatically and records
   evidence once it posts.
2. **Basescan source verification** — one paste: follow
   `work/verification/INSTRUCTIONS.md` (recompiled bytecode already matches
   the chain byte-for-byte).
3. **First onchain policy — DONE** (owner-directed live execution,
   2026-06-09). Policy `0xf0215a33…16c6` and receipt `0x82b0f266…ab5d` are
   live; both matched their offline predictions. Enforcement verified by
   simulation (replay/over-cap/unknown-merchant all revert). See
   `ops/registry_live_usage.json`. Remaining: create real policies from a
   fresh (non-exposed) controller wallet for production agents.
4. **npm publish** (optional) — needs an npm token, `private: false`, and a
   final package name.
5. **Funded live settlement — DONE (2026-06-10).** Owner funded the wallet
   with 20 testnet USDC; the full flow settled for real against
   https://www.x402.org/protected: policy allowed, signer signed, the
   facilitator broadcast the USDC transfer
   (tx `0xefa429cb…74dc`, Base Sepolia block 42657315, balance moved
   exactly one cent), and the settlement receipt was captured
   automatically. Evidence: `ops/live_settlement_evidence.json`. Every
   protocol layer is now live-proven.

## 0. Prerequisite: an open network session

The default build environment is firewalled to GitHub + npm. To let the agent
act on the internet (deploy, post, hit live x402 servers), the Claude Code web
environment must use **Custom** (or **Full**) network access. Configure it via
the cloud icon → Add/Edit environment → **Network access → Custom → Allowed
domains** (check "Also include default list of common package managers").

Allowed domains (one per line):

```
api.x.com
api.twitter.com
upload.twitter.com
go.getblock.io
mainnet.base.org
sepolia.base.org
api.basescan.org
api-sepolia.basescan.org
```

Set secrets in the same dialog's **Environment variables** field (.env format,
no quotes). The scripts read these keys:

```
X_API_KEY=
X_API_SECRET=
X_ACCESS_TOKEN=
X_ACCESS_TOKEN_SECRET=
ALLOW_DEPLOY_PK=
ALLOW_RPC_URL=
```

Then start a new task on this branch with that environment selected. Network
policy changes only apply to new sessions.

Docs: https://code.claude.com/docs/en/claude-code-on-the-web (Network access)

## 1. Deploy the no-custody registry to Base — DONE (mainnet, 2026-06-09)

`AllowanceRegistry` is live at `0x047B375f044B76efBdCE655Ab6b7EE142129c266`
on Base mainnet (see `deployments/base.json` and the README "Live deployment"
section). The Sepolia deployer was unfunded, so the owner authorized mainnet
directly. Basescan source verification is still pending.

```bash
# testnet first
ALLOW_CHAIN=base-sepolia ALLOW_DEPLOY_PK=0x... ALLOW_RPC_URL=https://sepolia.base.org npm run deploy-registry
# then mainnet
ALLOW_CHAIN=base ALLOW_DEPLOY_PK=0x... ALLOW_RPC_URL=https://mainnet.base.org npm run deploy-registry
```

Writes `deployments/<chain>.json` with the address + tx hash. Verify on Basescan.
The contract custodies no funds — it records policy-bounded receipts only.

## 2. Publish the SDK so builders can install it

Builders integrate with one import:

```js
import { createAllowFetch } from "allow-protocol/allow-fetch";
```

To publish you need an npm token and to flip `private: false` (and pick the final
package name). Then `npm publish`.

## 3. Get real agents using `createAllowFetch`

The protocol's value is proven by real allow/deny receipts from real agents
paying real x402 endpoints. Target: 3–5 agent builders wrap `allowFetch` around
their wallet's fetch. Warm intros beat cold outreach.

## 4. Distribution on X (optional, needs write credentials)

The provided bearer token is app-only/read-only and **cannot post**. Posting
needs OAuth 1.0a (API key+secret + access token+secret) or an OAuth2
user-context token with `tweet.write`. Provide those to enable posting.

## What's already done locally

- `npm run demo` — policy engine against 5 agent payment attempts
- `npm run example:allow-fetch` — client-side x402 allowance wrapper, end to end
- `npm run compile-registry` — offline solc build of AllowanceRegistry
- `npm test` — full suite green
