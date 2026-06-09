import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

export const INDEPENDENT_CONTRACT_REVIEW_STATUSES = ["draft", "approved", "rejected"];
export const INDEPENDENT_CONTRACT_REVIEW_CONCLUSIONS = ["approved_for_testnet", "approved_for_mainnet"];
export const INDEPENDENT_CONTRACT_REVIEW_PROOF_TYPES = [
  "security_review_report",
  "signed_attestation",
  "pull_request_review",
  "manual_log"
];
export const INDEPENDENT_CONTRACT_REVIEW_METHODOLOGIES = [
  "manual_source_review",
  "threat_model_review",
  "test_review",
  "static_analysis_review",
  "compiler_artifact_review"
];
export const REQUIRED_CONTRACT_REVIEW_BEHAVIORS = [
  "authorization",
  "replay_protection",
  "spend_caps",
  "merchant_allowlist",
  "metadata_hashing",
  "no_custody",
  "policy_lifecycle"
];

const BLOCKING_FINDING_SEVERITIES = ["critical", "high", "medium"];
const FINDING_SEVERITIES = [...BLOCKING_FINDING_SEVERITIES, "low", "informational"];
const SENSITIVE_TEXT_PATTERNS = [
  { id: "private_key", pattern: /\b0x[0-9a-fA-F]{64}\b/, reason: "Independent contract review evidence must not include private keys or seed-like hex values" },
  { id: "seed_phrase", pattern: /\b(?:seed phrase|mnemonic|recovery phrase)\b/i, reason: "Independent contract review evidence must not include wallet seed or recovery phrase material" },
  { id: "bearer_token", pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b/i, reason: "Independent contract review evidence must not include bearer tokens" },
  { id: "api_key", pattern: /\b(api[_-]?key|secret|password)\s*[:=]\s*\S+/i, reason: "Independent contract review evidence must not include API keys, secrets, or passwords" },
  { id: "signed_transaction", pattern: /\bsigned transaction\b|\braw transaction\b/i, reason: "Independent contract review evidence must not include signed or raw transactions" }
];

export async function buildIndependentContractReviewReport(evidence = {}, options = {}) {
  const reasons = [...(options.sourceErrors || [])];
  const warnings = [];

  if (!isPlainObject(evidence)) {
    return {
      valid: false,
      reasons: ["Independent contract review evidence must be a JSON object"],
      warnings: [],
      sourceCheck: null,
      deploymentManifestBinding: null,
      redactionFlags: [],
      evidenceBoundary: boundary()
    };
  }

  const reviewer = isPlainObject(evidence.reviewer) ? evidence.reviewer : {};
  const contract = isPlainObject(evidence.contract) ? evidence.contract : {};
  const scope = isPlainObject(evidence.scope) ? evidence.scope : {};
  const review = isPlainObject(evidence.review) ? evidence.review : {};
  const findings = isPlainObject(evidence.findings) ? evidence.findings : {};
  const proof = isPlainObject(evidence.proof) ? evidence.proof : {};
  const safety = isPlainObject(evidence.safety) ? evidence.safety : {};
  const deploymentManifest = options.deploymentManifest || evidence.deploymentManifest || null;

  requireText(reasons, evidence.evidenceId, "evidenceId");
  requireKnown(reasons, evidence.status, INDEPENDENT_CONTRACT_REVIEW_STATUSES, "status");
  if (evidence.status !== "approved") reasons.push("status must be approved after the independent reviewer signs off");
  requireText(reasons, evidence.generatedAt, "generatedAt");
  if (evidence.generatedAt && !isValidDate(evidence.generatedAt)) reasons.push("generatedAt must be a valid date");
  requireText(reasons, evidence.deploymentManifestRef || evidence.deploymentManifestPath, "deploymentManifestRef");

  validateReviewer(reasons, warnings, reviewer);
  validateContract(reasons, contract);
  const sourceCheck = await contractSourceHashCheck(contract, options);
  reasons.push(...sourceCheck.reasons);
  warnings.push(...sourceCheck.warnings);
  const deploymentManifestBinding = validateDeploymentManifestBinding({
    evidenceId: evidence.evidenceId,
    contract,
    deploymentManifest
  });
  reasons.push(...deploymentManifestBinding.reasons);
  warnings.push(...deploymentManifestBinding.warnings);
  validateScope(reasons, scope);
  validateReview(reasons, warnings, review);
  const findingsReport = validateFindings(reasons, warnings, findings);
  validateProof(reasons, proof);
  validateSafety(reasons, safety);

  const redactionFlags = sensitiveFlags(textForSensitiveScan(evidence));
  reasons.push(...redactionFlags.map((flag) => flag.reason));

  return {
    valid: reasons.length === 0,
    status: reasons.length === 0 ? "verified_independent_contract_review" : "needs_independent_contract_review_evidence",
    evidenceId: evidence.evidenceId || null,
    generatedAt: evidence.generatedAt || null,
    deploymentManifestRef: evidence.deploymentManifestRef || evidence.deploymentManifestPath || null,
    reviewer: {
      name: reviewer.name || null,
      organization: reviewer.organization || null,
      contactRef: reviewer.contactRef || null,
      independent: reviewer.independent === true,
      conflictDisclosure: reviewer.conflictDisclosure || null
    },
    contract: {
      name: contract.name || null,
      path: contract.path || null,
      sourceSha256: contract.sourceSha256 || null,
      commitRef: contract.commitRef || null
    },
    review: {
      reportRef: review.reportRef || null,
      reviewedAt: review.reviewedAt || null,
      conclusion: review.conclusion || null,
      methodology: Array.isArray(review.methodology) ? review.methodology : [],
      approvedForDeployment: review.approvedForDeployment === true,
      remediationReviewed: review.remediationReviewed === true
    },
    scope: {
      reviewedBehaviors: reviewedBehaviors(scope),
      missingRequiredBehaviors: missingRequiredBehaviors(scope)
    },
    findings: findingsReport.summary,
    proof: {
      type: proof.type || null,
      ref: proof.ref || null,
      capturedAt: proof.capturedAt || null,
      redacted: proof.redacted === true
    },
    sourceCheck,
    deploymentManifestBinding,
    redactionFlags,
    reasons: unique(reasons),
    warnings: unique(warnings),
    nextAction:
      reasons.length === 0
        ? "Copy evidenceId, reviewer, reportRef, reviewedAt, and sourceSha256 into the deployment manifest independentReview block"
        : "Attach independent reviewer identity, exact source hash, required scope coverage, finding resolution, redacted proof, and deployment manifest reference",
    evidenceBoundary: boundary()
  };
}

