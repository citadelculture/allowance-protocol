import { validateDistributionClaims } from "./distributionClaims.mjs";
import { buildPilotEvidenceReport } from "./pilotEvidence.mjs";
import { isCrediblePilotEvidence, summarizeReceiptRecords } from "./receiptStore.mjs";

export const PILOT_DISCLOSURE_STATUSES = ["draft", "merchant_review", "approved", "rejected", "withdrawn"];
export const PILOT_DISCLOSURE_SCOPES = [
  "public_metrics",
  "launch_posts",
  "merchant_directory",
  "screenshots",
  "case_study"
];

const SENSITIVE_TEXT_PATTERNS = [
  { id: "private_key", pattern: /\b(?:0x)?[0-9a-fA-F]{64}\b/, reason: "Disclosure text must not include private keys or 32-byte secrets" },
  { id: "seed_phrase", pattern: /\b(?:seed phrase|mnemonic|recovery phrase)\b/i, reason: "Disclosure text must not include wallet seed or recovery phrase material" },
  { id: "email", pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i, reason: "Disclosure text must not include raw email addresses" },
  { id: "phone", pattern: /\b(?:\+?\d[\d\s().-]{7,}\d)\b/, reason: "Disclosure text must not include raw phone numbers" }
];

const FORBIDDEN_FIELD_NAMES = new Set([
  "authorization",
  "body",
  "fullrequest",
  "headers",
  "privatekey",
  "rawmetadata",
  "requestmetadata",
  "seedphrase",
  "secret",
  "apikey",
  "paymentheader",
  "receipt",
  "receipts",
  "xpayment"
]);

export function buildPilotDisclosureReport(packet = {}, records = [], options = {}) {
  const reasons = [];
  const warnings = [];
  const requireApproved = options.requireApproved !== false;
  const minimumActiveAgents = Number(options.minimumActiveAgents || 1);

  if (!packet || typeof packet !== "object" || Array.isArray(packet)) {
    return {
      valid: false,
      reasons: ["Pilot disclosure packet must be a JSON object"],
      warnings: [],
      redactionFlags: [],
      selectedReceiptIds: [],
      evidenceReport: null,
      evidenceBoundary: boundary()
    };
  }

  requireText(reasons, packet.disclosureId, "disclosureId");
  requireText(reasons, packet.merchantId, "merchantId");
  requireText(reasons, packet.evidenceRef, "evidenceRef");
  requireKnown(reasons, packet.status, PILOT_DISCLOSURE_STATUSES, "status");
  requireText(reasons, packet.publicSummary, "publicSummary");
  requireNonEmptyArray(reasons, packet.receiptIds, "receiptIds");

  if (packet.generatedAt && !isValidDate(packet.generatedAt)) reasons.push("generatedAt must be a valid date");
  if (requireApproved && packet.status !== "approved") {
    reasons.push("Pilot disclosure must be approved before public use");
  }

  const approval = packet.merchantApproval || {};
  if (requireApproved) validateMerchantApproval(reasons, warnings, packet, approval);

  validateRedactionAttestations(reasons, packet.redaction || {});

  const redactionFlags = [
    ...sensitiveFlags(disclosureText(packet)),
    ...forbiddenFieldFlags(packet)
  ];
  reasons.push(...redactionFlags.map((flag) => flag.reason));

  const selectedReceiptIds = unique((packet.receiptIds || []).map((id) => String(id || "").trim()).filter(Boolean));
  const selectedRecords = records.filter((record) => selectedReceiptIds.includes(receiptIdFor(record)));
  const foundReceiptIds = new Set(selectedRecords.map(receiptIdFor));
  const missingReceiptIds = selectedReceiptIds.filter((id) => !foundReceiptIds.has(id));

  if (missingReceiptIds.length) {
    reasons.push(`Missing receipt records for disclosure ids: ${missingReceiptIds.join(", ")}`);
  }

  for (const record of selectedRecords) {
    const merchantId = merchantIdFor(record);
    if (packet.merchantId && merchantId && merchantId !== packet.merchantId) {
      reasons.push(`Receipt ${receiptIdFor(record)} merchantId does not match disclosure merchantId`);
    }
    if (!isCrediblePilotEvidence(record)) {
      reasons.push(`Receipt ${receiptIdFor(record)} is not merchant-approved testnet or mainnet evidence`);
    }
  }

  const evidenceReport = buildPilotEvidenceReport(selectedRecords, {
    merchantId: packet.merchantId,
    minimumActiveAgents
  });
  if (!evidenceReport.valid) reasons.push(...evidenceReport.reasons.map((reason) => `Pilot evidence not ready for disclosure: ${reason}`));

  validateMetricsSnapshot(reasons, packet.metrics || {}, selectedRecords);
  validateRedactedReceipts(reasons, packet.redactedReceipts || [], selectedReceiptIds);

  const claims = validateDistributionClaims(packet.publicSummary || "", {
    evidenceRef: packet.evidenceRef,
    partnershipApproved: Boolean(approval.partnerClaimApproved),
    requireExperimentalDisclosure: options.requireExperimentalDisclosure
  });
  reasons.push(...claims.reasons);
  warnings.push(...claims.warnings);

  return {
    valid: reasons.length === 0,
    disclosureId: packet.disclosureId || null,
    merchantId: packet.merchantId || null,
    status: packet.status || null,
    evidenceRef: packet.evidenceRef || null,
    selectedReceiptIds,
    receiptCount: selectedRecords.length,
    missingReceiptIds,
    evidenceReport,
    metrics: summarizeReceiptRecords(selectedRecords),
    approval: {
      approved: Boolean(approval.approved),
      approvedAt: approval.approvedAt || null,
      scope: Array.isArray(approval.scope) ? approval.scope : []
    },
    claimFlags: claims.flags,
    redactionFlags,
    reasons: unique(reasons),
    warnings: unique(warnings),
    evidenceBoundary: boundary()
  };
}

