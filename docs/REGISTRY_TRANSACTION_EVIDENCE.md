# Registry Transaction Evidence

Registry intent packets prepare calldata. Transaction evidence proves what a human actually sent afterward.

Use `npm run registry-transaction-evidence -- ops/registry_transaction_evidence_template.json` after a human submits a registry transaction. The command validates public transaction metadata against the approved intent hash, expected result, registry address, chain id, and approval reference. It does not fetch chain data, sign, broadcast, custody, escrow, or transfer funds.

## Supported Actions

- `registry_policy_create`: requires `createPolicy`, `PolicyCreated`, and a matching expected `policyId`
- `registry_receipt_write`: requires `recordReceipt`, `ReceiptRecorded`, and a matching expected `receiptId`
- `registry_lifecycle_update`: requires lifecycle result evidence for `set_policy_active` or `set_merchant_allowed`

For `set_merchant_allowed`, the contract does not emit an event. Include a `stateCheckRef` that documents the post-transaction read of `allowedMerchant(policyId, merchantId)`.

## Required Evidence

- `evidenceId`
- `actionType`
- `status: "confirmed"`
- `approvalRef`
- `network` and `chainId`
- `registryAddress`
- transaction hash, status, sender, receiver, block number, and block timestamp
- intent `writeIntentHash` and function name
- action-specific expected result

Keep this evidence public-chain-only. Do not include private keys, seed phrases, raw transaction bytes, signed transaction bytes, bearer tokens, or API keys.

## Evidence Bundles

Use evidence-bundle purpose `registry_transaction` with:

- `registry_transaction_evidence`
- `external_action_approval`

Registry transaction evidence may be public when it contains only public chain metadata and has owner approval for public use.