function validateReviewer(reasons, warnings, reviewer) {
  requireText(reasons, reviewer.name, "reviewer.name");
  requireText(reasons, reviewer.organization, "reviewer.organization");
  requireText(reasons, reviewer.contactRef, "reviewer.contactRef");
  requireText(reasons, reviewer.conflictDisclosure, "reviewer.conflictDisclosure");
  if (reviewer.independent !== true) reasons.push("reviewer.independent must be true");
  if (reviewer.notProjectOperator !== true) reasons.push("reviewer.notProjectOperator must be true");
  if (reviewer.noFinancialInterest !== true) reasons.push("reviewer.noFinancialInterest must be true");
  if (reviewer.notPaidInTokenOrContingentUpside !== true) {
    reasons.push("reviewer.notPaidInTokenOrContingentUpside must be true");
  }
  const conflictDisclosure = String(reviewer.conflictDisclosure || "").trim().toLowerCase();
  if (conflictDisclosure && conflictDisclosure !== "none") {
    warnings.push("reviewer.conflictDisclosure is not none; deployment approver must review the conflict note");
  }
}

function validateContract(reasons, contract) {
  requireText(reasons, contract.name, "contract.name");
  if (contract.name && contract.name !== "AllowanceRegistry") reasons.push("contract.name must be AllowanceRegistry");
  requireText(reasons, contract.path, "contract.path");
  requireHexHash(reasons, contract.sourceSha256, "contract.sourceSha256");
  requireText(reasons, contract.commitRef, "contract.commitRef");
}

async function contractSourceHashCheck(contract, options) {
  const reasons = [];
  const warnings = [];
  const expected = String(contract.sourceSha256 || "").toLowerCase();

  if (!options.root) {
    return {
      valid: false,
      skipped: true,
      reasons: ["options.root is required to recompute contract.sourceSha256"],
      warnings,
      actualSha256: null,
      expectedSha256: expected || null
    };
  }
  if (!contract.path || !expected) {
    return {
      valid: false,
      skipped: false,
      reasons,
      warnings,
      actualSha256: null,
      expectedSha256: expected || null
    };
  }

  try {
    const absolutePath = resolve(options.root, contract.path);
    const normalizedRoot = resolve(options.root);
    const relativePath = relative(normalizedRoot, absolutePath);
    if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
      return {
        valid: false,
        skipped: false,
        reasons: ["contract.path must stay inside the project root"],
        warnings,
        actualSha256: null,
        expectedSha256: expected
      };
    }
    const actual = `0x${createHash("sha256").update(await readFile(absolutePath)).digest("hex")}`;
    if (expected !== actual.toLowerCase()) reasons.push("contract.sourceSha256 does not match contract.path");
    return {
      valid: reasons.length === 0,
      skipped: false,
      reasons,
      warnings,
      actualSha256: actual,
      expectedSha256: expected
    };
  } catch (error) {
    return {
      valid: false,
      skipped: false,
      reasons: [`Unable to hash reviewed contract source: ${error.message}`],
      warnings,
      actualSha256: null,
      expectedSha256: expected
    };
  }
}

