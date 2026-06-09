import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

export const DEPLOYMENT_CHECK_EVIDENCE_STATUSES = ["draft", "passed", "approved", "failed"];
export const DEPLOYMENT_CHECK_STATUSES = ["missing", "pending", "passed", "approved", "failed"];

const SENSITIVE_TEXT_PATTERNS = [
  { id: "private_key", pattern: /\b0x[0-9a-fA-F]{64}\b/, reason: "Deployment check evidence must not include private keys or seed-like hex values" },
  { id: "seed_phrase", pattern: /\b(?:seed phrase|mnemonic|recovery phrase)\b/i, reason: "Deployment check evidence must not include wallet seed or recovery phrase material" },
  { id: "bearer_token", pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b/i, reason: "Deployment check evidence must not include bearer tokens" },
  { id: "api_key", pattern: /\b(api[_-]?key|secret|password)\s*[:=]\s*\S+/i, reason: "Deployment check evidence must not include API keys, secrets, or passwords" },
  { id: "signed_transaction", pattern: /\bsigned transaction\b|\braw transaction\b/i, reason: "Deployment check evidence must not include signed or raw transactions" }
];

export async function buildDeploymentCheckEvidenceReport(evidence = {}, options = {}) {
  const reasons = [...(options.sourceErrors || [])];
  const warnings = [];

  if (!isPlainObject(evidence)) {
    return {
      valid: false,
      reasons: ["Deployment check evidence must be a JSON object"],
      warnings: [],
      sourceCheck: null,
      deploymentManifestBinding: null,
      artifactChecks: [],
      redactionFlags: [],
      evidenceBoundary: boundary()
    };
  }

  const contract = isPlainObject(evidence.contract) ? evidence.contract : {};
  const checks = isPlainObject(evidence.checks) ? evidence.checks : {};
  const safety = isPlainObject(evidence.safety) ? evidence.safety : {};
  const deploymentManifest = options.deploymentManifest || evidence.deploymentManifest || null;

  requireText(reasons, evidence.evidenceId, "evidenceId");
  requireKnown(reasons, evidence.status, DEPLOYMENT_CHECK_EVIDENCE_STATUSES, "status");
  if (!["passed", "approved"].includes(String(evidence.status || ""))) {
    reasons.push("status must be passed or approved after compiler and static-analysis evidence is complete");
  }
  requireText(reasons, evidence.generatedAt, "generatedAt");
  if (evidence.generatedAt && !isValidDate(evidence.generatedAt)) reasons.push("generatedAt must be a valid date");
  requireText(reasons, evidence.deploymentManifestRef || evidence.deploymentManifestPath, "deploymentManifestRef");

  validateContract(reasons, contract);
  const sourceCheck = await contractSourceHashCheck(contract, options);
  reasons.push(...sourceCheck.reasons);
  warnings.push(...sourceCheck.warnings);

  const npmTest = validateBasicCheck(reasons, checks.npmTest, "checks.npmTest");
  const contractReview = validateBasicCheck(reasons, checks.contractReview, "checks.contractReview");
  const compiler = await validateCompilerCheck(reasons, warnings, checks.compiler, contract, options);
  const staticAnalysis = await validateStaticAnalysisCheck(reasons, warnings, checks.staticAnalysis, contract, options);
  const artifactChecks = [compiler.artifactCheck, staticAnalysis.artifactCheck].filter(Boolean);

  const deploymentManifestBinding = validateDeploymentManifestBinding({
    contract,
    checks: {
      npmTest,
      contractReview,
      compiler: compiler.summary,
      staticAnalysis: staticAnalysis.summary
    },
    deploymentManifest
  });
  reasons.push(...deploymentManifestBinding.reasons);
  warnings.push(...deploymentManifestBinding.warnings);
  validateSafety(reasons, safety);

  const redactionFlags = sensitiveFlags(textForSensitiveScan(evidence));
  reasons.push(...redactionFlags.map((flag) => flag.reason));

  return {
    valid: reasons.length === 0,
    status: reasons.length === 0 ? "verified_deployment_check_evidence" : "needs_deployment_check_evidence",
    evidenceId: evidence.evidenceId || null,
    generatedAt: evidence.generatedAt || null,
    deploymentManifestRef: evidence.deploymentManifestRef || evidence.deploymentManifestPath || null,
    contract: {
      name: contract.name || null,
      path: contract.path || null,
      sourceSha256: normalizedHexSha256(contract.sourceSha256),
      commitRef: contract.commitRef || null
    },
    checks: {
      npmTest,
      contractReview,
      compiler: compiler.summary,
      staticAnalysis: staticAnalysis.summary
    },
    sourceCheck,
    deploymentManifestBinding,
    artifactChecks,
    redactionFlags,
    reasons: unique(reasons),
    warnings: unique(warnings),
    nextAction:
      reasons.length === 0
        ? "Copy compiler and static-analysis refs into the deployment manifest, then run validate-deployment before any deployment approval"
        : "Attach passed npm test, contract review, compiler artifact, static-analysis report, matching source hash, and safety flags",
    evidenceBoundary: boundary()
  };
}

