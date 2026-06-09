import { buildExternalActionApprovalReport } from "./externalActionApproval.mjs";
import { verifyProductionPolicy } from "./policyAudit.mjs";
import { buildSigningCeremonyAudit } from "./signingCeremony.mjs";

export const CONTROLLER_SIGNING_EXECUTION_STATUSES = ["signed_policy_stored"];
export const CONTROLLER_SIGNING_PROOF_TYPES = ["wallet_signature", "ceremony_audit", "secret_store_receipt", "manual_log"];
export const CONTROLLER_SIGNING_STORAGE_TYPES = ["gitignored_local", "secret_store", "external_secret_manager", "deployment_env"];
export const CONTROLLER_SIGNING_METHODS = ["wallet_ui", "hardware_wallet", "safe", "walletconnect", "local_dev_cli"];

const SENSITIVE_TEXT_PATTERNS = [
  { id: "private_key", pattern: /\b0x[0-9a-fA-F]{64}\b/, reason: "Controller signing evidence must not include private keys or seed-like hex values" },
  { id: "seed_phrase", pattern: /\b(?:seed phrase|mnemonic|recovery phrase)\b/i, reason: "Controller signing evidence must not include wallet seed or recovery phrase material" },
  { id: "bearer_token", pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b/i, reason: "Controller signing evidence must not include bearer tokens" },
  { id: "api_key", pattern: /\b(api[_-]?key|secret|password)\s*[:=]\s*\S+/i, reason: "Controller signing evidence must not include API keys, secrets, or passwords" }
];

export async function buildControllerSigningExecutionEvidenceReport(evidence = {}, options = {}) {
  const reasons = [];
  const warnings = [];

  if (!isPlainObject(evidence)) {
    return {
      valid: false,
      reasons: ["Controller signing execution evidence must be a JSON object"],
      warnings: [],
      approvalReport: null,
      policyAudit: null,
      ceremonyAudit: null,
      redactionFlags: [],
      evidenceBoundary: boundary()
    };
  }

  const approvalPacket = evidence.approvalPacket || evidence.approval?.packet || null;
  const signedPolicy = evidence.signedPolicy || evidence.policy || evidence.signed?.policy || null;
  const signing = isPlainObject(evidence.signing) ? evidence.signing : {};
  const storage = isPlainObject(evidence.storage) ? evidence.storage : {};
  const proof = isPlainObject(evidence.proof) ? evidence.proof : {};
  const ceremony = isPlainObject(evidence.ceremony) ? evidence.ceremony : {};
  const executionStatus = String(evidence.executionStatus || evidence.status || "").trim();
  let approvalReport = null;
  let policyAudit = null;
  let ceremonyAudit = null;

  requireText(reasons, evidence.evidenceId, "evidenceId");
  requireKnown(reasons, executionStatus, CONTROLLER_SIGNING_EXECUTION_STATUSES, "executionStatus");
  requireText(reasons, evidence.generatedAt, "generatedAt");
  requireText(reasons, evidence.approvalRef, "approvalRef");
  if (evidence.generatedAt && !isValidDate(evidence.generatedAt)) reasons.push("generatedAt must be a valid date");

  if (!isPlainObject(approvalPacket) || Object.keys(approvalPacket).length === 0) {
    reasons.push("approvalPacket must include the final approved controller_policy_signature external-action packet");
  } else {
    approvalReport = await buildExternalActionApprovalReport(approvalPacket, options.approvalOptions || {});
    reasons.push(...approvalReport.reasons.map((reason) => `approvalPacket: ${reason}`));
    warnings.push(...approvalReport.warnings.map((warning) => `approvalPacket: ${warning}`));
    if (approvalPacket.actionType !== "controller_policy_signature") {
      reasons.push("approvalPacket.actionType must be controller_policy_signature");
    }
    if (approvalPacket.status !== "approved") reasons.push("approvalPacket.status must be approved");
    if (!approvalRefMatches(evidence.approvalRef, approvalPacket.approvalId)) {
      reasons.push("approvalRef must reference approvalPacket.approvalId");
    }
  }

  if (!isPlainObject(signedPolicy) || Object.keys(signedPolicy).length === 0) {
    reasons.push("signedPolicy must include the post-signature production policy JSON");
  } else {
    policyAudit = await verifyProductionPolicy(signedPolicy, options.policyOptions || {});
    reasons.push(...policyAudit.reasons.map((reason) => `signedPolicy: ${reason}`));
    warnings.push(...policyAudit.warnings.map((warning) => `signedPolicy: ${warning}`));
    validateSignedPolicyMatchesApproval(reasons, signedPolicy, policyAudit, approvalPacket);

    ceremonyAudit = await buildSigningCeremonyAudit({
      policy: signedPolicy,
      expectedController: expectedControllerFor(approvalPacket, signing),
      env: ceremonyEnv(evidence, storage, ceremony, options),
      policyPath: storage.path || evidence.policyPath || ""
    });
    for (const check of ceremonyAudit.checks || []) {
      if (check.status === "fail") reasons.push(`ceremony: ${check.id}: ${check.message}`);
      if (check.status === "warning") reasons.push(`ceremony: ${check.id}: ${check.message}`);
    }
  }

  validateSigningExecution(reasons, warnings, signing, approvalPacket, policyAudit);
  validateStorage(reasons, warnings, storage);
  validateProof(reasons, proof);

  const redactionFlags = sensitiveFlags(textForSensitiveScan(evidence));
  reasons.push(...redactionFlags.map((flag) => flag.reason));

  return {
    valid: reasons.length === 0,
    status: reasons.length === 0 ? "verified_controller_signing_execution" : "needs_controller_signing_evidence",
    evidenceId: evidence.evidenceId || null,
    executionStatus: executionStatus || null,
    approvalRef: evidence.approvalRef || null,
    policy: {
      policyId: policyAudit?.policyId || signedPolicy?.policyId || null,
      fingerprint: policyAudit?.fingerprint || null,
      controller: policyAudit?.controller || signedPolicy?.controller || null,
      recoveredController: policyAudit?.recoveredController || null,
      signatureMode: policyAudit?.signatureMode || signedPolicy?.signatureMode || null,
      verifierMode: policyAudit?.verifierMode || null
    },
    signing: {
      signedAt: signing.signedAt || null,
      signedBy: signing.signedBy || null,
      walletAddress: signing.walletAddress || null,
      method: signing.method || null,
      humanExecuted: signing.humanExecuted === true,
      walletOwnerApproved: signing.walletOwnerApproved === true,
      automationUsed: signing.automationUsed === true,
      privateKeyMaterialExposed: signing.privateKeyMaterialExposed === true
    },
    storage: {
      type: storage.type || null,
      path: storage.path || null,
      storedAt: storage.storedAt || null,
      storedBy: storage.storedBy || null,
      repoCommitted: storage.repoCommitted === true,
      accessLimited: storage.accessLimited === true
    },
    proof: {
      type: proof.type || null,
      ref: proof.ref || null,
      capturedAt: proof.capturedAt || null,
      redacted: proof.redacted === true
    },
    approvalReport,
    policyAudit,
    ceremonyAudit,
    redactionFlags,
    reasons: unique(reasons),
    warnings: unique(warnings),
    nextAction:
      reasons.length === 0
        ? "Set ALLOW_POLICY_PATH or ALLOW_POLICY_JSON for the production runtime and include this evidence in the signing evidence bundle"
        : "Attach the approved signing packet, signed policy, storage handoff, redacted proof, and passing ceremony env",
    evidenceBoundary: boundary()
  };
}