function validateDeploymentManifestBinding({ evidenceId, contract, deploymentManifest }) {
  const reasons = [];
  const warnings = [];
  const manifestContract = deploymentManifest?.contract || {};
  const independentReview = deploymentManifest?.checks?.independentReview || {};

  if (!deploymentManifest) {
    warnings.push("deployment manifest was not loaded; only deploymentManifestRef was checked");
    return {
      valid: false,
      checked: false,
      reasons,
      warnings,
      manifestId: null,
      independentReview: null
    };
  }

  if (manifestContract.name && contract.name && manifestContract.name !== contract.name) {
    reasons.push("deploymentManifest.contract.name must match reviewed contract.name");
  }
  if (manifestContract.path && contract.path && manifestContract.path !== contract.path) {
    reasons.push("deploymentManifest.contract.path must match reviewed contract.path");
  }
  if (manifestContract.sourceSha256 && contract.sourceSha256 && manifestContract.sourceSha256 !== contract.sourceSha256) {
    reasons.push("deploymentManifest.contract.sourceSha256 must match reviewed contract.sourceSha256");
  }
  if (independentReview.evidenceRef && evidenceId && independentReview.evidenceRef !== evidenceId) {
    reasons.push("deploymentManifest.checks.independentReview.evidenceRef must match evidenceId");
  }
  if (independentReview.sourceSha256 && contract.sourceSha256 && independentReview.sourceSha256 !== contract.sourceSha256) {
    reasons.push("deploymentManifest.checks.independentReview.sourceSha256 must match reviewed contract.sourceSha256");
  }

  return {
    valid: reasons.length === 0,
    checked: true,
    reasons,
    warnings,
    manifestId: deploymentManifest.manifestId || null,
    independentReview: {
      status: independentReview.status || null,
      evidenceRef: independentReview.evidenceRef || null,
      reportRef: independentReview.reportRef || null,
      sourceSha256: independentReview.sourceSha256 || null
    }
  };
}

function validateScope(reasons, scope) {
  const behaviors = reviewedBehaviors(scope);
  if (!behaviors.length) reasons.push("scope.reviewedBehaviors must be a non-empty array");
  for (const behavior of missingRequiredBehaviors(scope)) {
    reasons.push(`scope.reviewedBehaviors must include ${behavior}`);
  }
}

function validateReview(reasons, warnings, review) {
  requireText(reasons, review.reportRef, "review.reportRef");
  requireText(reasons, review.reviewedAt, "review.reviewedAt");
  requireText(reasons, review.summary, "review.summary");
  requireKnown(reasons, review.conclusion, INDEPENDENT_CONTRACT_REVIEW_CONCLUSIONS, "review.conclusion");
  if (review.reviewedAt && !isValidDate(review.reviewedAt)) reasons.push("review.reviewedAt must be a valid date");
  if (!Array.isArray(review.methodology) || review.methodology.length === 0) {
    reasons.push("review.methodology must be a non-empty array");
  } else {
    for (const method of review.methodology) {
      requireKnown(reasons, method, INDEPENDENT_CONTRACT_REVIEW_METHODOLOGIES, "review.methodology");
    }
    for (const required of ["manual_source_review", "threat_model_review", "test_review"]) {
      if (!review.methodology.includes(required)) reasons.push(`review.methodology must include ${required}`);
    }
  }
  if (review.approvedForDeployment !== true) reasons.push("review.approvedForDeployment must be true");
  if (review.remediationReviewed !== true) reasons.push("review.remediationReviewed must be true");
  if (review.conclusion === "approved_for_mainnet") {
    warnings.push("mainnet approval still requires a fresh mainnet deployment manifest and human external-action approval");
  }
}

