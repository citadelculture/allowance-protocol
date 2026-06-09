import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

export const EVIDENCE_BUNDLE_PURPOSES = [
  "launch_claim",
  "pilot_evidence",
  "merchant_promotion",
  "deployment",
  "registry_transaction",
  "signing_ceremony",
  "interview_evidence",
  "external_action"
];

export const EVIDENCE_ARTIFACT_TYPES = [
  "approved_disclosure_packet",
  "deployment_check_evidence",
  "deployment_manifest",
  "external_action_approval",
  "independent_contract_review_evidence",
  "interview_evidence",
  "merchant_intake",
  "merchant_promotion_packet",
  "merchant_profile",
  "metrics_report",
  "outreach_execution_evidence",
  "pilot_report",
  "raw_receipt_log",
  "redacted_receipt_log",
  "registry_transaction_evidence",
  "signed_policy",
  "signing_packet",
  "test_report"
];

export const EVIDENCE_VISIBILITIES = ["private", "redacted", "public"];

const PRIVATE_ONLY_TYPES = new Set(["raw_receipt_log", "signed_policy", "interview_evidence", "merchant_intake", "outreach_execution_evidence"]);
const PUBLIC_ALLOWED_TYPES = new Set([
  "approved_disclosure_packet",
  "deployment_check_evidence",
  "deployment_manifest",
  "external_action_approval",
  "independent_contract_review_evidence",
  "merchant_promotion_packet",
  "merchant_profile",
  "metrics_report",
  "pilot_report",
  "redacted_receipt_log",
  "registry_transaction_evidence",
  "signing_packet",
  "test_report"
]);

const SENSITIVE_PATTERNS = [
  { id: "private_key", pattern: /\b0x[0-9a-fA-F]{64}\b/, reason: "Artifact text must not include private keys or seed-like hex values" },
  { id: "seed_phrase", pattern: /\b(?:seed phrase|mnemonic|recovery phrase)\b/i, reason: "Artifact text must not include wallet seed or recovery phrase material" },
  { id: "bearer_token", pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b/i, reason: "Artifact text must not include bearer tokens" },
  { id: "api_key", pattern: /\b(api[_-]?key|secret|password)\s*[:=]\s*\S+/i, reason: "Artifact text must not include API keys, secrets, or passwords" },
  { id: "email", pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i, reason: "Public or redacted artifact text must not include raw email addresses" },
  { id: "phone", pattern: /\b(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})\b/, reason: "Public or redacted artifact text must not include raw phone numbers" }
];

export async function buildEvidenceBundleReport(root, manifest = {}, options = {}) {
  const reasons = [];
  const warnings = [];

  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    return {
      valid: false,
      reasons: ["Evidence bundle manifest must be a JSON object"],
      warnings: [],
      artifacts: [],
      evidenceBoundary: boundary()
    };
  }

  requireText(reasons, manifest.bundleId, "bundleId");
  requireKnown(reasons, manifest.purpose, EVIDENCE_BUNDLE_PURPOSES, "purpose");
  requireText(reasons, manifest.generatedAt, "generatedAt");
  requireText(reasons, manifest.owner, "owner");
  requireText(reasons, manifest.approvalRef, "approvalRef");
  if (manifest.generatedAt && !isValidDate(manifest.generatedAt)) reasons.push("generatedAt must be a valid date");
  if (manifest.rawFileContents || manifest.files || manifest.secrets) {
    reasons.push("Evidence bundle manifest must not embed raw files or secrets");
  }
  if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length === 0) {
    reasons.push("artifacts must be a non-empty array");
  }

  const artifactReports = [];
  const ids = new Set();
  for (const [index, artifact] of (manifest.artifacts || []).entries()) {
    const report = await validateArtifact(root, artifact, index, options);
    if (ids.has(report.id)) report.reasons.push(`Duplicate artifact id: ${report.id}`);
    if (report.id) ids.add(report.id);
    artifactReports.push(report);
    reasons.push(...report.reasons.map((reason) => `${report.id || `artifact[${index}]`}: ${reason}`));
    warnings.push(...report.warnings.map((warning) => `${report.id || `artifact[${index}]`}: ${warning}`));
  }

  const typeSet = new Set(artifactReports.map((artifact) => artifact.type).filter(Boolean));
  const purposeReasons = validatePurposeRequirements(manifest.purpose, typeSet);
  reasons.push(...purposeReasons);

  return {
    valid: reasons.length === 0,
    bundleId: manifest.bundleId || null,
    purpose: manifest.purpose || null,
    generatedAt: manifest.generatedAt || null,
    owner: manifest.owner || null,
    approvalRef: manifest.approvalRef || null,
    artifactCount: artifactReports.length,
    artifacts: artifactReports,
    manifestHash: stableSha256(JSON.stringify(canonicalBundle(manifest, artifactReports))),
    reasons: unique(reasons),
    warnings: unique(warnings),
    evidenceBoundary: boundary()
  };
}

