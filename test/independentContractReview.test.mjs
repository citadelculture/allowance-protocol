import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  REQUIRED_CONTRACT_REVIEW_BEHAVIORS,
  buildIndependentContractReviewReport
} from "../src/independentContractReview.mjs";

const root = join(tmpdir(), `allow-independent-review-${Date.now()}`);
await mkdir(join(root, "contracts"), { recursive: true });
const source = "contract AllowanceRegistry { event ReceiptRecorded(bytes32 policyId); }";
await writeFile(join(root, "contracts/AllowanceRegistry.sol"), source);
const sourceSha256 = `0x${createHash("sha256").update(source).digest("hex")}`;

function evidence(overrides = {}) {
  return {
    evidenceId: "independent-review-001",
    status: "approved",
    generatedAt: "2026-06-08T12:00:00.000Z",
    deploymentManifestRef: "ops/deployment_manifest.local.json",
    reviewer: {
      name: "External Reviewer",
      organization: "Independent Security Lab",
      contactRef: "security-reviewer-profile",
      independent: true,
      notProjectOperator: true,
      noFinancialInterest: true,
      notPaidInTokenOrContingentUpside: true,
      conflictDisclosure: "none"
    },
    contract: {
      name: "AllowanceRegistry",
      path: "contracts/AllowanceRegistry.sol",
      sourceSha256,
      commitRef: "commit:abc123"
    },
    scope: {
      reviewedBehaviors: REQUIRED_CONTRACT_REVIEW_BEHAVIORS
    },
    review: {
      reportRef: "reports/independent-allowance-registry-review.md",
      reviewedAt: "2026-06-08T13:00:00.000Z",
      summary: "Reviewed registry authorization, replay, cap, metadata, lifecycle, and no-custody behavior.",
      conclusion: "approved_for_testnet",
      methodology: ["manual_source_review", "threat_model_review", "test_review", "static_analysis_review"],
      approvedForDeployment: true,
      remediationReviewed: true
    },
    findings: {
      open: [],
      resolved: [
        {
          id: "IR-001",
          severity: "medium",
          title: "Clarify policy lifecycle event expectations",
          remediationRef: "commit:def456"
        }
      ]
    },
    proof: {
      type: "security_review_report",
      ref: "reports/redacted-independent-allowance-registry-review.md",
      capturedAt: "2026-06-08T13:10:00.000Z",
      redacted: true
    },
    safety: {
      noPrivateKeys: true,
      noCustodyOrEscrow: true,
      noTokenPitch: true,
      noMarketManipulation: true,
      noDeploymentExecution: true,
      noFundsMoved: true,
      noReviewerCustody: true
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
    independentReview: {
      status: "approved",
      evidenceRef: "independent-review-001",
      reportRef: "reports/independent-allowance-registry-review.md",
      sourceSha256
    }
  }
};

const valid = await buildIndependentContractReviewReport(evidence(), { root, deploymentManifest });
assert.equal(valid.valid, true);
assert.equal(valid.status, "verified_independent_contract_review");
assert.equal(valid.sourceCheck.actualSha256, sourceSha256);
assert.equal(valid.deploymentManifestBinding.valid, true);
assert.equal(valid.findings.openBlockingCount, 0);
assert.equal(valid.evidenceBoundary.deploysContracts, false);
assert.equal(valid.evidenceBoundary.requiresHumanDeploymentApproval, true);

const noRoot = await buildIndependentContractReviewReport(evidence(), { deploymentManifest });
assert.equal(noRoot.valid, false);
assert.ok(noRoot.reasons.includes("options.root is required to recompute contract.sourceSha256"));

const unapproved = await buildIndependentContractReviewReport(evidence({ status: "draft" }), { root, deploymentManifest });
assert.equal(unapproved.valid, false);
assert.ok(unapproved.reasons.includes("status must be approved after the independent reviewer signs off"));

const conflicted = await buildIndependentContractReviewReport(
  evidence({
    reviewer: {
      ...evidence().reviewer,
      independent: false,
      conflictDisclosure: "reviewer owns project tokens"
    }
  }),
  { root, deploymentManifest }
);
assert.equal(conflicted.valid, false);
assert.ok(conflicted.reasons.includes("reviewer.independent must be true"));
assert.ok(conflicted.warnings.includes("reviewer.conflictDisclosure is not none; deployment approver must review the conflict note"));

const hashMismatch = await buildIndependentContractReviewReport(
  evidence({
    contract: {
      ...evidence().contract,
      sourceSha256: `0x${"11".repeat(32)}`
    }
  }),
  { root, deploymentManifest }
);
assert.equal(hashMismatch.valid, false);
assert.ok(hashMismatch.reasons.includes("contract.sourceSha256 does not match contract.path"));
assert.ok(hashMismatch.reasons.includes("deploymentManifest.contract.sourceSha256 must match reviewed contract.sourceSha256"));

const missingScope = await buildIndependentContractReviewReport(
  evidence({
    scope: {
      reviewedBehaviors: ["authorization"]
    }
  }),
  { root, deploymentManifest }
);
assert.equal(missingScope.valid, false);
assert.ok(missingScope.reasons.includes("scope.reviewedBehaviors must include replay_protection"));

const openHigh = await buildIndependentContractReviewReport(
  evidence({
    findings: {
      open: [{ id: "IR-002", severity: "high", title: "Replay proof incomplete" }],
      resolved: []
    }
  }),
  { root, deploymentManifest }
);
assert.equal(openHigh.valid, false);
assert.ok(openHigh.reasons.includes("Open high finding IR-002 blocks deployment"));

const unresolvedMedium = await buildIndependentContractReviewReport(
  evidence({
    findings: {
      open: [],
      resolved: [{ id: "IR-003", severity: "medium", title: "Cap edge case fixed" }]
    }
  }),
  { root, deploymentManifest }
);
assert.equal(unresolvedMedium.valid, false);
assert.ok(unresolvedMedium.reasons.includes("Resolved medium finding IR-003 must include remediationRef"));

const unredactedProof = await buildIndependentContractReviewReport(
  evidence({
    proof: {
      ...evidence().proof,
      redacted: false
    }
  }),
  { root, deploymentManifest }
);
assert.equal(unredactedProof.valid, false);
assert.ok(unredactedProof.reasons.includes("proof.redacted must be true"));

const secretNote = await buildIndependentContractReviewReport(
  evidence({
    notes: ["api_key=abc123"]
  }),
  { root, deploymentManifest }
);
assert.equal(secretNote.valid, false);
assert.ok(secretNote.reasons.includes("Independent contract review evidence must not include API keys, secrets, or passwords"));

console.log("independentContractReview tests passed");
