# Go Live

Everything below is built and verified locally. The only missing ingredient is
real-world access (network + credentials + funds). When those are provided, each
step is one command.

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

## 1. Deploy the no-custody registry to Base

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