function validateSignedPolicyMatchesApproval(reasons, signedPolicy, policyAudit, approvalPacket) {
  const payload = approvalPacket?.payload || {};
  const action = approvalPacket?.action || {};
  const expectedController = payload.controller || action.walletAddress || "";

  if (expectedController && signedPolicy.controller && !sameAddress(signedPolicy.controller, expectedController)) {
    reasons.push("signedPolicy.controller must match approved controller wallet");
  }
  if (policyAudit?.fingerprint && payload.policyFingerprint && policyAudit.fingerprint !== payload.policyFingerprint) {
    reasons.push("signedPolicy fingerprint must match approvalPacket.payload.policyFingerprint");
  }
  if (payload.policyId && signedPolicy.policyId && String(payload.policyId) !== String(signedPolicy.policyId)) {
    reasons.push("signedPolicy.policyId must match approvalPacket.payload.policyId");
  }
  if (String(signedPolicy.controllerSignature || "") === "0x") {
    reasons.push("signedPolicy.controllerSignature must contain the wallet signature, not the unsigned placeholder");
  }
  if (String(signedPolicy.controllerSignature || "").includes("<")) {
    reasons.push("signedPolicy.controllerSignature must not contain placeholder text");
  }
}

function validateSigningExecution(reasons, warnings, signing, approvalPacket, policyAudit) {
  requireText(reasons, signing.signedAt, "signing.signedAt");
  requireText(reasons, signing.signedBy, "signing.signedBy");
  requireText(reasons, signing.walletAddress, "signing.walletAddress");
  requireKnown(reasons, signing.method, CONTROLLER_SIGNING_METHODS, "signing.method");
  if (signing.signedAt && !isValidDate(signing.signedAt)) reasons.push("signing.signedAt must be a valid date");
  if (signing.humanExecuted !== true) reasons.push("signing.humanExecuted must be true");
  if (signing.walletOwnerApproved !== true) reasons.push("signing.walletOwnerApproved must be true");
  if (signing.automationUsed !== false) reasons.push("signing.automationUsed must be false");
  if (signing.privateKeyMaterialExposed !== false) reasons.push("signing.privateKeyMaterialExposed must be false");
  if (signing.privateKeyInRuntimeEnv !== false) reasons.push("signing.privateKeyInRuntimeEnv must be false");
  if (signing.method === "local_dev_cli") warnings.push("local_dev_cli signing is acceptable only for local smoke; prefer wallet UI, hardware wallet, or Safe for production");

  const expectedController = expectedControllerFor(approvalPacket, signing);
  if (expectedController && signing.walletAddress && !sameAddress(signing.walletAddress, expectedController)) {
    reasons.push("signing.walletAddress must match approved controller wallet");
  }
  if (policyAudit?.controller && signing.walletAddress && !sameAddress(signing.walletAddress, policyAudit.controller)) {
    reasons.push("signing.walletAddress must match signedPolicy.controller");
  }
  if (signing.policyFingerprint && policyAudit?.fingerprint && signing.policyFingerprint !== policyAudit.fingerprint) {
    reasons.push("signing.policyFingerprint must match signedPolicy fingerprint");
  }
}