async function validateArtifact(root, artifact = {}, index = 0, options = {}) {
  const reasons = [];
  const warnings = [];
  const id = String(artifact?.id || "").trim();
  const type = String(artifact?.type || "").trim();
  const visibility = String(artifact?.visibility || "").trim();
  const declaredSha256 = normalizeSha256(artifact?.sha256);
  const path = String(artifact?.path || "").trim();
  const absolutePath = safeResolve(root, path);
  let actualSha256 = null;
  let sizeBytes = null;
  let redactionFlags = [];

  requireText(reasons, id, "id");
  requireKnown(reasons, type, EVIDENCE_ARTIFACT_TYPES, "type");
  requireKnown(reasons, visibility, EVIDENCE_VISIBILITIES, "visibility");
  requireText(reasons, path, "path");
  requireSha256(reasons, artifact?.sha256, "sha256");
  requireText(reasons, artifact?.sourceRef, "sourceRef");

  if (path && isAbsolute(path)) reasons.push("path must be relative to the project root");
  if (!absolutePath) {
    reasons.push("path must stay inside the project root");
  }

  if (type && visibility) {
    if (PRIVATE_ONLY_TYPES.has(type) && visibility === "public") {
      reasons.push(`${type} artifacts must not be marked public`);
    }
    if (visibility === "public" && !PUBLIC_ALLOWED_TYPES.has(type)) {
      reasons.push(`${type} artifacts are not approved for public bundle visibility`);
    }
  }

  if (visibility !== "private" && artifact?.redacted !== true) {
    reasons.push("public or redacted artifacts must set redacted=true");
  }
  if (visibility === "public" && artifact?.ownerApprovedForPublicUse !== true) {
    reasons.push("public artifacts must set ownerApprovedForPublicUse=true");
  }

  if (absolutePath) {
    try {
      const bytes = await readFile(absolutePath);
      actualSha256 = sha256Bytes(bytes);
      sizeBytes = bytes.length;
      if (declaredSha256 && actualSha256 !== declaredSha256) {
        reasons.push("sha256 does not match file contents");
      }
      if (shouldScanArtifact(visibility, type, options)) {
        const text = textForSensitiveScan(bytes.toString("utf8"), type);
        redactionFlags = sensitiveFlags(text, visibility);
        reasons.push(...redactionFlags.map((flag) => flag.reason));
      }
    } catch (error) {
      reasons.push(`File could not be read: ${error.message}`);
    }
  }

  if (visibility === "private" && type === "raw_receipt_log") {
    warnings.push("Raw receipt log should stay private; cite an approved disclosure packet publicly");
  }

  return {
    index,
    id: id || null,
    type: type || null,
    visibility: visibility || null,
    path: path || null,
    sourceRef: artifact?.sourceRef || null,
    sha256: declaredSha256,
    actualSha256,
    sizeBytes,
    redactionFlags,
    reasons,
    warnings
  };
}

function validatePurposeRequirements(purpose, typeSet) {
  const reasons = [];
  const needs = {
    launch_claim: ["approved_disclosure_packet", "external_action_approval"],
    pilot_evidence: ["pilot_report", "approved_disclosure_packet"],
    merchant_promotion: ["merchant_promotion_packet", "approved_disclosure_packet"],
    deployment: ["deployment_manifest", "deployment_check_evidence", "independent_contract_review_evidence", "test_report", "external_action_approval"],
    registry_transaction: ["registry_transaction_evidence", "external_action_approval"],
    signing_ceremony: ["signing_packet", "external_action_approval"],
    interview_evidence: ["interview_evidence", "merchant_intake"],
    external_action: ["external_action_approval"]
  };

  for (const type of needs[purpose] || []) {
    if (!typeSet.has(type)) reasons.push(`purpose ${purpose} requires artifact type ${type}`);
  }

  return reasons;
}

