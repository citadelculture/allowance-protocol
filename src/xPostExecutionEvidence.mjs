import { validateDistributionClaims } from "./distributionClaims.mjs";
import { buildExternalActionApprovalReport } from "./externalActionApproval.mjs";
import { validateXPost } from "./socialLaunch.mjs";

export const X_POST_EXECUTION_STATUSES = ["posted"];
export const X_POST_EXECUTION_PROOF_TYPES = ["post_permalink", "screenshot", "archive_url", "manual_log"];

const SENSITIVE_TEXT_PATTERNS = [
  { id: "private_key", pattern: /\b0x[0-9a-fA-F]{64}\b/, reason: "X post execution evidence must not include private keys or seed-like hex values" },
  { id: "seed_phrase", pattern: /\b(?:seed phrase|mnemonic|recovery phrase)\b/i, reason: "X post execution evidence must not include wallet seed or recovery phrase material" },
  { id: "bearer_token", pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b/i, reason: "X post execution evidence must not include bearer tokens" },
  { id: "api_key", pattern: /\b(api[_-]?key|secret|password)\s*[:=]\s*\S+/i, reason: "X post execution evidence must not include API keys, secrets, or passwords" }
];

export async function buildXPostExecutionEvidenceReport(evidence = {}, options = {}) {
  const reasons = [];
  const warnings = [];

  if (!isPlainObject(evidence)) {
    return {
      valid: false,
      reasons: ["X post execution evidence must be a JSON object"],
      warnings: [],
      approvalReport: null,
      postReport: null,
      redactionFlags: [],
      evidenceBoundary: boundary()
    };
  }

  const approvalPacket = evidence.approvalPacket || evidence.approval?.packet || null;
  const posted = isPlainObject(evidence.posted) ? evidence.posted : {};
  const proof = isPlainObject(evidence.proof) ? evidence.proof : {};
  const packetPost = approvalPacket?.payload?.post || null;
  const post = evidence.post || packetPost || {};
  const executionStatus = String(evidence.executionStatus || evidence.status || "").trim();
  let approvalReport = null;
  let postReport = null;

  requireText(reasons, evidence.evidenceId, "evidenceId");
  requireKnown(reasons, executionStatus, X_POST_EXECUTION_STATUSES, "executionStatus");
  requireText(reasons, evidence.generatedAt, "generatedAt");
  requireText(reasons, evidence.approvalRef, "approvalRef");
  if (evidence.generatedAt && !isValidDate(evidence.generatedAt)) reasons.push("generatedAt must be a valid date");

  if (!isPlainObject(approvalPacket) || Object.keys(approvalPacket).length === 0) {
    reasons.push("approvalPacket must include the final approved x_post external-action packet");
  } else {
    approvalReport = await buildExternalActionApprovalReport(approvalPacket, options.approvalOptions || {});
    reasons.push(...approvalReport.reasons.map((reason) => `approvalPacket: ${reason}`));
    warnings.push(...approvalReport.warnings.map((warning) => `approvalPacket: ${warning}`));
    if (approvalPacket.actionType !== "x_post") reasons.push("approvalPacket.actionType must be x_post");
    if (approvalPacket.status !== "approved") reasons.push("approvalPacket.status must be approved");
    if (!approvalRefMatches(evidence.approvalRef, approvalPacket.approvalId)) {
      reasons.push("approvalRef must reference approvalPacket.approvalId");
    }
  }

  if (isPlainObject(post) && Object.keys(post).length > 0) {
    postReport = validateXPost(post, {
      validEvidenceRefs: options.validEvidenceRefs,
      requireExperimentalDisclosure: options.requireExperimentalDisclosure
    });
    reasons.push(...postReport.reasons.map((reason) => `post: ${reason}`));
    warnings.push(...postReport.warnings.map((warning) => `post: ${warning}`));
    if (post.status !== "draft_only") {
      reasons.push("post.status must remain draft_only in the approved payload; execution evidence records the posted state separately");
    }
  } else {
    reasons.push("post must be present directly or inside approvalPacket.payload.post");
  }

  validatePostedEvidence(reasons, posted);
  validateProof(reasons, proof);
  validatePostedMatchesApproval(reasons, posted, approvalPacket?.action || {});

  const claimReport = validateDistributionClaims(posted.exactText || "", {
    partnershipApproved: options.partnershipApproved === true,
    evidenceRef: options.evidenceRef,
    evidencePath: options.evidencePath,
    validEvidenceRefs: options.validEvidenceRefs,
    allowUsageClaims: options.allowUsageClaims === true,
    requireExperimentalDisclosure: options.requireExperimentalDisclosure === true
  });
  reasons.push(...claimReport.reasons);
  warnings.push(...claimReport.warnings);

  const redactionFlags = sensitiveFlags(textForSensitiveScan(evidence));
  reasons.push(...redactionFlags.map((flag) => flag.reason));

  return {
    valid: reasons.length === 0,
    status: reasons.length === 0 ? "verified_x_post_execution" : "needs_execution_evidence",
    evidenceId: evidence.evidenceId || null,
    executionStatus: executionStatus || null,
    approvalRef: evidence.approvalRef || null,
    posted: {
      postedAt: posted.postedAt || null,
      postedBy: posted.postedBy || null,
      accountHandle: posted.accountHandle || null,
      postUrl: posted.postUrl || null,
      humanExecuted: posted.humanExecuted === true,
      accountOwnerApproved: posted.accountOwnerApproved === true,
      automationUsed: posted.automationUsed === true
    },
    proof: {
      type: proof.type || null,
      ref: proof.ref || null,
      capturedAt: proof.capturedAt || null,
      redacted: proof.redacted === true
    },
    approvalReport,
    postReport,
    claimFlags: claimReport.flags,
    redactionFlags,
    reasons: unique(reasons),
    warnings: unique(warnings),
    nextAction:
      reasons.length === 0
        ? "Record this evidence in the launch evidence bundle before citing the public post"
        : "Fill the post-execution evidence from the X account owner and re-run X post execution evidence validation",
    evidenceBoundary: boundary()
  };
}