function validateContract(reasons, contract) {
  requireText(reasons, contract.name, "contract.name");
  if (contract.name && contract.name !== "AllowanceRegistry") reasons.push("contract.name must be AllowanceRegistry");
  requireText(reasons, contract.path, "contract.path");
  requireSha256(reasons, contract.sourceSha256, "contract.sourceSha256");
  requireText(reasons, contract.commitRef, "contract.commitRef");
}

function validateBasicCheck(reasons, check = {}, field) {
  requireKnown(reasons, check?.status, DEPLOYMENT_CHECK_STATUSES, `${field}.status`);
  requirePassed(reasons, check, field);
  requireText(reasons, check?.command, `${field}.command`);
  requireText(reasons, check?.reportRef, `${field}.reportRef`);
  requireText(reasons, check?.completedAt, `${field}.completedAt`);
  if (check?.completedAt && !isValidDate(check.completedAt)) reasons.push(`${field}.completedAt must be a valid date`);

  return {
    status: check?.status || null,
    command: check?.command || null,
    reportRef: check?.reportRef || null,
    completedAt: check?.completedAt || null
  };
}

async function validateCompilerCheck(reasons, warnings, check = {}, contract, options) {
  requireKnown(reasons, check?.status, DEPLOYMENT_CHECK_STATUSES, "checks.compiler.status");
  requirePassed(reasons, check, "checks.compiler");
  requireText(reasons, check?.tool, "checks.compiler.tool");
  requireText(reasons, check?.version, "checks.compiler.version");
  requireText(reasons, check?.command, "checks.compiler.command");
  requireText(reasons, check?.artifactRef, "checks.compiler.artifactRef");
  requireSha256(reasons, check?.artifactSha256, "checks.compiler.artifactSha256");
  requireSha256(reasons, check?.sourceSha256, "checks.compiler.sourceSha256");
  requireText(reasons, check?.completedAt, "checks.compiler.completedAt");
  if (check?.completedAt && !isValidDate(check.completedAt)) reasons.push("checks.compiler.completedAt must be a valid date");
  if (check?.sourceSha256 && contract.sourceSha256 && normalizedHexSha256(check.sourceSha256) !== normalizedHexSha256(contract.sourceSha256)) {
    reasons.push("checks.compiler.sourceSha256 must match contract.sourceSha256");
  }

  const artifactCheck = await validateArtifactRef({
    root: options.root,
    path: check?.artifactRef,
    sha256: check?.artifactSha256,
    field: "checks.compiler.artifactRef",
    label: "compiler_artifact"
  });
  reasons.push(...artifactCheck.reasons);
  warnings.push(...artifactCheck.warnings);

  return {
    summary: {
      status: check?.status || null,
      tool: check?.tool || null,
      version: check?.version || null,
      command: check?.command || null,
      artifactRef: check?.artifactRef || null,
      artifactSha256: normalizedPlainSha256(check?.artifactSha256),
      sourceSha256: normalizedHexSha256(check?.sourceSha256),
      completedAt: check?.completedAt || null
    },
    artifactCheck
  };
}