function textForSensitiveScan(text, type) {
  if (["deployment_check_evidence", "independent_contract_review_evidence", "deployment_manifest"].includes(type)) {
    return maskPublicHashFields(text, [
      "sourceSha256",
      "artifactSha256",
      "reportSha256",
      "actualSha256",
      "expectedSha256",
      "manifestHash"
    ]);
  }
  if (type !== "registry_transaction_evidence") return text;
  return maskPublicHashFields(text, [
    "txHash",
    "transactionHash",
    "blockHash",
    "writeIntentHash",
    "expectedPolicyId",
    "policyId",
    "expectedReceiptId",
    "receiptId",
    "merchantId",
    "calldataHash",
    "intentHash",
    "intentNonce",
    "metadataHash"
  ]);
}

function maskPublicHashFields(text, fields) {
  let safeText = text;
  for (const field of fields) {
    const pattern = new RegExp(`("${field}"\\s*:\\s*")0x[0-9a-fA-F]{64}(")`, "g");
    safeText = safeText.replace(pattern, `$1<public-chain-hash>$2`);
    const plainPattern = new RegExp(`("${field}"\\s*:\\s*")[0-9a-fA-F]{64}(")`, "g");
    safeText = safeText.replace(plainPattern, `$1<public-hash>$2`);
  }
  return safeText;
}

function safeResolve(root, path) {
  if (!root || !path) return null;
  if (isAbsolute(path)) return null;
  const absoluteRoot = resolve(root);
  const absolutePath = resolve(absoluteRoot, path);
  const rel = relative(absoluteRoot, absolutePath);
  if (rel.startsWith("..") || isAbsolute(rel)) return null;
  return absolutePath;
}

function requireText(reasons, value, field) {
  if (!String(value || "").trim()) reasons.push(`Missing ${field}`);
}

function requireKnown(reasons, value, allowed, field) {
  if (!allowed.includes(String(value || ""))) reasons.push(`Invalid ${field}`);
}

function requireSha256(reasons, value, field) {
  if (!normalizeSha256(value)) reasons.push(`${field} must be a 32-byte SHA-256 hex digest`);
}

function normalizeSha256(value) {
  const text = String(value || "").trim().toLowerCase();
  const stripped = text.startsWith("0x") ? text.slice(2) : text;
  return /^[0-9a-f]{64}$/.test(stripped) ? stripped : null;
}

function shouldScanArtifact(visibility, type, options) {
  if (options.scanPrivate === true) return true;
  if (visibility === "public" || visibility === "redacted") return true;
  return type === "approved_disclosure_packet" || type === "external_action_approval";
}

function sensitiveFlags(text = "", visibility = "") {
  const flags = [];
  for (const item of SENSITIVE_PATTERNS) {
    if (item.pattern.test(text)) {
      flags.push({
        id: item.id,
        reason: visibility === "private" ? `Private artifact warning: ${item.reason}` : item.reason
      });
    }
  }
  return flags;
}

function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function stableSha256(text) {
  return sha256Bytes(Buffer.from(text, "utf8"));
}

function canonicalBundle(manifest, artifactReports) {
  return {
    bundleId: manifest.bundleId || "",
    purpose: manifest.purpose || "",
    generatedAt: manifest.generatedAt || "",
    owner: manifest.owner || "",
    approvalRef: manifest.approvalRef || "",
    artifacts: artifactReports.map((artifact) => ({
      id: artifact.id,
      type: artifact.type,
      visibility: artifact.visibility,
      path: artifact.path,
      sha256: artifact.actualSha256 || artifact.sha256,
      sourceRef: artifact.sourceRef
    }))
  };
}

function isValidDate(value) {
  return Number.isFinite(new Date(value).getTime());
}

function unique(values) {
  return [...new Set(values)];
}

function boundary() {
  return {
    copiesEvidence: false,
    publishesEvidence: false,
    mutatesArtifacts: false,
    storesSecrets: false,
    verifiesHashesOnly: true
  };
}
