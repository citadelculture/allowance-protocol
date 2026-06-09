# Integration Guide

Allow v0 exposes a preflight check for paid APIs and agent clients.

It is x402-style rather than a full x402 settlement implementation: Allow evaluates whether the agent is permitted to spend before the payment is signed or accepted.

## Local Endpoint

```bash
curl -s -X POST http://127.0.0.1:4174/api/x402/preflight \
  -H 'content-type: application/json' \
  -d '{"headers":{"x-allow-merchant":"mcp_search","x-allow-amount-usd":"0.02","x-allow-resource":"/v1/search","x-allow-nonce":"demo-preflight-001","x-allow-metadata":"public request"}}'
```

Allowed response:

```json
{
  "protocol": "allow",
  "message": "Payment intent accepted by allowance policy"
}
```

Blocked response uses HTTP `402` and includes the receipt id, decision reason, and risk score.

## Middleware

API builders can guard a paid route with `createPaidRoute`.

```js
import { createPaidRoute } from "allow-protocol";

const paidSearchRoute = createPaidRoute({
  policy,
  merchantId: "mcp_search",
  amountUsd: 0.018,
  rateLimit: {
    max: 60,
    windowMs: 60000
  },
  settlement: {
    required: true,
    chain: "Base",
    asset: "USDC",
    proofType: "x402-facilitator"
  },
  settlementVerifier: async ({ proof, expected }) => verifyWithFacilitator(proof, expected),
  resourceFromRequest: (req) => new URL(req.url, "http://localhost").pathname,
  metadataFromRequest: (req) => req.headers["x-allow-metadata"] || "",
  handler: (req, res) => {
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: true, receipt: req.allow.receipt }));
  }
});
```

With an injected EIP-712 verifier:

```js
const paidSearchRoute = createPaidRoute({
  policy,
  policyVerifier: {
    mode: "eip712",
    recoverController: ({ typedData, signature }) => recoverAddressWithAuditedLibrary({ typedData, signature })
  },
  merchantId: "mcp_search",
  amountUsd: 0.018,
  handler
});
```

The middleware attaches `req.allow` after every decision:

```json
{
  "decision": "allow",
  "riskScore": 8,
  "receipt": {
    "id": "allow_9c18f27c",
    "policyId": "allow_policy_demo_alpha",
    "intentNonce": "demo-preflight-001"
  }
}
```

## Demo Paid API

Start the local server:

```bash
PORT=4174 npm start
```

Allowed request:

```bash
curl -s http://127.0.0.1:4174/api/demo/paid-search?q=x402 \
  -H 'x-allow-nonce: demo-search-001' \
  -H 'x-allow-metadata: public search request'
```

Blocked request:

```bash
curl -i -s http://127.0.0.1:4174/api/demo/paid-search?q=leads \
  -H 'x-allow-nonce: demo-search-002' \
  -H 'x-allow-metadata: email alex@example.com'
```

The route prices itself server-side as `mcp_search` at `$0.018`; the caller does not get to choose the merchant or amount headers for this route.

## Standalone Example

```bash
npm run example:paid-api
```

Then:

```bash
curl -i -s 'http://127.0.0.1:4180/paid-search?q=x402' \
  -H 'x-allow-nonce: example-search-001' \
  -H 'x-allow-metadata: public search request'
```

## Allow Gateway

The gateway protects an existing upstream API without changing that API. It prices routes from server-side config, evaluates Allow, forwards only allowed requests, and returns `402` with a receipt for blocked requests.

Start the example upstream:

```bash
npm run example:plain-api
```

In another terminal, start the gateway:

```bash
npm run gateway -- ops/gateway.example.json
```

Before starting servers, run the local smoke harness:

```bash
npm run gateway-smoke -- ops/gateway.example.json
```

The smoke runs the gateway handler in process, proves `/health`, one allowed upstream delivery, and one denied metadata guard response. It marks receipts as local-only evidence and does not unlock pilot readiness.

Health check:

```bash
curl -s http://127.0.0.1:4190/health
```

Allowed request through the gateway:

```bash
curl -i -s 'http://127.0.0.1:4190/paid-search?q=x402' \
  -H 'x-allow-nonce: gateway-search-001' \
  -H 'x-allow-metadata: public search request'
```

Blocked request:

```bash
curl -i -s 'http://127.0.0.1:4190/paid-search?q=leads' \
  -H 'x-allow-nonce: gateway-search-002' \
  -H 'x-allow-metadata: email alex@example.com'
```

Gateway config:

```json
{
  "upstream": { "baseUrl": "http://127.0.0.1:4181" },
  "receipts": { "path": "ops/gateway-receipts.local.jsonl" },
  "evidence": {
    "environment": "local",
    "merchantApproved": false,
    "rail": "x402",
    "network": "eip155:84532",
    "label": "local-x402-dry-run"
  },
  "rateLimit": { "max": 60, "windowMs": 60000 },
  "merchants": [
    {
      "id": "research_api",
      "name": "Research API",
      "domain": "research.example",
      "category": "research",
      "trustScore": 91,
      "defaultPriceUsd": 0.25,
      "riskTags": ["query_text", "looped_agent_calls"]
    }
  ],
  "settlement": {
    "required": true,
    "chain": "Base",
    "asset": "USDC",
    "proofType": "x402-facilitator",
    "paymentRequirements": {
      "scheme": "exact",
      "network": "eip155:84532",
      "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      "amount": "1000",
      "payTo": "0x122F8Fcaf2152420445Aa424E1D8C0306935B5c9",
      "maxTimeoutSeconds": 60,
      "extra": { "name": "USDC", "version": "2" }
    }
  },
  "routes": [
    {
      "pathPrefix": "/paid-search",
      "merchantId": "mcp_search",
      "amountUsd": 0.018
    }
  ]
}
```

Use `merchants` for approved pilot merchant profiles that are not in the built-in catalog. The gateway only reads this from server-side config; requests still inherit merchant id and amount from the matched route.

Over-limit requests return `429` with `x-allow-rate-limit`, `x-allow-rate-limit-remaining`, `x-allow-rate-limit-reset`, and `retry-after` headers. Rate-limited requests do not create payment receipts because no policy decision was made.

When settlement is required, missing or invalid proof returns `402` before the handler or upstream API runs. For x402 routes, the gateway runner injects the facilitator adapter when `proofType` is `x402-facilitator` and `ALLOW_X402_FACILITATOR_URL` is configured.

```bash
ALLOW_X402_FACILITATOR_URL="https://api.cdp.coinbase.com/platform/v2/x402" \
ALLOW_X402_FACILITATOR_TOKEN="..." \
ALLOW_X402_SETTLE=1 \
npm run gateway -- ops/gateway.example.json
```

`ALLOW_X402_SETTLE=1` calls `/settle` after `/verify` and before upstream delivery. Without it, the adapter verifies the payment signature but does not submit settlement.

Use `ALLOW_PRODUCTION=1 ALLOW_REQUIRE_AGENT_SIGNATURE=1 ALLOW_POLICY_PATH=... npm run gateway -- ops/gateway.example.json` for production-mode signed policies.

Validate pilot evidence:

```bash
npm run pilot-report -- ops/gateway-receipts.local.jsonl
```

The report exits nonzero until one merchant has credible merchant-approved testnet or mainnet evidence with one allowed 2xx delivery, one denied guarded request, and at least one active agent id.

Readiness only counts merchant-approved `testnet` or `mainnet` receipt records as pilot evidence. Local receipt logs are useful for development but are not launch proof.

If Allow accepts an intent but the upstream API is unavailable, the gateway returns `502` with the Allow receipt headers intact and records the upstream failure in the receipt log. This preserves evidence that the spend policy allowed the request while separating merchant availability from policy decisions.

After a merchant intake, generate a tailored gateway pilot kit:

```bash
npm run pilot-kit -- ops/merchant_intake.example.json
npm run pilot-packet -- ops/merchant_intake.example.json
```

The packet is the review handoff: readiness, gateway config, local smoke result, commands, evidence boundary, and human approval checklist.

## MCP Tool Guard

MCP servers can guard `tools/call` JSON-RPC requests with `createMcpToolGuard`.

```js
import { createMcpToolGuard } from "allow-protocol";

const guard = createMcpToolGuard({
  policy,
  receipts,
  toolPolicies: {
    search: {
      merchantId: "mcp_search",
      amountUsd: 0.018,
      resourceFromRequest: (message) => `mcp://tool/search?q=${message.params.arguments.query}`,
      metadataFromRequest: (message) => message.params.arguments.query
    }
  }
});

const response = await guard(jsonRpcMessage, async (message, context) => {
  return {
    jsonrpc: "2.0",
    id: message.id,
    result: {
      content: [{ type: "text", text: "Protected result" }],
      receipt: context.allow.receipt
    }
  };
});
```

The client should pass a unique nonce in `params._meta.allow.intentNonce`. Denied calls return a JSON-RPC error with code `-32042` and an Allow receipt in `error.data.evaluation`.

Run the local example:

```bash
npm run example:mcp-guard -- "agent payments"
```

## Wallet Policy Hook

Wallet-bearing agents can call Allow before a wallet action is signed. The hook is no-custody: it never receives private keys, never signs transactions, and only decides whether the proposed spend is allowed by policy.

```js
import { createAgentKitPolicyHook } from "allow-protocol/wallet";