function validatePostedEvidence(reasons, posted) {
  requireText(reasons, posted.postedAt, "posted.postedAt");
  requireText(reasons, posted.postedBy, "posted.postedBy");
  requireText(reasons, posted.accountHandle, "posted.accountHandle");
  requireText(reasons, posted.postUrl, "posted.postUrl");
  requireText(reasons, posted.exactText, "posted.exactText");
  if (posted.postedAt && !isValidDate(posted.postedAt)) reasons.push("posted.postedAt must be a valid date");
  if (posted.accountHandle && !/^@[A-Za-z0-9_]{1,30}$/.test(String(posted.accountHandle))) {
    reasons.push("posted.accountHandle must be the X account handle");
  }
  if (posted.postUrl && !isXPostUrl(posted.postUrl)) {
    reasons.push("posted.postUrl must be a public X/Twitter status URL");
  }
  if (posted.humanExecuted !== true) reasons.push("posted.humanExecuted must be true");
  if (posted.accountOwnerApproved !== true) reasons.push("posted.accountOwnerApproved must be true");
  if (posted.automationUsed !== false) reasons.push("posted.automationUsed must be false");
  if (posted.automated === true) reasons.push("posted.automated must not be true");
}

function validateProof(reasons, proof) {
  requireKnown(reasons, proof.type, X_POST_EXECUTION_PROOF_TYPES, "proof.type");
  requireText(reasons, proof.ref, "proof.ref");
  requireText(reasons, proof.capturedAt, "proof.capturedAt");
  if (proof.capturedAt && !isValidDate(proof.capturedAt)) reasons.push("proof.capturedAt must be a valid date");
  if (proof.redacted !== true) reasons.push("proof.redacted must be true");
}

function validatePostedMatchesApproval(reasons, posted, action) {
  if (!isPlainObject(action) || Object.keys(action).length === 0) return;
  requireMatch(reasons, posted.accountHandle, action.destination, "posted.accountHandle", "approvalPacket.action.destination");
  requireMatch(reasons, posted.exactText, action.exactText, "posted.exactText", "approvalPacket.action.exactText");
  if (action.channel !== "x") reasons.push("approvalPacket.action.channel must be x");
  if (action.automated === true) reasons.push("approvalPacket.action.automated must not be true");
}

function textForSensitiveScan(evidence) {
  const posted = isPlainObject(evidence.posted) ? evidence.posted : {};
  const proof = isPlainObject(evidence.proof) ? evidence.proof : {};
  return [
    evidence.evidenceId,
    evidence.approvalRef,
    posted.postedBy,
    posted.accountHandle,
    posted.postUrl,
    posted.exactText,
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

function isXPostUrl(value) {
  return /^https:\/\/(?:x\.com|twitter\.com)\/[A-Za-z0-9_]{1,30}\/status\/\d+(?:[/?#].*)?$/.test(String(value || ""));
}

function requireText(reasons, value, field) {
  if (!String(value || "").trim()) reasons.push(`Missing ${field}`);
}

function requireKnown(reasons, value, allowed, field) {
  if (!allowed.includes(String(value || ""))) reasons.push(`Invalid ${field}`);
}

function requireMatch(reasons, actual, expected, actualField, expectedField) {
  if (!String(actual || "").trim() || !String(expected || "").trim()) return;
  if (String(actual) !== String(expected)) reasons.push(`${actualField} must match ${expectedField}`);
}

function isValidDate(value) {
  return !Number.isNaN(Date.parse(String(value || "")));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function unique(values) {
  return [...new Set(values)];
}

function boundary() {
  return {
    postsContent: false,
    approvesExternalAction: false,
    sendsOutreach: false,
    signsWalletPayloads: false,
    startsPilotTraffic: false,
    movesFunds: false,
    storesSecrets: false,
    marksApproved: false,
    marksTokenReady: false,
    requiresHumanApproval: true,
    finalExternalActionApprovalRequired: true
  };
}
