import assert from "node:assert/strict";
import { summarizeDeploymentManifest, validateDeploymentManifest } from "../src/deploymentReadiness.mjs";

const validManifest = {
  manifestId: "allow-registry-base-sepolia-001",
  generatedAt: "2026-06-08",
  contract: {
    name: "AllowanceRegistry",
    path: "contracts/AllowanceRegistry.sol",
    sourceSha256: "0x59c437f2a3f3ae194ba71d3902eb7126ea36663b55fc0f56da907ef599b89599"
  },
  target: {
    environment: "testnet",
    network: "Base Sepolia",
    chainId: 84532,
    deployer: "0x0000000000000000000000000000000000000001",
    controller: "0x0000000000000000000000000000000000000002",
    treasuryMultisig: "0x0000000000000000000000000000000000000003"
  },
  checks: {
    npmTest: { status: "passed", reportRef: "ci:npm-test:2026-06-08" },
    contractReview: { status: "passed", reportRef: "npm-run-contract-review:2026-06-08" },
    compiler: { status: "passed", tool: "solc", version: "0.8.x", artifactRef: "artifacts/AllowanceRegistry.json" },
    staticAnalysis: { status: "passed", tool: "slither", reportRef: "reports/slither-allowance-registry.md" },
    independentReview: {
      status: "approved",
      reviewer: "external-reviewer",
      reportRef: "reports/independent-review.md",
      evidenceRef: "independent-review-001",
      sourceSha256: "0x59c437f2a3f3ae194ba71d3902eb7126ea36663b55fc0f56da907ef599b89599",
      reviewedAt: "2026-06-08"
    }
  },
  custody: {
    noPayableEntrypoints: true,
    noTransferPrimitives: true,
    receiptMetadataHashedOnly: true,
    noEscrowOrCustody: true
  },
  token: {
    launchEnabled: false,
    transferable: false,
    gateRef: "docs/TOKEN_PATH.md"
  },
  approvals: {
    approvedBy: "security-council",
    approvedAt: "2026-06-08"
  }
};

const valid = validateDeploymentManifest(validManifest);
assert.equal(valid.valid, true);
assert.deepEqual(valid.reasons, []);

const summary = summarizeDeploymentManifest(validManifest);
assert.equal(summary.valid, true);
assert.equal(summary.network, "Base Sepolia");

const templateLike = validateDeploymentManifest({
  ...validManifest,
  checks: {
    ...validManifest.checks,
    compiler: { status: "missing", artifactRef: "" },
    independentReview: { status: "missing", reviewer: "", reportRef: "", evidenceRef: "", sourceSha256: "", reviewedAt: "" }
  },
  approvals: {
    approvedBy: "",
    approvedAt: ""
  }
});
assert.equal(templateLike.valid, false);
assert.ok(templateLike.reasons.includes("checks.compiler.status must be passed or approved"));
assert.ok(templateLike.reasons.includes("checks.independentReview.status must be approved"));
assert.ok(templateLike.reasons.includes("Missing checks.independentReview.evidenceRef"));
assert.ok(templateLike.reasons.includes("Missing approvals.approvedBy"));

const reviewHashMismatch = validateDeploymentManifest({
  ...validManifest,
  checks: {
    ...validManifest.checks,
    independentReview: {
      ...validManifest.checks.independentReview,
      sourceSha256: `0x${"11".repeat(32)}`
    }
  }
});
assert.equal(reviewHashMismatch.valid, false);
assert.ok(reviewHashMismatch.reasons.includes("checks.independentReview.sourceSha256 must match contract.sourceSha256"));

const badChain = validateDeploymentManifest({
  ...validManifest,
  target: {
    ...validManifest.target,
    chainId: 8453
  }
});
assert.equal(badChain.valid, false);
assert.ok(badChain.reasons.includes("Base Sepolia chainId must be 84532"));

const badNetwork = validateDeploymentManifest({
  ...validManifest,
  target: {
    ...validManifest.target,
    environment: "mainnet",
    network: "Base Sepolia"
  }
});
assert.equal(badNetwork.valid, false);
assert.ok(badNetwork.reasons.includes("mainnet deployments must target Base"));

const zeroAddress = validateDeploymentManifest({
  ...validManifest,
  target: {
    ...validManifest.target,
    deployer: "0x0000000000000000000000000000000000000000"
  }
});
assert.equal(zeroAddress.valid, false);
assert.ok(zeroAddress.reasons.includes("target.deployer must not be the zero address"));

const custody = validateDeploymentManifest({
  ...validManifest,
  custody: {
    ...validManifest.custody,
    noEscrowOrCustody: false
  }
});
assert.equal(custody.valid, false);
assert.ok(custody.reasons.includes("custody.noEscrowOrCustody must be true"));

const token = validateDeploymentManifest({
  ...validManifest,
  token: {
    ...validManifest.token,
    launchEnabled: true
  }
});
assert.equal(token.valid, false);
assert.ok(token.reasons.includes("token.launchEnabled must be false before usage and legal gates clear"));

const mainnetRequired = validateDeploymentManifest(validManifest, { requireMainnet: true });
assert.equal(mainnetRequired.valid, false);
assert.ok(mainnetRequired.reasons.includes("Mainnet deployment requires target.environment=mainnet"));

console.log("deploymentReadiness tests passed");