function validateFindings(reasons, warnings, findings) {
  const open = Array.isArray(findings.open) ? findings.open : [];
  const resolved = Array.isArray(findings.resolved) ? findings.resolved : [];

  if (!Array.isArray(findings.open)) reasons.push("findings.open must be an array");
  if (!Array.isArray(findings.resolved)) reasons.push("findings.resolved must be an array");

  for (const item of [...open, ...resolved]) {
    validateFindingShape(reasons, item);
  }
  for (const item of open) {
    if (BLOCKING_FINDING_SEVERITIES.includes(String(item.severity || ""))) {
      reasons.push(`Open ${item.severity} finding ${item.id || "unknown"} blocks deployment`);
    } else if (String(item.severity || "") === "low") {
      warnings.push(`Open low finding ${item.id || "unknown"} remains for deployment approver review`);
    }
  }
  for (const item of resolved) {
    if (BLOCKING_FINDING_SEVERITIES.includes(String(item.severity || "")) && !String(item.remediationRef || "").trim()) {
      reasons.push(`Resolved ${item.severity} finding ${item.id || "unknown"} must include remediationRef`);
    }
  }

  return {
    summary: {
      openCount: open.length,
      resolvedCount: resolved.length,
      openBlockingCount: open.filter((item) => BLOCKING_FINDING_SEVERITIES.includes(String(item.severity || ""))).length,
      byOpenSeverity: countBySeverity(open),
      byResolvedSeverity: countBySeverity(resolved)
    }
  };
}

function validateFindingShape(reasons, item = {}) {
  requireText(reasons, item.id, "finding.id");
  requireKnown(reasons, item.severity, FINDING_SEVERITIES, "finding.severity");
  requireText(reasons, item.title, "finding.title");
}

function validateProof(reasons, proof) {
  requireKnown(reasons, proof.type, INDEPENDENT_CONTRACT_REVIEW_PROOF_TYPES, "proof.type");
  requireText(reasons, proof.ref, "proof.ref");
  requireText(reasons, proof.capturedAt, "proof.capturedAt");
  if (proof.capturedAt && !isValidDate(proof.capturedAt)) reasons.push("proof.capturedAt must be a valid date");
  if (proof.redacted !== true) reasons.push("proof.redacted must be true");
}

function validateSafety(reasons, safety) {
  for (const flag of [
    "noPrivateKeys",
    "noCustodyOrEscrow",
    "noTokenPitch",
    "noMarketManipulation",
    "noDeploymentExecution",
    "noFundsMoved",
    "noReviewerCustody"
  ]) {
    if (safety[flag] !== true) reasons.push(`safety.${flag} must be true`);
  }
}

function textForSensitiveScan(evidence) {
  const reviewer = isPlainObject(evidence.reviewer) ? evidence.reviewer : {};
  const contract = isPlainObject(evidence.contract) ? evidence.contract : {};
  const review = isPlainObject(evidence.review) ? evidence.review : {};
  const proof = isPlainObject(evidence.proof) ? evidence.proof : {};
  return [
    evidence.evidenceId,
    evidence.deploymentManifestRef,
    evidence.deploymentManifestPath,
    reviewer.name,
    reviewer.organization,
    reviewer.contactRef,
    reviewer.conflictDisclosure,
    contract.name,
    contract.path,
    contract.commitRef,
    review.reportRef,
    review.summary,
    proof.ref,
    ...(Array.isArray(evidence.notes) ? evidence.notes : [])
  ]
    .filter(Boolean)
    .join("\n");
}

function reviewedBehaviors(scope) {
  return Array.isArray(scope.reviewedBehaviors)
    ? scope.reviewedBehaviors.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
}

function missingRequiredBehaviors(scope) {
  const covered = new Set(reviewedBehaviors(scope));
  return REQUIRED_CONTRACT_REVIEW_BEHAVIORS.filter((behavior) => !covered.has(behavior));
}

function countBySeverity(findings) {
  return findings.reduce((counts, finding) => {
    const severity = String(finding.severity || "unknown");
    counts[severity] = (counts[severity] || 0) + 1;
    return counts;
  }, {});
}

function requireText(reasons, value, field) {
  if (!String(value || "").trim()) reasons.push(`Missing ${field}`);
}

function requireKnown(reasons, value, allowed, field) {
  if (!allowed.includes(String(value || ""))) reasons.push(`Invalid ${field}`);
}

function requireHexHash(reasons, value, field) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(String(value || ""))) reasons.push(`${field} must be a 32-byte hex hash`);
}

function isValidDate(value) {
  return Number.isFinite(new Date(value).getTime());
}

function sensitiveFlags(text) {
  return SENSITIVE_TEXT_PATTERNS.filter((rule) => rule.pattern.test(String(text || ""))).map((rule) => ({
    id: rule.id,
    reason: rule.reason
  }));
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function unique(items) {
  return [...new Set(items)];
}

function boundary() {
  return {
    deploysContracts: false,
    approvesDeployment: false,
    signsWalletPayloads: false,
    startsPilotTraffic: false,
    movesFunds: false,
    storesSecrets: false,
    marksTokenReady: false,
    requiresHumanDeploymentApproval: true
  };
}
