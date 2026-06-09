# Receipt Registry Intents

`AllowanceRegistry.recordReceipt` is the public proof layer for policy-bounded payment receipts. The registry does not custody funds and it must never receive raw metadata, private keys, seed phrases, or signed transaction bytes.

Use `npm run receipt-registry-intent -- ops/receipt_registry_intent_template.json` to build a dry-run packet before any onchain write. The command outputs calldata, deterministic hash commitments, the expected registry receipt id, and a safety block. It does not deploy, sign, broadcast, escrow, or transfer funds.

Run `npm run registry-policy-intent` first when the registry policy has not been created yet. Receipt packets require the `bytes32` policy id emitted by `AllowanceRegistry.createPolicy`.

## Required Inputs

- a receipt with `decision: "allow"`
- merchant-approved `testnet` or `mainnet` evidence for live use
- the `bytes32` `registryPolicyId` returned by `AllowanceRegistry.createPolicy`
- a target `chainId`
- a recorder address when computing the expected registry receipt id
- a registry contract address before external execution

The offchain Allow `policyId` is not enough. The contract maps policies by the `bytes32` id emitted from `PolicyCreated`.

## Hashes

The builder converts offchain receipt material into registry-safe `bytes32` fields:

- `merchantId`: `keccak256("allow-merchant:v1:" + merchantId)` unless an explicit registry merchant id is supplied
- `intentNonce`: `keccak256("allow-intent-nonce:v1:" + intentNonce)` unless an explicit registry nonce is supplied
- `intentHash`: a canonical Keccak commitment over policy, merchant, amount, resource, nonce, and the offchain intent hash
- `metadataHash`: a canonical Keccak commitment over the existing metadata hash, resource, receipt id, and evidence summary

Operators must create the registry policy using the same merchant id namespace, otherwise `recordReceipt` will revert with `MerchantNotAllowed`.

## Execution Rule

A valid packet is still only `ready_for_external_approval`. Before a human sends the transaction:

- run `npm test`
- run `npm run readiness`
- validate the deployment manifest
- verify `npm run independent-contract-review -- <evidence>` passes for the deployed source
- approve an external action packet with `actionType: "registry_receipt_write"`
- confirm the calldata and expected receipt id against the wallet UI

Never paste private keys or raw transaction bytes into this repository.
