# Independent Contract Review Evidence

`AllowanceRegistry` deployment needs an independent review record, not just a checked box in the deployment manifest.

Run:

```bash
npm run independent-contract-review -- ops/independent_contract_review_template.json
```

The template exits nonzero until it includes:

- independent reviewer identity and conflict disclosure
- the exact `AllowanceRegistry` source path, commit reference, and SHA-256 hash
- required coverage for authorization, replay protection, spend caps, merchant allowlists, metadata hashing, no-custody behavior, and policy lifecycle
- reviewer methodology including manual source review, threat-model review, and test review
- no open critical, high, or medium findings
- remediation references for resolved blocking findings
- redacted proof of the review report or attestation
- safety flags confirming no private keys, no custody, no token pitch, no deployment execution, and no funds movement

Passing this command does not deploy a contract and does not approve deployment. It only proves that the independent-review evidence is structured enough to copy into the deployment manifest.

## Deployment Binding

After the report passes, copy these fields into `checks.independentReview` in the deployment manifest:

- `status: "approved"`
- `reviewer`
- `reportRef`
- `reviewedAt`
- `evidenceRef`
- `sourceSha256`

Then run:

```bash
npm run deployment-check-evidence -- <deployment-check-evidence.json>
npm run validate-deployment -- ops/deployment_manifest.template.json
```

The deployment manifest must still pass source-hash validation, compiler evidence, static analysis, real addresses, token-disabled posture, and final human approval before a separate `contract_deployment` external-action packet can be approved.
