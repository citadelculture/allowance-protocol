export const DISPUTE_CATEGORIES = ["billing", "incorrect_denial", "unsafe_allow", "settlement", "refund", "abuse", "other"];
export const DISPUTE_STATUSES = ["draft", "submitted", "merchant_review", "resolved", "rejected", "withdrawn"];
export const CLOSED_DISPUTE_STATUSES = new Set(["resolved", "rejected", "withdrawn"]);
export const DISPUTE_SEVERITIES = ["low", "medium", "high", "critical"];
export const DISPUTE_OUTCOMES = [
  "explain_receipt",
  "refund_requested",
  "policy_update",
  "merchant_config_update",
  "block_merchant",
  "no_action",
  "other"
];

const SENSITIVE_PATTERNS = [
  { id: "private_key", pattern: /\b(?:0x)?[0-9a-fA-F]{64}\b/, reason: "Do not include private keys or 32-byte secrets" },
  { id: "seed_phrase", pattern: /\b(?:seed phrase|mnemonic|recovery phrase)\b/i, reason: "Do not include wallet seed or recovery phrase material" },
  { id: "email", pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i, reason: "Do not include raw email addresses; use approved contact handles or hashed references" },
  { id: "phone", pattern: /\b(?:\+?\d[\d\s().-]{7,}\d)\b/, reason: "Do not include raw phone numbers" }
];

export function validateDisputePacket(packet = {}, options = {}) {
  const reasons = [];
  const warnings = [];

  if (!packet || typeof packet !== "object" || Array.isArray(packet)) {
    return {
      valid: false,
      reasons: ["Dispute packet must be a JSON object"],
      warnings: [],
      redactionFlags: []
    };
  }

  requireText(reasons, packet.disputeId, "disputeId");
  requireText(reasons, packet.merchantId, "merchantId");
  requireKnown(reasons, packet.category, DISPUTE_CATEGORIES, "category");
  requireKnown(reasons, packet.status, DISPUTE_STATUSES, "status");
  requireKnown(reasons, packet.severity, DISPUTE_SEVERITIES, "severity");
  requireKnown(reasons, packet.requestedOutcome, DISPUTE_OUTCOMES, "requestedOutcome");
  requireText(reasons, packet.summary, "summary");
  requireText(reasons, packet.openedAt, "openedAt");
  requireText(reasons, packet.requester?.contact, "requester.contact");
  requireKnown(reasons, packet.requester?.role, ["agent_operator", "merchant", "user", "reviewer"], "requester.role");
  requireNonEmptyArray(reasons, packet.receiptIds, "receiptIds");
  requireNonEmptyArray(reasons, packet.evidenceRefs, "evidenceRefs");

  if (packet.openedAt && !isValidDate(packet.openedAt)) reasons.push("openedAt must be a valid date");
  if (packet.resolvedAt && !isValidDate(packet.resolvedAt)) reasons.push("resolvedAt must be a valid date");
  if (packet.resolvedAt && packet.openedAt && isValidDate(packet.openedAt) && isValidDate(packet.resolvedAt)) {
    if (new Date(packet.resolvedAt).getTime() < new Date(packet.openedAt).getTime()) {
      reasons.push("resolvedAt must not be before openedAt");
    }
  }

  if (packet.status === "resolved" && !packet.resolution) {
    reasons.push("Resolved disputes must include a resolution");
  }

  if (packet.rawMetadata || packet.requestMetadata || packet.fullRequest || packet.privateKey || packet.seedPhrase) {
    reasons.push("Dispute packet must not include raw metadata, full requests, private keys, or seed phrases");
  }

  if (packet.merchantId && Array.isArray(packet.receipts)) {
    for (const [index, receipt] of packet.receipts.entries()) {
      const merchantId = receipt?.merchantId || receipt?.receipt?.merchantId || "";
      if (merchantId && merchantId !== packet.merchantId) {
        reasons.push(`receipts[${index}] merchantId does not match dispute merchantId`);
      }
    }
  }

  const text = [
    packet.summary,
    packet.resolution,
    packet.requester?.contact,
    ...(Array.isArray(packet.evidenceRefs) ? packet.evidenceRefs : []),
    ...(Array.isArray(packet.notes) ? packet.notes : [])
  ]
    .filter(Boolean)
    .join("\n");
  const redactionFlags = sensitiveFlags(text);
  reasons.push(...redactionFlags.map((flag) => flag.reason));

  if (packet.status === "draft") warnings.push("Draft dispute is not ready for merchant review");
  if (options.requireResolution === true && !CLOSED_DISPUTE_STATUSES.has(packet.status)) {
    reasons.push("Dispute must be closed for this operation");
  }

  return {
    valid: reasons.length === 0,
    reasons,
    warnings,
    redactionFlags
  };
}

export function summarizeDisputePacket(packet = {}, options = {}) {
  const validation = validateDisputePacket(packet, options);
  return {
    valid: validation.valid,
    disputeId: packet?.disputeId || null,
    merchantId: packet?.merchantId || null,
    category: packet?.category || null,
    status: packet?.status || null,
    severity: packet?.severity || null,
    receiptCount: Array.isArray(packet?.receiptIds) ? packet.receiptIds.length : 0,
    evidenceRefCount: Array.isArray(packet?.evidenceRefs) ? packet.evidenceRefs.length : 0,
    reasons: validation.reasons,
    warnings: validation.warnings,
    redactionFlags: validation.redactionFlags.map((flag) => flag.id)
  };
}

function sensitiveFlags(text = "") {
  const flags = [];
  for (const item of SENSITIVE_PATTERNS) {
    if (item.pattern.test(text)) flags.push({ id: item.id, reason: item.reason });
  }
  return flags;
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
