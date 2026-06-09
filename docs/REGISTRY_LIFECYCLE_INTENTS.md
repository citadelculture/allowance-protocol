# Registry Lifecycle Intents

`AllowanceRegistry` policies need a safe operational path after creation. Controllers must be able to deactivate a policy or update the merchant allowlist without handing automation a wallet or private key.

Use `npm run registry-lifecycle-intent -- ops/registry_lifecycle_intent_template.json` before any policy lifecycle transaction. The command outputs calldata, deterministic intent hash, and a safety block. It does not sign, broadcast, custody, escrow, or transfer funds.

## Actions

Allowed lifecycle actions:

- `set_policy_active`: calls `setPolicyActive(policyId, active)`
- `set_merchant_allowed`: calls `setMerchantAllowed(policyId, merchantId, allowed)`

No other registry lifecycle actions are accepted by this packet builder.

## Required Inputs

- deployed registry address before external execution
- controller wallet address
- target `chainId`
- nonzero `bytes32` policy id
- `active: true/false` for policy activation changes
- `allowed: true/false` plus `merchantId` or `registryMerchantId` for allowlist changes

Offchain merchant ids are converted with the same namespace used by policy creation and receipt recording:

```text
keccak256("allow-merchant:v1:" + merchantId)
```

## Execution Rule

A valid packet is still only `ready_for_external_approval`. Before a human sends the transaction:

- run `npm test`
- run `npm run readiness`
- confirm the target registry address and controller wallet
- approve an external action packet with `actionType: "registry_lifecycle_update"`
- confirm the calldata and policy id against the wallet UI

Use deactivation as the first response for a compromised agent wallet, bad merchant integration, replay anomaly, or disputed policy.
