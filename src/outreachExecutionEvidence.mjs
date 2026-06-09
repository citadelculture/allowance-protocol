import { validateDistributionClaims } from "./distributionClaims.mjs";
import { buildExternalActionApprovalReport } from "./externalActionApproval.mjs";
import { validateOutreachDraft } from "./outreachApproval.mjs";

export const OUTREACH_EXECUTION_STATUSES = ["sent", "replied", "scheduled", "declined", "bounced"];
export const OUTREACH_RESPONSE_STATUSES = ["none", "replied", "scheduled", "declined", "bounced"];
export const OUTREACH_EXECUTION_PROOF_TYPES = [
  "manual_log",
  "screenshot",
  "form_receipt",
  "message_permalink",
  "email_header_redacted"
];

const SENSITIVE_TEXT_PATTERNS = [
  { id: "private_key", pattern: /\b0x[0-9a-fA-F]{64}\b/, reason: "Outreach execution evidence must not include private keys or seed-like hex values" },
  { id: "seed_phrase", pattern: /\b(?:seed phrase|mnemonic|recovery phrase)\b/i, reason: "Outreach execution evidence must not include wallet seed or recovery phrase material" },
  { id: "bearer_token", pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b/i, reason: "Outreach execution evidence must not include bearer tokens" },
  { id: "api_key", pattern: /\b(api[_-]?key|secret|password)\s*[:=]\s*\S+/i, reason: "Outreach execution evidence must not include API keys, secrets, or passwords" }
];