async function validateStaticAnalysisCheck(reasons, warnings, check = {}, contract, options) {
  requireKnown(reasons, check?.status, DEPLOYMENT_CHECK_STATUSES, "checks.staticAnalysis.status");
  requirePassed(reasons, check, "checks.staticAnalysis");
  requireText(reasons, check?.tool, "checks.staticAnalysis.tool");
  requireText(reasons, check?.version, "checks.staticAnalysis.version");
  requireText(reasons, check?.command, "checks.staticAnalysis.command");
  requireText(reasons, check?.reportRef, "checks.staticAnalysis.reportRef");
  requireSha256(reasons, check?.reportSha256, "checks.staticAnalysis.reportSha256");
  requireSha256(reasons, check?.sourceSha256, "checks.staticAnalysis.sourceSha256");
  requireText(reasons, check?.completedAt, "checks.staticAnalysis.completedAt");
  if (check?.completedAt && !isValidDate(check.completedAt)) reasons.push("checks.staticAnalysis.completedAt must be a valid date");
  if (check?.sourceSha256 && contract.sourceSha256 && normalizedHexSha256(check.sourceSha256) !== normalizedHexSha256(contract.sourceSha256)) {
    reasons.push("checks.staticAnalysis.sourceSha256 must match contract.sourceSha256");
  }

  const findings = check?.findings || {};
  for (const field of ["openCritical", "openHigh", "openMedium", "openLow"]) {
    requireNonNegativeInteger(reasons, findings[field], `checks.staticAnalysis.findings.${field}`);
  }
  if (Number(findings.openCritical || 0) > 0) reasons.push("checks.staticAnalysis.findings.openCritical must be 0");
  if (Number(findings.openHigh || 0) > 0) reasons.push("checks.staticAnalysis.findings.openHigh must be 0");
  if (Number(findings.openMedium || 0) > 0) reasons.push("checks.staticAnalysis.findings.openMedium must be 0");
  if (Number(findings.openLow || 0) > 0) warnings.push("Open low static-analysis findings remain for deployment approver review");

  const artifactCheck = await validateArtifactRef({
    root: options.root,
    path: check?.reportRef,
    sha256: check?.reportSha256,
    field: "checks.staticAnalysis.reportRef",
    label: "static_analysis_report"
  });
  reasons.push(...artifactCheck.reasons);
  warnings.push(...artifactCheck.warnings);

  return {
    summary: {
      status: check?.status || null,
      tool: check?.tool || null,
      version: check?.version || null,
      command: check?.command || null,
      reportRef: check?.reportRef || null,
      reportSha256: normalizedPlainSha256(check?.reportSha256),
      sourceSha256: normalizedHexSha256(check?.sourceSha256),
      completedAt: check?.completedAt || null,
      findings: {
        openCritical: Number(findings.openCritical || 0),
        openHigh: Number(findings.openHigh || 0),
        openMedium: Number(findings.openMedium || 0),
        openLow: Number(findings.openLow || 0)
      }
    },
    artifactCheck
  };
}

async function contractSourceHashCheck(contract, options) {
  const reasons = [];
  const warnings = [];
  const expected = normalizedHexSha256(contract.sourceSha256);

  if (!options.root) {
    return {
      valid: false,
      skipped: true,
      reasons: ["options.root is required to recompute contract.sourceSha256"],
      warnings,
      actualSha256: null,
      expectedSha256: expected
    };
  }
  if (!contract.path || !expected) {
    return {
      valid: false,
      skipped: false,
      reasons,
      warnings,
      actualSha256: null,
      expectedSha256: expected
    };
  }

  try {
    const absolutePath = safeResolve(options.root, contract.path);
    if (!absolutePath) {
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
      reasons: [`Unable to hash deployment check contract source: ${error.message}`],
      warnings,
      actualSha256: null,
      expectedSha256: expected
    };
  }
}

