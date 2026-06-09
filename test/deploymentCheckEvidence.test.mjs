import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildDeploymentCheckEvidenceReport } from "../src/deploymentCheckEvidence.mjs";

const root = join(tmpdir(), `allow-deployment-check-${Date.now()}`);
await mkdir(join(root, "contracts"), { recursive: true });
await mkdir(join(root, "artifacts"), { recursive: true });
await mkdir(join(root, "reports"), { recursive: true });
const source = "contract AllowanceRegistry { event ReceiptRecorded(bytes32 policyId); }";
const artifact = JSON.stringify({ contractName: "AllowanceRegistry", abi: [], bytecode: "0x6000" });
const staticReport = JSON.stringify({ tool: "slither", openCritical: 0, openHigh: 0, openMedium: 0 });
await writeFile(join(root, "contracts/AllowanceRegistry.sol"), source);
await writeFile(join(root, "artifacts/AllowanceRegistry.json"), artifact);
await writeFile(join(root, "reports/slither-allowance-registry.json"), staticReport);
const sourceSha256 = hexSha(source);
const artifactSha256 = plainSha(artifact);
const staticReportSha256 = plainSha(staticReport);

function evidence(overrides = {}) {
  return {
    evidenceId: "deployment-check-001",
    status: "passed",
    generatedAt: "2026-06-08T12:00:00.000Z",
    deploymentManifestRef: "ops/deployment_manifest.local.json",
    contract: {
      name: "AllowanceRegistry",
      path: "contracts/AllowanceRegistry.sol",
      sourceSha256,
      commitRef: "commit:abc123"
    },
    checks: {
      npmTest: {
        status: "passed",
        command: "npm test",
        reportRef: "reports/npm-test-2026-06-08.txt",
        completedAt: "2026-06-08T12:05:00.000Z"
      },
      contractReview: {
        status: "passed",
        command: "npm run contract-review",
        reportRef: "reports/contract-review-2026-06-08.json",
        completedAt: "2026-06-08T12:06:00.000Z"
      },
      compiler: {
        status: "passed",
        tool: "solc",
        version: "0.8.26",
        command: "solc --combined-json abi,bin contracts/AllowanceRegistry.sol",
        artifactRef: "artifacts/AllowanceRegistry.json",
        artifactSha256,
        sourceSha256,
        completedAt: "2026-06-08T12:07:00.000Z"
      },
      staticAnalysis: {
        status: "passed",
        tool: "slither",
        version: "0.10.4",
        command: "slither contracts/AllowanceRegistry.sol --json reports/slither-allowance-registry.json",
        reportRef: "reports/slither-allowance-registry.json",
        reportSha256: staticReportSha256,
        sourceSha256,
        completedAt: "2026-06-08T12:08:00.000Z",
        findings: {
          openCritical: 0,
          openHigh: 0,
          openMedium: 0,
          openLow: 0
        }
      }
    },
    safety: {
      noPrivateKeys: true,
      noWalletSigning: true,
      noDeploymentExecution: true,
      noFundsMoved: true,
      noTokenChanges: true,
      noCustodyOrEscrow: true,
      artifactsDoNotContainSecrets: true
    },
    ...overrides
  };
}

const deploymentManifest = {
  manifestId: "deploy-001",
  contract: {
    name: "AllowanceRegistry",
    path: "contracts/AllowanceRegistry.sol",
    sourceSha256
  },
  checks: {
    npmTest: { status: "passed", reportRef: "reports/npm-test-2026-06-08.txt" },
    contractReview: { status: "passed", reportRef: "reports/contract-review-2026-06-08.json" },
    compiler: {
      status: "passed",
      tool: "solc",
      version: "0.8.26",
      artifactRef: "artifacts/AllowanceRegistry.json"
    },
    staticAnalysis: {
      status: "passed",
      tool: "slither",
      reportRef: "reports/slither-allowance-registry.json"
    }
  }
};

const valid = await buildDeploymentCheckEvidenceReport(evidence(), { root, deploymentManifest });
assert.equal(valid.valid, true);
assert.equal(valid.status, "verified_deployment_check_evidence");
assert.equal(valid.sourceCheck.actualSha256, sourceSha256);
assert.equal(valid.artifactChecks.length, 2);
assert.equal(valid.artifactChecks.every((check) => check.valid), true);
assert.equal(valid.evidenceBoundary.deploysContracts, false);
assert.equal(valid.evidenceBoundary.compilesContracts, false);

const noRoot = await buildDeploymentCheckEvidenceReport(evidence(), { deploymentManifest });
assert.equal(noRoot.valid, false);
assert.ok(noRoot.reasons.includes("options.root is required to recompute contract.sourceSha256"));
assert.ok(noRoot.reasons.includes("options.root is required to validate deployment check artifacts"));

const artifactMismatch = await buildDeploymentCheckEvidenceReport(
  evidence({
    checks: {
      ...evidence().checks,
      compiler: {
        ...evidence().checks.compiler,
        artifactSha256: "0".repeat(64)
      }
    }
  }),
  { root, deploymentManifest }
);
assert.equal(artifactMismatch.valid, false);
assert.ok(artifactMismatch.reasons.includes("checks.compiler.artifactRef sha256 does not match file contents"));

const staticHigh = await buildDeploymentCheckEvidenceReport(
  evidence({
    checks: {
      ...evidence().checks,
      staticAnalysis: {
        ...evidence().checks.staticAnalysis,
        findings: {
          openCritical: 0,
          openHigh: 1,
          openMedium: 0,
          openLow: 0
        }
      }
    }
  }),
  { root, deploymentManifest }
);
assert.equal(staticHigh.valid, false);
assert.ok(staticHigh.reasons.includes("checks.staticAnalysis.findings.openHigh must be 0"));

const manifestMismatch = await buildDeploymentCheckEvidenceReport(evidence(), {
  root,
  deploymentManifest: {
    ...deploymentManifest,
    checks: {
      ...deploymentManifest.checks,
      compiler: {
        ...deploymentManifest.checks.compiler,
        artifactRef: "artifacts/Other.json"
      }
    }
  }
});
assert.equal(manifestMismatch.valid, false);
assert.ok(manifestMismatch.reasons.includes("deploymentManifest.checks.compiler.artifactRef must match deployment check evidence"));

const secretNote = await buildDeploymentCheckEvidenceReport(
  evidence({
    notes: ["api_key=abc123"]
  }),
  { root, deploymentManifest }
);
assert.equal(secretNote.valid, false);
assert.ok(secretNote.reasons.includes("Deployment check evidence must not include API keys, secrets, or passwords"));

console.log("deploymentCheckEvidence tests passed");

function plainSha(value) {
  return createHash("sha256").update(value).digest("hex");
}

function hexSha(value) {
  return `0x${plainSha(value)}`;
}