export async function buildOutreachExecutionEvidenceReport(evidence = {}, options = {}) {
  const reasons = [];
  const warnings = [];

  if (!isPlainObject(evidence)) {
    return {
      valid: false,
      reasons: ["Outreach execution evidence must be a JSON object"],
      warnings: [],
      approvalReport: null,
      draftReport: null,
      redactionFlags: [],
      evidenceBoundary: boundary()
    };
  }

  const approvalPacket = evidence.approvalPacket || evidence.approval?.packet || null;
  const sent = isPlainObject(evidence.sent) ? evidence.sent : {};
  const response = isPlainObject(evidence.response) ? evidence.response : {};
  const proof = isPlainObject(evidence.proof) ? evidence.proof : {};
  const links = isPlainObject(evidence.links) ? evidence.links : {};
  const packetDraft = approvalPacket?.payload?.outreachDraft || null;
  const draft = evidence.outreachDraft || packetDraft || {};
  const outreachStatus = String(evidence.outreachStatus || evidence.status || "").trim();
  const responseStatus = String(response.status || (outreachStatus === "sent" ? "none" : outreachStatus)).trim();
  let approvalReport = null;
  let draftReport = null;

  requireText(reasons, evidence.evidenceId, "evidenceId");
  requireKnown(reasons, outreachStatus, OUTREACH_EXECUTION_STATUSES, "outreachStatus");
  requireText(reasons, evidence.generatedAt, "generatedAt");
  requireText(reasons, evidence.approvalRef, "approvalRef");
  requireText(reasons, evidence.candidateId || links.candidateId, "candidateId");
  requireText(reasons, evidence.prospectId || links.prospectId, "prospectId");
  if (evidence.generatedAt && !isValidDate(evidence.generatedAt)) reasons.push("generatedAt must be a valid date");

  if (!isPlainObject(approvalPacket) || Object.keys(approvalPacket).length === 0) {
    reasons.push("approvalPacket must include the final approved merchant_outreach external-action packet");
  } else {
    approvalReport = await buildExternalActionApprovalReport(approvalPacket, options.approvalOptions || {});
    reasons.push(...approvalReport.reasons.map((reason) => `approvalPacket: ${reason}`));
    warnings.push(...approvalReport.warnings.map((warning) => `approvalPacket: ${warning}`));
    if (approvalPacket.actionType !== "merchant_outreach") reasons.push("approvalPacket.actionType must be merchant_outreach");
    if (approvalPacket.status !== "approved") reasons.push("approvalPacket.status must be approved");
    if (!approvalRefMatches(evidence.approvalRef, approvalPacket.approvalId)) {
      reasons.push("approvalRef must reference approvalPacket.approvalId");
    }
  }

  if (isPlainObject(draft) && Object.keys(draft).length > 0) {
    draftReport = validateOutreachDraft(draft, options.outreachOptions || {});
    reasons.push(...draftReport.reasons.map((reason) => `outreachDraft: ${reason}`));
    warnings.push(...draftReport.warnings.map((warning) => `outreachDraft: ${warning}`));
    requireMatch(reasons, evidence.candidateId || links.candidateId, draft.candidateId, "candidateId", "outreachDraft.candidateId");
    requireMatch(reasons, evidence.prospectId || links.prospectId, draft.prospectId, "prospectId", "outreachDraft.prospectId");
  } else {
    reasons.push("outreachDraft must be present directly or inside approvalPacket.payload.outreachDraft");
  }

  validateSentEvidence(reasons, sent);
  validateProof(reasons, proof);
  validateResponseEvidence(reasons, outreachStatus, responseStatus, response, links);
  validateSentMatchesApproval(reasons, sent, approvalPacket?.action || {});

  const claimReport = validateDistributionClaims(`${sent.subject || ""}\n${sent.exactText || ""}`, {
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
    status: reasons.length === 0 ? "verified_outreach_execution" : "needs_execution_evidence",
    evidenceId: evidence.evidenceId || null,
    outreachStatus: outreachStatus || null,
    responseStatus: responseStatus || null,
    approvalRef: evidence.approvalRef || null,
    candidateId: evidence.candidateId || links.candidateId || draft.candidateId || null,
    prospectId: evidence.prospectId || links.prospectId || draft.prospectId || null,
    sent: {
      sentAt: sent.sentAt || null,
      sentBy: sent.sentBy || null,
      channel: sent.channel || null,
      destination: sent.destination || null,
      subject: sent.subject || null,
      humanExecuted: sent.humanExecuted === true,
      accountOwnerApproved: sent.accountOwnerApproved === true,
      automationUsed: sent.automationUsed === true
    },
    response: {
      status: responseStatus || null,
      receivedAt: response.receivedAt || null,
      scheduledAt: response.scheduledAt || null,
      interviewId: response.interviewId || links.interviewId || null
    },
    proof: {
      type: proof.type || null,
      ref: proof.ref || null,
      capturedAt: proof.capturedAt || null,
      redacted: proof.redacted === true
    },
    approvalReport,
    draftReport,
    claimFlags: claimReport.flags,
    redactionFlags,
    reasons: unique(reasons),
    warnings: unique(warnings),
    nextAction:
      reasons.length === 0
        ? "Log the response state and only run npm run interview-report after a completed interview has its own evidence"
        : "Fill the post-send evidence from the human account owner and re-run outreach execution evidence validation",
    evidenceBoundary: boundary()
  };
}

function validateSentEvidence(reasons, sent) {
  requireText(reasons, sent.sentAt, "sent.sentAt");
  requireText(reasons, sent.sentBy, "sent.sentBy");
  requireText(reasons, sent.channel, "sent.channel");
  requireText(reasons, sent.destination, "sent.destination");
  requireText(reasons, sent.subject, "sent.subject");
  requireText(reasons, sent.exactText, "sent.exactText");
  if (sent.sentAt && !isValidDate(sent.sentAt)) reasons.push("sent.sentAt must be a valid date");
  if (sent.humanExecuted !== true) reasons.push("sent.humanExecuted must be true");
  if (sent.accountOwnerApproved !== true) reasons.push("sent.accountOwnerApproved must be true");
  if (sent.automationUsed !== false) reasons.push("sent.automationUsed must be false");
  if (sent.automated === true) reasons.push("sent.automated must not be true");
}

function validateProof(reasons, proof) {
  requireKnown(reasons, proof.type, OUTREACH_EXECUTION_PROOF_TYPES, "proof.type");
  requireText(reasons, proof.ref, "proof.ref");
  requireText(reasons, proof.capturedAt, "proof.capturedAt");
  if (proof.capturedAt && !isValidDate(proof.capturedAt)) reasons.push("proof.capturedAt must be a valid date");
  if (proof.redacted !== true) reasons.push("proof.redacted must be true");
}

function validateResponseEvidence(reasons, outreachStatus, responseStatus, response, links) {
  requireKnown(reasons, responseStatus, OUTREACH_RESPONSE_STATUSES, "response.status");
  if (outreachStatus === "sent" && responseStatus !== "none") {
    reasons.push("response.status must be none while outreachStatus is sent");
  }
  if (outreachStatus !== "sent" && responseStatus !== outreachStatus) {
    reasons.push("response.status must match outreachStatus after a response is received");
  }
  if (["replied", "scheduled", "declined", "bounced"].includes(responseStatus)) {
    requireText(reasons, response.receivedAt, "response.receivedAt");
    requireText(reasons, response.summary, "response.summary");
    if (response.receivedAt && !isValidDate(response.receivedAt)) reasons.push("response.receivedAt must be a valid date");
  }
  if (responseStatus === "scheduled") {
    requireText(reasons, response.scheduledAt, "response.scheduledAt");
    requireText(reasons, response.interviewId || links.interviewId, "response.interviewId");
    if (response.scheduledAt && !isValidDate(response.scheduledAt)) reasons.push("response.scheduledAt must be a valid date");
  }
}

function validateSentMatchesApproval(reasons, sent, action) {
  if (!isPlainObject(action) || Object.keys(action).length === 0) return;
  requireMatch(reasons, sent.channel, action.channel, "sent.channel", "approvalPacket.action.channel");
  requireMatch(reasons, sent.destination, action.destination, "sent.destination", "approvalPacket.action.destination");
  requireMatch(reasons, sent.subject, action.subject, "sent.subject", "approvalPacket.action.subject");
  requireMatch(reasons, sent.exactText, action.exactText, "sent.exactText", "approvalPacket.action.exactText");
  if (action.automated === true) reasons.push("approvalPacket.action.automated must not be true");
}

function textForSensitiveScan(evidence) {
  const sent = isPlainObject(evidence.sent) ? evidence.sent : {};
  const response = isPlainObject(evidence.response) ? evidence.response : {};
  const proof = isPlainObject(evidence.proof) ? evidence.proof : {};
  return [
    evidence.evidenceId,
    evidence.approvalRef,
    evidence.candidateId,
    evidence.prospectId,
    sent.sentBy,
    sent.channel,
    sent.destination,
    sent.subject,
    sent.exactText,
    response.summary,
    response.interviewId,
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
    sendsOutreach: false,
    approvesExternalAction: false,
    countsAsCompletedInterview: false,
    schedulesInterview: false,
    startsPilotTraffic: false,
    movesFunds: false,
    storesSecrets: false,
    marksProspectIntegrated: false,
    marksTokenReady: false
  };
}
