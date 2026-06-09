# Registry Policy Intents

`AllowanceRegistry.createPolicy` creates the onchain policy id used by later receipt records. The transaction must be sent by the controller wallet; Allow tooling only prepares a dry-run packet.

Use `npm run registry-policy-intent -- ops/registry_policy_intent_template.json` before any registry policy creation. The command outputs calldata, merchant id hashes, the expected `policyId`, and a safety block. It does not deploy, sign, broadcast, escrow, custody, or transfer funds.

## Required Inputs

- controller wallet address, which becomes `msg.sender`
- agent wallet address
- settlement token address
- nonzero public `bytes32` controller nonce
- epoch cap, per-transaction cap, and epoch length
- at least one allowed merchant
- deployed registry address before external execution
- target `chainId`

The controller nonce is public, but it must not be the zero hash. Generate it during the signing/deployment ceremony and keep it in the approval evidence.

## Hashes

The expected policy id is computed exactly like the contract:

```text
keccak256(abi.encode(controller, agent, settlementToken, epochCap, perTxCap, epochSeconds, chainId, controllerNonce))
```

Offchain merchant ids are converted with:

```text
keccak256("allow-merchant:v1:" + merchantId)
```

Receipt registry intents must use the same merchant id namespace or `recordReceipt` will revert with `MerchantNotAllowed`.

Use `npm run registry-lifecycle-intent` later for policy deactivation or merchant allowlist changes.

## Execution Rule

A valid packet is still only `ready_for_external_approval`. Before a human sends the transaction:

- run `npm test`
- run `npm run readiness`
- validate the deployment manifest
- verify `npm run independent-contract-review -- <evidence>` passes for the deployed source
- approve an external action packet with `actionType: "registry_policy_create"`
- confirm the calldata and expected policy id against the wallet UI

Never paste private keys, seed phrases, raw transaction bytes, or signed transaction bytes into this repository.