function validateMerchantApproval(reasons, warnings, packet, approval) {
  if (approval.approved !== true) reasons.push("merchantApproval.approved must be true");
  requireText(reasons, approval.approvedAt, "merchantApproval.approvedAt");
  requireText(reasons, approval.approverRef, "merchantApproval.approverRef");
  requireNonEmptyArray(reasons, approval.scope, "merchantApproval.scope");
  if (approval.approvedAt && !isValidDate(approval.approvedAt)) reasons.push("merchantApproval.approvedAt must be a valid date");
  if (approval.merchantId && packet.merchantId && approval.merchantId !== packet.merchantId) {
    reasons.push("merchantApproval.merchantId must match disclosure merchantId");
  }
  for (const scope of approval.scope || []) {
    if (!PILOT_DISCLOSURE_SCOPES.includes(scope)) reasons.push(`Invalid merchantApproval.scope: ${scope}`);
  }
  if (!approval.scope?.includes("public_metrics")) {
    reasons.push("merchantApproval.scope must include public_metrics");
  }
  if (approval.scope?.includes("case_study") && !approval.statement) {
    warnings.push("Case-study scope should include the exact merchant-approved statement");
  }
}

function validateRedactionAttestations(reasons, redaction) {
  for (const field of ["rawMetadataRemoved", "personalDataRemoved", "secretsRemoved", "receiptIdsOnly"]) {
    if (redaction[field] !== true) reasons.push(`redaction.${field} must be true`);
  }
}

