# Policy Identity

Allow policies need stable identity before they can secure real agent payments.

## Current v0 Envelope

Each policy carries:

- `policyId`: stable policy identifier
- `controller`: owner or operator of the policy
- `controllerSignature`: demo signature or production EIP-712 signature
- `signatureMode`: `demo` or `eip712`
- `agentId`: agent bound to the policy
- `agentAddress`: optional wallet address required for production agent intent signatures
- `chain`: intended settlement chain
- `settlementAsset`: intended settlement asset
- `requireIntentNonce`: replay-protection switch
- `requireAgentIntentSignature`: switch for EIP-712 signed payment intents

The JavaScript prototype validates that the signed-policy envelope exists, fingerprints the policy, and binds every receipt to:

- policy id
- policy fingerprint
- merchant id
- amount
- resource
- metadata hash
- intent nonce
- intent hash

## Replay Rule

For a given `policyId`, an `intentNonce` can be used once.

If the same policy receives the same nonce again, Allow returns `deny` before delivery or settlement.

## Production Signature Path

The local demo `controllerSignature` is not a wallet signature verifier. It is an interface commitment and test mode.

Allow now exposes typed-data generation and an injected EIP-712 recovery boundary. Production should use a battle-tested wallet library to verify a policy signature over:

- policy id
- controller
- agent address or agent identity
- chain id
- settlement token
- merchant allowlist root
- spend limits
- expiry
- controller nonce

The verifier recovers the controller address and rejects policies whose recovered signer does not match the policy controller. Demo mode should stay disabled in production.

## Agent Intent Signature Path

Production pilots can require every payment intent to be signed by the policy-bound agent address.

Before a public pilot, `npm run validate-pilot-binding -- <binding> <policy>` must confirm that the policy-bound agent address matches the approved wallet in the pilot binding packet.

The agent intent EIP-712 payload covers:

- policy id
- agent id
- merchant id
- amount
- resource hash
- metadata hash
- intent nonce
- policy fingerprint

The verifier recovers the agent signer and rejects the intent if it does not match `agentAddress` or the configured runtime `ALLOW_AGENT_ADDRESS`.

## Onchain Registry

`AllowanceRegistry.sol` now creates deterministic policy ids from a controller nonce and rejects receipt replay with:

- `intentNonce == bytes32(0)` rejected
- `usedIntentNonce[policyId][intentNonce]` rejected

The registry remains a prototype and does not custody funds.
