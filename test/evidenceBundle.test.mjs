import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { buildEvidenceBundleReport } from "../src/evidenceBundle.mjs";

const root = await mkdtemp(join(tmpdir(), "allow-evidence-bundle-"));
await writeFile(
  join(root, "disclosure.json"),
  JSON.stringify({
    disclosureId: "pilot_disclosure_001",
    status: "approved",
    merchantId: "research_api",
    publicSummary: "Allow completed 2 merchant-approved testnet policy decisions."
  })
);
await writeFile(
  join(root, "approval.json"),
  JSON.stringify({
    approvalId: "approval_001",
    status: "approved",
    actionType: "x_post"
  })
);
await writeFile(
  join(root, "registry-tx.json"),
  JSON.stringify({
    evidenceId: "registry_tx_001",
    txHash: `0x${"aa".repeat(32)}`,
    writeIntentHash: `0x${"bb".repeat(32)}`,
    expectedPolicyId: `0x${"cc".repeat(32)}`,
    policyId: `0x${"cc".repeat(32)}`
  })
);
await writeFile(join(root, "deployment-check.json"), JSON.stringify({ evidenceId: "deployment-check-001", status: "verified" }));
await writeFile(join(root, "independent-review.json"), JSON.stringify({ evidenceId: "independent-review-001", status: "verified" }));
await writeFile(join(root, "deployment-manifest.json"), JSON.stringify({ manifestId: "deploy-001" }));
await writeFile(join(root, "test-report.txt"), "npm test passed");

const disclosureHash = await sha256(join(root, "disclosure.json"));
const approvalHash = await sha256(join(root, "approval.json"));
const registryTxHash = await sha256(join(root, "registry-tx.json"));
const deploymentCheckHash = await sha256(join(root, "deployment-check.json"));
const independentReviewHash = await sha256(join(root, "independent-review.json"));
const deploymentManifestHash = await sha256(join(root, "deployment-manifest.json"));
const testReportHash = await sha256(join(root, "test-report.txt"));

const validManifest = {
  bundleId: "bundle_001",
  purpose: "launch_claim",
  generatedAt: "2026-06-08",
  owner: "allow-operator",
  approvalRef: "external-action:approval_001",
  artifacts: [
    {
      id: "approved-disclosure",
      type: "approved_disclosure_packet",
      path: "disclosure.json",
      sha256: disclosureHash,
      visibility: "redacted",
      redacted: true,
      sourceRef: "npm run pilot-disclosure"
    },
    {
      id: "external-approval",
      type: "external_action_approval",
      path: "approval.json",
      sha256: approvalHash,
      visibility: "redacted",
      redacted: true,
      sourceRef: "npm run external-action-approval"
    }
  ]
};

const valid = await buildEvidenceBundleReport(root, validManifest);
assert.equal(valid.valid, true);
assert.equal(valid.artifactCount, 2);
assert.equal(valid.artifacts[0].actualSha256, disclosureHash);
assert.equal(valid.manifestHash.length, 64);

const hashMismatch = await buildEvidenceBundleReport(root, {
  ...validManifest,
  artifacts: [
    {
      ...validManifest.artifacts[0],
      sha256: "0".repeat(64)
    },
    validManifest.artifacts[1]
  ]
});
assert.equal(hashMismatch.valid, false);
assert.ok(hashMismatch.reasons.some((reason) => reason.includes("sha256 does not match file contents")));

const publicRawLog = await buildEvidenceBundleReport(root, {
  ...validManifest,
  artifacts: [
    {
      id: "raw-log",
      type: "raw_receipt_log",
      path: "disclosure.json",
      sha256: disclosureHash,
      visibility: "public",
      redacted: true,
      ownerApprovedForPublicUse: true,
      sourceRef: "receipt-log"
    },
    validManifest.artifacts[1]
  ]
});
assert.equal(publicRawLog.valid, false);
assert.ok(publicRawLog.reasons.some((reason) => reason.includes("raw_receipt_log artifacts must not be marked public")));

