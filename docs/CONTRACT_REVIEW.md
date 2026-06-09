# Contract Review Gate

`AllowanceRegistry.sol` is a no-custody receipt registry prototype. It should not be deployed until automated checks, compiler tests, and independent review all pass.

Run the local source review:

```bash
npm run contract-review
```

The automated review checks for:

- no payable entrypoint or transfer primitive
- controller nonce and chain-domain policy ids
- controller and agent recorder authorization
- merchant allowlist enforcement
- per-transaction and epoch spend caps
- non-zero intent nonce and replay rejection
- receipt events that store hashes and ids, not raw metadata
- policy activation lifecycle

This review is not an audit. It is a pre-deploy guard that catches obvious regressions before a human contract review.

Validate the compiler and static-analysis evidence after artifacts exist:

```bash
npm run deployment-check-evidence -- ops/deployment_check_evidence_template.json
```

That command checks the `npm test`, contract review, compiler artifact, and static-analysis report references against the exact source hash. It does not compile, run analysis, deploy, approve deployment, or replace the checks.

Validate the independent review evidence after an external reviewer signs off:

```bash
npm run independent-contract-review -- ops/independent_contract_review_template.json
```

That command checks reviewer independence, required review scope, source hash, findings, redacted proof, and safety flags. It does not deploy, approve deployment, or replace the external review.

## Deployment Rule

Do not deploy `AllowanceRegistry` to Base Sepolia until:

- `npm run contract-review` passes
- `npm run deployment-check-evidence -- <evidence>` passes
- `npm run independent-contract-review -- <evidence>` passes
- `npm test` passes
- `npm run validate-deployment -- <manifest>` passes for the exact source hash
- deployment policy is signed by a real controller wallet
- receipt metadata remains hashed or omitted
- an independent reviewer has checked replay, cap, and authorization logic