const hook = createAgentKitPolicyHook({
  policy,
  receipts,
  route: {
    merchantId: "mcp_search",
    amountUsd: 0.018,
    resourceFromRequest: (request) => `wallet://${request.chain}/${request.operation}/${request.to}`,
    metadataFromRequest: (request) => request.memo || ""
  }
});

const response = await hook.beforeAction(walletRequest, async (request, context) => {
  return walletClient.sendTransaction({
    to: request.to,
    value: request.value,
    allowReceipt: context.allow.receipt.id
  });
});
```

Denied wallet actions return a structured `402` response and do not call the executor. For direct agent-wallet objects, use mapping callbacks such as `merchantIdFromRequest`, `amountUsdFromRequest`, and `intentNonceFromRequest`.

Run the local example:

```bash
npm run example:wallet-hook -- "public search request"
```

Wallet clients with a `sendTransaction` method can be wrapped with `createWalletClientPolicyAdapter`:

```js
import { createWalletClientPolicyAdapter } from "allow-protocol/wallet";

const wallet = createWalletClientPolicyAdapter({
  walletClient,
  policy,
  route: {
    merchantId: "mcp_search",
    amountUsd: 0.018,
    metadataFromRequest: (request) => request.metadata
  }
});

const response = await wallet.sendTransaction(
  { to, value },
  {
    intentNonce: crypto.randomUUID(),
    metadata: "public Base wallet request"
  }
);
```

Run the local Base Sepolia `viem` compatibility example:

```bash
npm run example:viem-wallet -- "public Base wallet request"
```

Blocked metadata example:

```bash
npm run example:wallet-hook -- "email alex@example.com"
```

## Headers

- `x-allow-merchant`: merchant id
- `x-allow-amount-usd`: quoted price
- `x-allow-resource`: paid resource path
- `x-allow-nonce`: unique nonce for this payment intent
- `x-allow-metadata`: optional context to filter before payment
- `x-allow-agent`: agent signer address when intent signatures are required
- `x-allow-agent-signature`: EIP-712 signature over the payment intent
- `x-allow-agent-signature-mode`: `eip712`
- `PAYMENT-SIGNATURE`: x402 payment payload for facilitator verification
- `x-allow-settlement-proof`: generic settlement proof token or facilitator payload
- `x-allow-settlement-chain`: settlement chain
- `x-allow-settlement-asset`: settlement asset
- `x-allow-settlement-amount-usd`: settled amount
- `x-allow-settlement-tx`: optional transaction hash

## Agent Intent Signatures

Sign a payment intent:

```bash
ALLOW_AGENT_PRIVATE_KEY=0x... npm run sign-agent-intent -- agent-intent.example.json allow-policy.example.json
```

Verify a signed intent:

```bash
ALLOW_REQUIRE_AGENT_SIGNATURE=1 npm run verify-agent-intent -- signed-agent-intent.local.json allow-policy.example.json
```

Enable signature enforcement for the gateway:

```bash
ALLOW_PRODUCTION=1 \
ALLOW_POLICY_PATH=ops/signed-policy.local.json \
ALLOW_REQUIRE_AGENT_SIGNATURE=1 \
npm run gateway -- ops/gateway.example.json
```

If the policy has `agentAddress`, the recovered signer must match it. Otherwise set `ALLOW_AGENT_ADDRESS` for the runtime.

## API Builder Flow

1. Receive agent request.
2. Build an Allow payment intent from request price and resource.
3. Verify the agent intent signature when production config requires it.
4. Call Allow preflight.
5. Verify settlement proof when production config requires it.
6. If allowed and settled, continue to delivery.
7. If denied or unsettled, return `402` with reasons.

## Agent Flow

1. Agent asks controller for a spending policy.
2. Agent calls merchant endpoint.
3. Merchant or agent checks Allow before payment.
4. Agent signs only if Allow returns `allow`.
5. Receipt is recorded locally or onchain.

## Production Requirements

- Authenticate agent policy ownership.
- Hash or redact metadata before storage.
- Use the x402 facilitator adapter with merchant-approved payment requirements.
- Create registry policies, lifecycle updates, and receipt writes only after contract review, deployment readiness, and valid registry intent packets.
- Keep pilot receipt logs local or in an approved merchant evidence store; do not publish metadata without consent.
- Monitor `/health` and upstream `502` counts before inviting external testers.
- Price paid routes server-side. Do not trust agent-provided merchant or amount headers for production authorization.
- Price MCP tools server-side. Do not trust client-provided tool price or merchant fields.
- Price wallet actions server-side where possible, or use audited mapping callbacks for wallet request objects.
- Configure rate limits by controller, agent, and route before public pilots.
- Require agent intent signatures before public production pilots.
- Require facilitator verification, and settlement when configured, before paid production delivery.
- Use a battle-tested EIP-712 recovery library and disable demo signatures in production.