await writeFile(join(root, "redacted.json"), JSON.stringify({ contact: "person@example.com" }));
const redactedHash = await sha256(join(root, "redacted.json"));
const leaked = await buildEvidenceBundleReport(root, {
  ...validManifest,
  artifacts: [
    {
      ...validManifest.artifacts[0],
      path: "redacted.json",
      sha256: redactedHash
    },
    validManifest.artifacts[1]
  ]
});
assert.equal(leaked.valid, false);
assert.ok(leaked.reasons.some((reason) => reason.includes("raw email addresses")));

const escape = await buildEvidenceBundleReport(root, {
  ...validManifest,
  artifacts: [
    {
      ...validManifest.artifacts[0],
      path: "../outside.json"
    },
    validManifest.artifacts[1]
  ]
});
assert.equal(escape.valid, false);
assert.ok(escape.reasons.some((reason) => reason.includes("path must stay inside")));

const missingPurposeArtifact = await buildEvidenceBundleReport(root, {
  ...validManifest,
  purpose: "deployment"
});
assert.equal(missingPurposeArtifact.valid, false);
assert.ok(missingPurposeArtifact.reasons.includes("purpose deployment requires artifact type deployment_manifest"));
assert.ok(missingPurposeArtifact.reasons.includes("purpose deployment requires artifact type deployment_check_evidence"));
assert.ok(missingPurposeArtifact.reasons.includes("purpose deployment requires artifact type independent_contract_review_evidence"));

const deploymentBundle = await buildEvidenceBundleReport(root, {
  ...validManifest,
  purpose: "deployment",
  artifacts: [
    {
      id: "deployment-manifest",
      type: "deployment_manifest",
      path: "deployment-manifest.json",
      sha256: deploymentManifestHash,
      visibility: "redacted",
      redacted: true,
      sourceRef: "npm run validate-deployment"
    },
    {
      id: "deployment-check",
      type: "deployment_check_evidence",
      path: "deployment-check.json",
      sha256: deploymentCheckHash,
      visibility: "redacted",
      redacted: true,
      sourceRef: "npm run deployment-check-evidence"
    },
    {
      id: "independent-review",
      type: "independent_contract_review_evidence",
      path: "independent-review.json",
      sha256: independentReviewHash,
      visibility: "redacted",
      redacted: true,
      sourceRef: "npm run independent-contract-review"
    },
    {
      id: "test-report",
      type: "test_report",
      path: "test-report.txt",
      sha256: testReportHash,
      visibility: "redacted",
      redacted: true,
      sourceRef: "npm test"
    },
    validManifest.artifacts[1]
  ]
});
assert.equal(deploymentBundle.valid, true);

const registryBundle = await buildEvidenceBundleReport(root, {
  ...validManifest,
  purpose: "registry_transaction",
  artifacts: [
    {
      id: "registry-tx",
      type: "registry_transaction_evidence",
      path: "registry-tx.json",
      sha256: registryTxHash,
      visibility: "public",
      redacted: true,
      ownerApprovedForPublicUse: true,
      sourceRef: "npm run registry-transaction-evidence"
    },
    validManifest.artifacts[1]
  ]
});
assert.equal(registryBundle.valid, true);

await writeFile(
  join(root, "registry-tx-leak.json"),
  JSON.stringify({
    evidenceId: "registry_tx_002",
    txHash: `0x${"aa".repeat(32)}`,
    controllerPrivateKey: "0x0000000000000000000000000000000000000000000000000000000000000001"
  })
);
const registryLeakHash = await sha256(join(root, "registry-tx-leak.json"));
const registryLeak = await buildEvidenceBundleReport(root, {
  ...validManifest,
  purpose: "registry_transaction",
  artifacts: [
    {
      id: "registry-tx-leak",
      type: "registry_transaction_evidence",
      path: "registry-tx-leak.json",
      sha256: registryLeakHash,
      visibility: "public",
      redacted: true,
      ownerApprovedForPublicUse: true,
      sourceRef: "npm run registry-transaction-evidence"
    },
    validManifest.artifacts[1]
  ]
});
assert.equal(registryLeak.valid, false);
assert.ok(registryLeak.reasons.some((reason) => reason.includes("private keys")));

console.log("evidenceBundle tests passed");

async function sha256(path) {
  const { readFile } = await import("node:fs/promises");
  const bytes = await readFile(path);
  return createHash("sha256").update(bytes).digest("hex");
}
