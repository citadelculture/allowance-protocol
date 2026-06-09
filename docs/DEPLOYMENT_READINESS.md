# Deployment Readiness

`AllowanceRegistry` must not be deployed until a deployment manifest validates. The manifest is the handoff between local engineering work, independent review, and a real deployment operator.

Run:

```bash
npm run validate-deployment -- ops/deployment_manifest.template.json
```

The template is intentionally invalid. It should fail until real deployment evidence replaces every placeholder.

## Required Evidence

- `npm test` passed with a durable report reference
- `npm run contract-review` passed with a report reference
- `npm run deployment-check-evidence -- <evidence>` passed, binding compiler output and static analysis to the exact source hash in the manifest
- `npm run independent-contract-review -- <evidence>` passed for the exact source hash
- an independent reviewer approved replay, cap, authorization, metadata, and no-custody behavior, with `evidenceRef` and `sourceSha256` copied into the manifest
- deployer, controller, and treasury multisig addresses are real non-zero EVM addresses
- the target network matches the environment: Base Sepolia for testnet, Base for mainnet
- token launch and transferability are disabled
- the final approval is dated and attributed

## Source Hash

The validator recomputes the SHA-256 hash of `contract.path` and compares it with `contract.sourceSha256`. Any contract edit requires a new manifest hash and fresh review evidence.

## Deployment Rule

Do not use hot-wallet shortcuts or fixture policies for a public deployment. The controller policy must be signed by the real controller wallet, treasury powers must be behind a multisig, and independent review evidence must be linked in the manifest before deployment.

The validator is not an audit or compiler. It is a fail-closed checklist that prevents deploying a different source, an unreviewed source, or a source with missing operational approvals.

## Post-Deploy Receipt Writes

After deployment, use `npm run registry-policy-intent -- ops/registry_policy_intent_template.json` before creating an onchain policy. The packet must reference the deployed registry address, controller wallet, agent wallet, settlement token, target chain id, and nonzero controller nonce. It produces calldata and the expected `policyId` only.

Then use `npm run receipt-registry-intent -- ops/receipt_registry_intent_template.json` before recording any receipt. The receipt packet must reference the deployed registry address, recorder address, target chain id, and the `bytes32` policy id emitted by `AllowanceRegistry.createPolicy`. Both packets require separate human external-action approval before execution.

Use `npm run registry-lifecycle-intent -- ops/registry_lifecycle_intent_template.json` for post-deploy policy deactivation or merchant allowlist changes. Lifecycle packets must also be approved before a human controller wallet sends them.

After any approved registry transaction is sent, validate the public receipt with `npm run registry-transaction-evidence -- ops/registry_transaction_evidence_template.json` and include it in a `registry_transaction` evidence bundle.