function validateMetricsSnapshot(reasons, metrics, selectedRecords) {
  const summary = summarizeReceiptRecords(selectedRecords);
  const activeAgents = unique(selectedRecords.map((record) => record.receipt?.agentId || record.agentId).filter(Boolean)).length;
  const credibleRecords = selectedRecords.filter(isCrediblePilotEvidence);
  const checks = [
    ["policyDecisions", summary.total],
    ["crediblePolicyDecisions", credibleRecords.length],
    ["allowedReceipts", Number(summary.byDecision.allow || 0)],
    ["deniedReceipts", Number(summary.byDecision.deny || 0)],
    ["activeAgents", activeAgents]
  ];

  for (const [field, maximum] of checks) {
    if (metrics[field] === undefined) continue;
    const value = Number(metrics[field]);
    if (!Number.isFinite(value) || value < 0) {
      reasons.push(`metrics.${field} must be a nonnegative number`);
    } else if (value > maximum) {
      reasons.push(`metrics.${field} overstates selected receipt evidence`);
    }
  }

  if (metrics.blockedValueUsd !== undefined) {
    const value = Number(metrics.blockedValueUsd);
    if (!Number.isFinite(value) || value < 0) reasons.push("metrics.blockedValueUsd must be a nonnegative number");
    if (value > Number(summary.blockedValueUsd || 0)) reasons.push("metrics.blockedValueUsd overstates selected receipt evidence");
  }

  if (metrics.environment) {
    const environments = Object.keys(summary.byEvidenceEnvironment || {});
    if (!environments.includes(metrics.environment)) reasons.push("metrics.environment is not present in selected receipt evidence");
  }
}

function validateRedactedReceipts(reasons, redactedReceipts, selectedReceiptIds) {
  if (!Array.isArray(redactedReceipts)) {
    reasons.push("redactedReceipts must be an array when provided");
    return;
  }

  for (const [index, receipt] of redactedReceipts.entries()) {
    const id = String(receipt?.id || "").trim();
    if (!id) reasons.push(`redactedReceipts[${index}] missing id`);
    if (id && !selectedReceiptIds.includes(id)) reasons.push(`redactedReceipts[${index}] id is not included in receiptIds`);
    const forbidden = forbiddenFieldFlags(receipt, `redactedReceipts[${index}]`);
    reasons.push(...forbidden.map((flag) => flag.reason));
    const textFlags = sensitiveFlags(disclosureText(receipt));
    reasons.push(...textFlags.map((flag) => flag.reason));
  }
}

function forbiddenFieldFlags(value, path = "packet", flags = []) {
  if (!value || typeof value !== "object") return flags;
  if (Array.isArray(value)) {
    value.forEach((item, index) => forbiddenFieldFlags(item, `${path}[${index}]`, flags));
    return flags;
  }

  for (const [key, nested] of Object.entries(value)) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (FORBIDDEN_FIELD_NAMES.has(normalized)) {
      flags.push({
        id: "raw_or_secret_field",
        reason: `Disclosure packet must not include raw or secret field ${path}.${key}`
      });
    }
    forbiddenFieldFlags(nested, `${path}.${key}`, flags);
  }
  return flags;
}

function sensitiveFlags(text = "") {
  const flags = [];
  for (const item of SENSITIVE_TEXT_PATTERNS) {
    if (item.pattern.test(text)) flags.push({ id: item.id, reason: item.reason });
  }
  return flags;
}

function disclosureText(value = {}) {
  if (!value || typeof value !== "object") return String(value || "");
  return [
    value.publicSummary,
    value.evidenceRef,
    value.reasonCategory,
    value.note,
    value.statement,
    value.merchantApproval?.approverRef,
    value.merchantApproval?.statement,
    ...(Array.isArray(value.evidenceRefs) ? value.evidenceRefs : []),
    ...(Array.isArray(value.notes) ? value.notes : [])
  ]
    .filter(Boolean)
    .join("\n");
}

function receiptIdFor(record = {}) {
  return String(record.receipt?.id || record.id || "").trim();
}

function merchantIdFor(record = {}) {
  return String(record.merchantId || record.receipt?.merchantId || "").trim();
}

function requireText(reasons, value, field) {
  if (!String(value || "").trim()) reasons.push(`Missing ${field}`);
}

function requireKnown(reasons, value, allowed, field) {
  if (!allowed.includes(String(value || ""))) reasons.push(`Invalid ${field}`);
}

function requireNonEmptyArray(reasons, value, field) {
  if (!Array.isArray(value) || value.length === 0) reasons.push(`${field} must be a non-empty array`);
}

function isValidDate(value) {
  return Number.isFinite(new Date(value).getTime());
}

function unique(values) {
  return [...new Set(values)];
}

function boundary() {
  return {
    publishesContent: false,
    contactsMerchant: false,
    movesFunds: false,
    storesSecrets: false,
    requiresMerchantApprovalBeforePublicUse: true
  };
}
