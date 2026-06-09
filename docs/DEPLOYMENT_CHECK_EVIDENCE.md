# Deployment Check Evidence

Deployment check evidence binds the pre-deployment reports for `AllowanceRegistry` to the exact source hash that appears in the deployment manifest.

Run:

```bash
npm run deployment-check-evidence -- ops/deployment_check_evidence_template.json
```

The template exits nonzero until it includes:

- passed `npm test` reference
- passed `npm run contract-review` reference
- compiler tool, version, command, artifact path, artifact SHA-256, and source SHA-256
- static-analysis tool, version, command, report path, report SHA-256, source SHA-256, and zero open critical, high, or medium findings
- matching deployment manifest reference
- safety flags confirming no private keys, wallet signing, deployment execution, funds movement, token changes, custody, or secrets in artifacts

This command does not compile contracts, run static analysis, deploy contracts, approve deployment, sign wallet payloads, or move funds. It only validates the evidence produced by those checks.

After the report passes, copy these fields into `ops/deployment_manifest.template.json` or the private deployment manifest:

- `checks.npmTest.status` and `checks.npmTest.reportRef`
- `checks.contractReview.status` and `checks.contractReview.reportRef`
- `checks.compiler.status`, `tool`, `version`, and `artifactRef`
- `checks.staticAnalysis.status`, `tool`, and `reportRef`

Then run:

```bash
npm run independent-contract-review -- <review-evidence.json>
npm run validate-deployment -- <deployment-manifest.json>
```

Deployment still requires real EVM addresses, real controller signing, independent review evidence, token-disabled posture, final human approval, and a separate `contract_deployment` external-action approval packet.
