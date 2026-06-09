# Evidence Bundles

Evidence bundles bind launch claims, X post execution evidence, X post state reconciliation, pilot proof, deployment reports, deployment check evidence, independent contract review evidence, registry transaction evidence, signing ceremonies, controller signing execution evidence, interviews, outreach execution evidence, and external approvals to exact file hashes.

They do not copy or publish evidence. They only verify that referenced files exist, match declared SHA-256 digests, and are safe for their declared visibility.

## Command

```bash
npm run evidence-bundle -- ops/evidence_bundle_template.json
```

The template exits nonzero until real hashes and approvals are filled in.

## Manifest Rules

Every bundle needs:

- `bundleId`
- `purpose`
- `generatedAt`
- `owner`
- `approvalRef`
- at least one artifact

Each artifact needs:

- `id`
- `type`
- project-relative `path`
- `sha256`
- `visibility`: `private`, `redacted`, or `public`
- `sourceRef`

Public or redacted artifacts must set `redacted: true`. Public artifacts must also set `ownerApprovedForPublicUse: true`.

## Visibility Rules

Keep raw receipt logs, signed policies, interview evidence, X post execution evidence, outreach execution evidence, confidential review reports, and merchant intakes private. Public bundles should cite approved disclosure packets, redacted receipt logs, pilot reports, redacted X post execution evidence, X post state reports, deployment manifests, redacted deployment check evidence, redacted independent contract review evidence, registry transaction evidence, external action approvals, merchant promotion packets, and test reports.

The validator rejects:

- missing files
- path traversal outside the project root
- SHA-256 mismatches
- public raw receipt logs
- public or redacted files with private keys, seed phrases, bearer tokens, API keys, raw email addresses, or phone numbers
- bundle purposes that lack their required artifact types

## Purpose Requirements

- `launch_claim`: approved disclosure packet and external action approval
- `pilot_evidence`: pilot report and approved disclosure packet
- `merchant_promotion`: merchant promotion packet and approved disclosure packet
- `deployment`: deployment manifest, deployment check evidence, independent contract review evidence, test report, and external action approval
- `registry_transaction`: registry transaction evidence and external action approval
- `signing_ceremony`: signing packet and external action approval
- `interview_evidence`: interview evidence and merchant intake
- `external_action`: external action approval

## Boundary

`npm run evidence-bundle` does not copy evidence, publish evidence, mutate artifacts, or store secrets. It is a hash-checking control for later audit.