async function validateArtifactRef({ root, path, sha256, field, label }) {
  const reasons = [];
  const warnings = [];
  const expected = normalizedPlainSha256(sha256);
  let actualSha256 = null;
  let sizeBytes = null;

  if (!root) reasons.push("options.root is required to validate deployment check artifacts");
  if (!path) return { label, path: null, expectedSha256: expected, actualSha256, sizeBytes, valid: false, reasons, warnings };
  if (path && isAbsolute(path)) reasons.push(`${field} must be relative to the project root`);
  if (!expected) return { label, path, expectedSha256: expected, actualSha256, sizeBytes, valid: false, reasons, warnings };

  const absolutePath = root ? safeResolve(root, path) : null;
  if (!absolutePath) {
    reasons.push(`${field} must stay inside the project root`);
    return { label, path, expectedSha256: expected, actualSha256, sizeBytes, valid: false, reasons, warnings };
  }

  try {
    const bytes = await readFile(absolutePath);
    actualSha256 = createHash("sha256").update(bytes).digest("hex");
    sizeBytes = bytes.length;
    if (actualSha256 !== expected) reasons.push(`${field} sha256 does not match file contents`);
  } catch (error) {
    reasons.push(`${field} could not be read: ${error.message}`);
  }

  return {
    label,
    path,
    expectedSha256: expected,
    actualSha256,
    sizeBytes,
    valid: reasons.length === 0,
    reasons,
    warnings
  };
}

function validateDeploymentManifestBinding({ contract, checks, deploymentManifest }) {
  const reasons = [];
  const warnings = [];
  const manifestContract = deploymentManifest?.contract || {};
  const manifestChecks = deploymentManifest?.checks || {};

  if (!deploymentManifest) {
    warnings.push("deployment manifest was not loaded; only deploymentManifestRef was checked");
    return {
      valid: false,
      checked: false,
      reasons,
      warnings,
      manifestId: null
    };
  }

  if (manifestContract.name && contract.name && manifestContract.name !== contract.name) {
    reasons.push("deploymentManifest.contract.name must match deployment check contract.name");
  }
  if (manifestContract.path && contract.path && manifestContract.path !== contract.path) {
    reasons.push("deploymentManifest.contract.path must match deployment check contract.path");
  }
  if (
    manifestContract.sourceSha256 &&
    contract.sourceSha256 &&
    normalizedHexSha256(manifestContract.sourceSha256) !== normalizedHexSha256(contract.sourceSha256)
  ) {
    reasons.push("deploymentManifest.contract.sourceSha256 must match deployment check contract.sourceSha256");
  }

  if (manifestChecks.npmTest?.reportRef && checks.npmTest.reportRef && manifestChecks.npmTest.reportRef !== checks.npmTest.reportRef) {
    reasons.push("deploymentManifest.checks.npmTest.reportRef must match deployment check evidence");
  }
  if (
    manifestChecks.contractReview?.reportRef &&
    checks.contractReview.reportRef &&
    manifestChecks.contractReview.reportRef !== checks.contractReview.reportRef
  ) {
    reasons.push("deploymentManifest.checks.contractReview.reportRef must match deployment check evidence");
  }
  if (manifestChecks.compiler?.tool && checks.compiler.tool && manifestChecks.compiler.tool !== checks.compiler.tool) {
    reasons.push("deploymentManifest.checks.compiler.tool must match deployment check evidence");
  }
  if (manifestChecks.compiler?.version && checks.compiler.version && manifestChecks.compiler.version !== checks.compiler.version) {
    reasons.push("deploymentManifest.checks.compiler.version must match deployment check evidence");
  }
  if (manifestChecks.compiler?.artifactRef && checks.compiler.artifactRef && manifestChecks.compiler.artifactRef !== checks.compiler.artifactRef) {
    reasons.push("deploymentManifest.checks.compiler.artifactRef must match deployment check evidence");
  }
  if (manifestChecks.staticAnalysis?.tool && checks.staticAnalysis.tool && manifestChecks.staticAnalysis.tool !== checks.staticAnalysis.tool) {
    reasons.push("deploymentManifest.checks.staticAnalysis.tool must match deployment check evidence");
  }
  if (
    manifestChecks.staticAnalysis?.reportRef &&
    checks.staticAnalysis.reportRef &&
    manifestChecks.staticAnalysis.reportRef !== checks.staticAnalysis.reportRef
  ) {
    reasons.push("deploymentManifest.checks.staticAnalysis.reportRef must match deployment check evidence");
  }

  return {
    valid: reasons.length === 0,
    checked: true,
    reasons,
    warnings,
    manifestId: deploymentManifest.manifestId || null,
    checks: {
      npmTest: manifestChecks.npmTest || null,
      contractReview: manifestChecks.contractReview || null,
      compiler: manifestChecks.compiler || null,
      staticAnalysis: manifestChecks.staticAnalysis || null
    }
  };
}