function validateStorage(reasons, warnings, storage) {
  requireKnown(reasons, storage.type, CONTROLLER_SIGNING_STORAGE_TYPES, "storage.type");
  requireText(reasons, storage.path, "storage.path");
  requireText(reasons, storage.storedAt, "storage.storedAt");
  requireText(reasons, storage.storedBy, "storage.storedBy");
  if (storage.storedAt && !isValidDate(storage.storedAt)) reasons.push("storage.storedAt must be a valid date");
  if (storage.repoCommitted !== false) reasons.push("storage.repoCommitted must be false");
  if (storage.accessLimited !== true) reasons.push("storage.accessLimited must be true");
  if (storage.noPrivateKeyMaterial !== true) reasons.push("storage.noPrivateKeyMaterial must be true");
  if (storage.runtimeSourceConfigured !== true) reasons.push("storage.runtimeSourceConfigured must be true");
  if (storage.path && storage.path === "allow-policy.example.json") {
    reasons.push("storage.path must not point at the public unsigned example policy");
  }
  if (storage.path && /^ops\//.test(String(storage.path)) && !/\.local\.json$/.test(String(storage.path))) {
    warnings.push("repo-local signed policy paths should use a .local.json name and remain gitignored");
  }
}

function validateProof(reasons, proof) {
  requireKnown(reasons, proof.type, CONTROLLER_SIGNING_PROOF_TYPES, "proof.type");
  requireText(reasons, proof.ref, "proof.ref");
  requireText(reasons, proof.capturedAt, "proof.capturedAt");
  if (proof.capturedAt && !isValidDate(proof.capturedAt)) reasons.push("proof.capturedAt must be a valid date");
  if (proof.redacted !== true) reasons.push("proof.redacted must be true");
}

function expectedControllerFor(approvalPacket, signing) {
  return approvalPacket?.payload?.controller || approvalPacket?.action?.walletAddress || signing?.walletAddress || "";
}

function ceremonyEnv(evidence, storage, ceremony, options) {
  const env = {
    ...(options.env || {}),
    ...(isPlainObject(evidence.runtimeEnv) ? evidence.runtimeEnv : {}),
    ...(isPlainObject(ceremony.env) ? ceremony.env : {})
  };
  if (storage.path && !env.ALLOW_POLICY_PATH && !env.ALLOW_POLICY_JSON) env.ALLOW_POLICY_PATH = storage.path;
  return env;
}

function textForSensitiveScan(evidence) {
  const signing = isPlainObject(evidence.signing) ? evidence.signing : {};
  const storage = isPlainObject(evidence.storage) ? evidence.storage : {};
  const proof = isPlainObject(evidence.proof) ? evidence.proof : {};
  return [
    evidence.evidenceId,
    evidence.approvalRef,
    evidence.policyPath,
    signing.signedBy,
    signing.walletAddress,
    signing.method,
    storage.path,
    storage.storedBy,
    storage.receiptRef,
    proof.ref,
    ...(Array.isArray(evidence.notes) ? evidence.notes : [])
  ]
    .filter(Boolean)
    .join("\n");
}

function sensitiveFlags(text) {
  return SENSITIVE_TEXT_PATTERNS.filter((rule) => rule.pattern.test(String(text || ""))).map((rule) => ({
    id: rule.id,
    reason: rule.reason
  }));
}

function approvalRefMatches(ref, approvalId) {
  const value = String(ref || "").trim();
  const id = String(approvalId || "").trim();
  if (!value || !id) return false;
  return value === id || value === `external-action:${id}` || value === `approval:${id}`;
}

function requireText(reasons, value, field) {
  if (!String(value || "").trim()) reasons.push(`Missing ${field}`);
}

function requireKnown(reasons, value, allowed, field) {
  if (!allowed.includes(String(value || ""))) reasons.push(`Invalid ${field}`);
}

function isValidDate(value) {
  return !Number.isNaN(Date.parse(String(value || "")));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sameAddress(a, b) {
  return String(a || "").toLowerCase() === String(b || "").toLowerCase();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function boundary() {
  return {
    signsWalletPayloads: false,
    signsPolicy: false,
    approvesExternalAction: false,
    storesSecrets: false,
    storesSignedPolicy: false,
    startsRuntime: false,
    movesFunds: false,
    marksProductionPolicyConfigured: false,
    requiresHumanApproval: true,
    finalExternalActionApprovalRequired: true
  };
}
