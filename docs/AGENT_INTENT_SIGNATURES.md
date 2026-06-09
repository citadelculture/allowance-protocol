# Agent Intent Signatures

Allow can require the agent to sign each payment intent before policy evaluation.

This protects against forged client requests that reuse a valid policy but were not authorized by the wallet-bearing agent.

## Sign

```bash
ALLOW_AGENT_PRIVATE_KEY=0x... npm run sign-agent-intent -- agent-intent.example.json allow-policy.example.json
```

The output includes a signed intent and headers:

- `x-allow-agent`
- `x-allow-agent-signature`
- `x-allow-agent-signature-mode`

## Verify

```bash
ALLOW_REQUIRE_AGENT_SIGNATURE=1 npm run verify-agent-intent -- signed-agent-intent.local.json allow-policy.example.json
```

Production runtime requires signed intents:

```bash
ALLOW_PRODUCTION=1 \
ALLOW_POLICY_PATH=ops/signed-policy.local.json \
ALLOW_REQUIRE_AGENT_SIGNATURE=1 \
npm run gateway -- ops/gateway.example.json
```

If the policy contains `agentAddress`, the recovered EIP-712 signer must match it. If the policy does not bind an agent address, set `ALLOW_AGENT_ADDRESS` for the runtime.
Startup fails in production mode if signed agent intents are not enforced or if the runtime exposes `ALLOW_AGENT_PRIVATE_KEY`.

Before a public production pilot, validate the wallet binding packet:

```bash
npm run validate-pilot-binding -- ops/pilot_binding.template.json ops/signed-policy.local.json
```

The binding must connect the approved merchant, real agent wallet, signed policy fingerprint, deterministic wallet-control challenge, runtime `ALLOW_AGENT_ADDRESS`, and no-private-key runtime posture.

## EIP-712 Payload

The signed payload covers:

- policy id
- agent id
- merchant id
- amount in micro-dollars
- resource hash
- metadata hash
- intent nonce
- policy fingerprint

Raw request metadata is hashed before it enters the typed-data message.