function validateSafety(reasons, safety) {
  for (const flag of [
    "noPrivateKeys",
    "noWalletSigning",
    "noDeploymentExecution",
    "noFundsMoved",
    "noTokenChanges",
    "noCustodyOrEscrow",
    "artifactsDoNotContainSecrets"
  ]) {
    if (safety[flag] !== true) reasons.push(`safety.${flag} must be true`);
  }
}

function textForSensitiveScan(evidence) {
  const contract = isPlainObject(evidence.contract) ? evidence.contract : {};
  const checks = isPlainObject(evidence.checks) ? evidence.checks : {};
  const values = [
    evidence.evidenceId,
    evidence.deploymentManifestRef,
    evidence.deploymentManifestPath,
    contract.name,
    contract.path,
    contract.commitRef,
    ...Object.values(checks).flatMap((check) =>
      isPlainObject(check)
        ? [check.command, check.reportRef, check.artifactRef, check.tool, check.version, check.completedAt]
        : []
    ),
    ...(Array.isArray(evidence.notes) ? evidence.notes : [])
  ];
  return values.filter(Boolean).join("\n");
}

function requirePassed(reasons, check = {}, field) {
  if (!check || !["passed", "approved"].includes(String(check.status || ""))) {
    reasons.push(`${field}.status must be passed or approved`);
  }
}

function requireText(reasons, value, field) {
  if (!String(value || "").trim()) reasons.push(`Missing ${field}`);
}

function requireKnown(reasons, value, allowed, field) {
  if (!allowed.includes(String(value || ""))) reasons.push(`Invalid ${field}`);
}

function requireSha256(reasons, value, field) {
  if (!normalizedPlainSha256(value)) reasons.push(`${field} must be a SHA-256 hex digest`);
}

function requireNonNegativeInteger(reasons, value, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) reasons.push(`${field} must be a non-negative integer`);
}

function normalizedPlainSha256(value) {
  const text = String(value || "").trim().toLowerCase().replace(/^0x/, "");
  return /^[0-9a-f]{64}$/.test(text) ? text : null;
}

function normalizedHexSha256(value) {
  const plain = normalizedPlainSha256(value);
  return plain ? `0x${plain}` : null;
}

function isValidDate(value) {
  return Number.isFinite(new Date(value).getTime());
}

function safeResolve(root, path) {
  if (!root || !path || isAbsolute(path)) return null;
  const absoluteRoot = resolve(root);
  const absolutePath = resolve(absoluteRoot, path);
  const rel = relative(absoluteRoot, absolutePath);
  if (rel.startsWith("..") || isAbsolute(rel)) return null;
  return absolutePath;
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
    compilesContracts: false,
    runsStaticAnalysis: false,
    deploysContracts: false,
    approvesDeployment: false,
    signsWalletPayloads: false,
    movesFunds: false,
    storesSecrets: false,
    marksTokenReady: false,
    requiresHumanDeploymentApproval: true
  };
}
