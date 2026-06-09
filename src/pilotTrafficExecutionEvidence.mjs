import { buildExternalActionApprovalReport } from "./externalActionApproval.mjs";
import { isCrediblePilotEvidence } from "./receiptStore.mjs";

export const PILOT_TRAFFIC_EXECUTION_STATUSES = ["executed"];
export const PILOT_TRAFFIC_EXECUTION_PROOF_TYPES = [
  "manual_log",
  "gateway_access_log",
  "receipt_log",
  "terminal_transcript",
  "screenshot"
];

const SENSITIVE_TEXT_PATTERNS = [
  { id: "private_key", pattern: /\b0x[0-9a-fA-F]{64}\b/, reason: "Pilot traffic execution evidence must not include private keys or seed-like hex values" },
  { id: "seed_phrase", pattern: /\b(?:seed phrase|mnemonic|recovery phrase)\b/i, reason: "Pilot traffic execution evidence must not include wallet seed or recovery phrase material" },
  { id: "bearer_token", pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b/i, reason: "Pilot traffic execution evidence must not include bearer tokens" },
  { id: "api_key", pattern: /\b(api[_-]?key|secret|password)\s*[:=]\s*\S+/i, reason: "Pilot traffic execution evidence must not include API keys, secrets, or passwords" },
  { id: "raw_payment", pattern: /\bPAYMENT-SIGNATURE:\s*(?!<)[^\s"]{12,}/i, reason: "Pilot traffic execution evidence must not include raw payment signatures" }
];

export async function buildPilotTrafficExecutionEvidenceReport(evidence = {}, options = {}) {
  const reasons = [...(options.sourceErrors || [])];
  const warnings = [];

  if (!isPlainObject(evidence)) {
    return {
      valid: false,
      reasons: ["Pilot traffic execution evidence must be a JSON object"],
      warnings: [],
      approvalReport: null,
      receiptReport: null,
      redactionFlags: [],
      evidenceBoundary: boundary()
    };
  }

  const approvalPacket = evidence.approvalPacket || evidence.approval?.packet || {};
  const execution = isPlainObject(evidence.execution) ? evidence.execution : {};
  const receipts = isPlainObject(evidence.receipts) ? evidence.receipts : {};
  const proof = isPlainObject(evidence.proof) ? evidence.proof : {};
  const safety = isPlainObject(evidence.safety) ? evidence.safety : {};
  const pilotStep = String(evidence.pilotStep || approvalPacket?.payload?.pilotStep || "").trim();
  const approvalRequest = approvalPacket?.payload?.request || {};
  const merchantId = String(evidence.merchantId || approvalRequest.merchantId || "").trim();
  const receiptRecords = Array.isArray(options.receiptRecords)
    ? options.receiptRecords
    : Array.isArray(evidence.receiptRecords)
      ? evidence.receiptRecords
      : [];
  let approvalReport = null;

  requireText(reasons, evidence.evidenceId, "evidenceId");
  requireText(reasons, evidence.generatedAt, "generatedAt");
  requireKnown(reasons, evidence.status, PILOT_TRAFFIC_EXECUTION_STATUSES, "status");
  requireText(reasons, evidence.approvalRef, "approvalRef");
  requireText(reasons, merchantId, "merchantId");
  requireKnown(reasons, pilotStep, ["allowed_delivery", "denied_guard"], "pilotStep");
  if (evidence.generatedAt && !isValidDate(evidence.generatedAt)) reasons.push("generatedAt must be a valid date");

  if (!isPlainObject(approvalPacket) || Object.keys(approvalPacket).length === 0) {
    reasons.push("approvalPacket must include the final approved live_pilot external-action packet");
  } else {
    approvalReport = await buildExternalActionApprovalReport(approvalPacket, options.approvalOptions || {});
    reasons.push(...approvalReport.reasons.map((reason) => `approvalPacket: ${reason}`));
    warnings.push(...approvalReport.warnings.map((warning) => `approvalPacket: ${warning}`));
    if (approvalPacket.actionType !== "live_pilot") reasons.push("approvalPacket.actionType must be live_pilot");
    if (approvalPacket.status !== "approved") reasons.push("approvalPacket.status must be approved");
    if (!approvalRefMatches(evidence.approvalRef, approvalPacket.approvalId)) {
      reasons.push("approvalRef must reference approvalPacket.approvalId");
    }
    requireMatch(reasons, pilotStep, approvalPacket.payload?.pilotStep, "pilotStep", "approvalPacket.payload.pilotStep");
    requireMatch(reasons, merchantId, approvalRequest.merchantId, "merchantId", "approvalPacket.payload.request.merchantId");
  }

  validateExecution(reasons, execution, approvalPacket, pilotStep);
  validateProof(reasons, proof);
  validateSafety(reasons, safety);
  const receiptReport = validateReceiptEvidence({
    reasons,
    records: receiptRecords,
    receiptIds: receipts.receiptIds,
    receiptLogPath: receipts.receiptLogPath,
    expectedReceiptLogPath: approvalRequest.receiptPath,
    merchantId,
    pilotStep,
    route: approvalRequest.route || {}
  });

  const redactionFlags = sensitiveFlags(textForSensitiveScan(evidence));
  reasons.push(...redactionFlags.map((flag) => flag.reason));

  return {
    valid: reasons.length === 0,
    status: reasons.length === 0 ? "verified_pilot_traffic_execution" : "needs_pilot_execution_evidence",
    evidenceId: evidence.evidenceId || null,
    pilotStep: pilotStep || null,
    merchantId: merchantId || null,
    approvalRef: evidence.approvalRef || null,
    execution: {
      executedAt: execution.executedAt || null,
      executedBy: execution.executedBy || null,
      humanExecuted: execution.humanExecuted === true,
      automationUsed: execution.automationUsed === true,
      noExtraRequests: execution.noExtraRequests === true,
      paymentPayloadRedacted: execution.paymentPayloadRedacted === true
    },
    receipts: receiptReport.summary,
    proof: {
      type: proof.type || null,
      ref: proof.ref || null,
      capturedAt: proof.capturedAt || null,
      redacted: proof.redacted === true
    },
    approvalReport,
    receiptReport,
    redactionFlags,
    reasons: unique(reasons),
    warnings: unique(warnings),
    nextAction:
      reasons.length === 0
        ? "Validate the full receipt log with npm run pilot-report once both allowed and denied pilot executions are recorded"
        : "Attach the approved live_pilot packet, human execution details, redacted proof, and matching receipt ids",
    evidenceBoundary: boundary()
  };
}

function validateExecution(reasons, execution, approvalPacket, pilotStep) {
  requireText(reasons, execution.executedAt, "execution.executedAt");
  requireText(reasons, execution.executedBy, "execution.executedBy");
  requireText(reasons, execution.commandTemplate, "execution.commandTemplate");
  requireText(reasons, execution.redactedCommand, "execution.redactedCommand");
  if (execution.executedAt && !isValidDate(execution.executedAt)) reasons.push("execution.executedAt must be a valid date");
  if (execution.humanExecuted !== true) reasons.push("execution.humanExecuted must be true");
  if (execution.automationUsed !== false) reasons.push("execution.automationUsed must be false");
  if (execution.noExtraRequests !== true) reasons.push("execution.noExtraRequests must be true");
  if (approvalPacket?.action?.command && execution.commandTemplate !== approvalPacket.action.command) {
    reasons.push("execution.commandTemplate must match approvalPacket.action.command");
  }
  if (pilotStep === "allowed_delivery" && execution.paymentPayloadRedacted !== true) {
    reasons.push("execution.paymentPayloadRedacted must be true for allowed_delivery");
  }
}

function validateProof(reasons, proof) {
  requireKnown(reasons, proof.type, PILOT_TRAFFIC_EXECUTION_PROOF_TYPES, "proof.type");
  requireText(reasons, proof.ref, "proof.ref");
  requireText(reasons, proof.capturedAt, "proof.capturedAt");
  if (proof.capturedAt && !isValidDate(proof.capturedAt)) reasons.push("proof.capturedAt must be a valid date");
  if (proof.redacted !== true) reasons.push("proof.redacted must be true");
}

function validateSafety(reasons, safety) {
  for (const flag of [
    "merchantApprovedRun",
    "noExtraRequests",
    "noSecretsStored",
    "noCustodyOrEscrow",
    "receiptLogPrivate",
    "noPublicClaims"
  ]) {
    if (safety[flag] !== true) reasons.push(`safety.${flag} must be true`);
  }
}

function validateReceiptEvidence({ reasons, records, receiptIds, receiptLogPath, expectedReceiptLogPath, merchantId, pilotStep, route }) {
  const ids = Array.isArray(receiptIds) ? receiptIds.map((id) => String(id || "").trim()).filter(Boolean) : [];
  const selected = records.filter((record) => ids.includes(receiptIdFor(record)));

  requireText(reasons, receiptLogPath, "receipts.receiptLogPath");
  if (!ids.length) reasons.push("receipts.receiptIds must be a non-empty array");
  if (!records.length) reasons.push("No receipt records were loaded for pilot traffic execution evidence");
  if (receiptLogPath && expectedReceiptLogPath && receiptLogPath !== expectedReceiptLogPath) {
    reasons.push("receipts.receiptLogPath must match approvalPacket payload request receiptPath");
  }
  for (const id of ids) {
    if (!selected.some((record) => receiptIdFor(record) === id)) reasons.push(`Receipt id ${id} was not found in loaded receipt records`);
  }
  for (const record of selected) {
    validateReceiptRecord(reasons, record, {
      merchantId,
      pilotStep,
      route
    });
  }

  return {
    valid: reasons.length === 0,
    summary: {
      receiptLogPath: receiptLogPath || null,
      requestedReceiptIds: ids,
      matchedReceiptIds: selected.map(receiptIdFor),
      selectedCount: selected.length
    },
    selectedRecords: selected.map((record) => ({
      receiptId: receiptIdFor(record),
      merchantId: merchantIdFor(record),
      decision: decisionFor(record),
      upstreamStatus: record.upstreamStatus || null,
      routePathPrefix: record.route?.pathPrefix || null
    }))
  };
}

function validateReceiptRecord(reasons, record, { merchantId, pilotStep, route }) {
  const receiptId = receiptIdFor(record);
  if (!isCrediblePilotEvidence(record)) reasons.push(`Receipt ${receiptId || "unknown"} must have merchant-approved testnet or mainnet evidence`);
  if (merchantIdFor(record) !== merchantId) reasons.push(`Receipt ${receiptId || "unknown"} merchantId must match execution merchantId`);
  if (record.route?.pathPrefix && route.pathPrefix && record.route.pathPrefix !== route.pathPrefix) {
    reasons.push(`Receipt ${receiptId || "unknown"} route.pathPrefix must match approved request route`);
  }
  if (pilotStep === "allowed_delivery") {
    if (decisionFor(record) !== "allow") reasons.push(`Receipt ${receiptId || "unknown"} must be an allow decision`);
    if (!is2xx(record.upstreamStatus)) reasons.push(`Receipt ${receiptId || "unknown"} must have a successful 2xx upstreamStatus`);
  }
  if (pilotStep === "denied_guard") {
    if (decisionFor(record) !== "deny") reasons.push(`Receipt ${receiptId || "unknown"} must be a deny decision`);
    if (is2xx(record.upstreamStatus)) reasons.push(`Receipt ${receiptId || "unknown"} denied guard must not have a successful upstreamStatus`);
  }
}

function textForSensitiveScan(evidence) {
  const execution = isPlainObject(evidence.execution) ? evidence.execution : {};
  const proof = isPlainObject(evidence.proof) ? evidence.proof : {};
  return [
    evidence.evidenceId,
    evidence.approvalRef,
    evidence.merchantId,
    execution.executedBy,
    execution.commandTemplate,
    execution.redactedCommand,
    proof.ref,
    ...(Array.isArray(evidence.notes) ? evidence.notes : [])
  ]
    .filter(Boolean)
    .join("\n");
}

function receiptIdFor(record = {}) {
  return String(record.receipt?.id || record.receiptId || record.id || "").trim();
}

function merchantIdFor(record = {}) {
  return String(record.merchantId || record.receipt?.merchantId || "").trim();
}

function decisionFor(record = {}) {
  return String(record.decision || record.receipt?.decision || "").trim();
}

function is2xx(status) {
  return String(status || "").startsWith("2");
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
  return [...new Set(values.filter(Boolean))];
}

function boundary() {
  return {
    startsPilotTraffic: false,
    approvesExternalAction: false,
    movesFunds: false,
    signsWalletPayloads: false,
    storesSecrets: false,
    countsAsFullPilotEvidence: false,
    approvesPublicClaims: false,
    marksMerchantLive: false,
    marksTokenReady: false
  };
}
