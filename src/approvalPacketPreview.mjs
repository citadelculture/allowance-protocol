import { buildExternalActionApprovalReport } from "./externalActionApproval.mjs";
import { validateActionTimeApprovalDecision } from "./actionTimeApprovalDecision.mjs";

export const APPROVAL_PACKET_PREVIEW_STATUSES = [
  "ready_for_external_action_approval",
  "needs_approved_decision",
  "needs_packet_fixes",
  "needs_external_action_approval_fixes"
];

export async function buildApprovalPacketPreview(input = {}, options = {}) {
  const generatedAt = options.generatedAt || new Date().toISOString();
  const decision = input.approvalDecision || null;
  const approvalRequest = input.approvalRequest || null;
  const draftPacket = input.draftPacket || null;
  const draftPacketSource = input.draftPacketSource || stringifyJson(draftPacket || {});
  const packetPath = input.packetPath || approvalRequest?.packetPath || decision?.packet?.path || null;
  const reasons = [];
  const warnings = [];

  const decisionValidation = validateActionTimeApprovalDecision(decision, {
    approvalRequest,
    draftPacket,
    draftPacketSource,
    packetPath
  });
  reasons.push(...prefixReasons("Approval decision", decisionValidation.reasons));
  warnings.push(...prefixReasons("Approval decision", decisionValidation.warnings));

  if (!decisionValidation.approvedForPacketEdit) {
    reasons.push("Approval decision must be approved before deriving an approved packet preview");
  }
  if (!draftPacket || typeof draftPacket !== "object" || Array.isArray(draftPacket)) {
    reasons.push("Missing draft packet JSON");
  }

  const approvedPacket = reasons.length === 0
    ? deriveApprovedPacket({ draftPacket, decision, generatedAt })
    : null;
  const approvalReport = approvedPacket
    ? await buildExternalActionApprovalReport(approvedPacket, options.externalActionApprovalOptions || {})
    : null;

  if (approvalReport && !approvalReport.valid) {
    reasons.push(...prefixReasons("External action approval", approvalReport.reasons));
    warnings.push(...prefixReasons("External action approval", approvalReport.warnings));
  }

  const valid = reasons.length === 0;
  return {
    generatedAt,
    valid,
    status: statusFor({ valid, decisionValidation, approvalReport }),
    approvalId: decisionValidation.approvalId || draftPacket?.approvalId || null,
    actionType: decisionValidation.actionType || draftPacket?.actionType || null,
    packetPath,
    preview: approvedPacket
      ? {
          status: approvedPacket.status,
          approvedBy: approvedPacket.approvedBy,
          approvedAt: approvedPacket.approvedAt,
          approvalDecisionRef: approvedPacket.approvalDecisionRef
        }
      : null,
    approvedPacket,
    decisionValidation,
    externalActionApproval: approvalReport,
    reasons: unique(reasons),
    warnings: unique(warnings),
    nextAction: valid
      ? "Write the approved packet preview to a separate file, then run external-action-approval on that preview before manual execution."
      : "Collect a real approved decision and fix any packet validation issues before creating an approved packet preview.",
    evidenceBoundary: boundary()
  };
}

export function publicApprovalPacketPreviewReport(report = {}) {
  return {
    ...report,
    approvedPacket: undefined
  };
}

function deriveApprovedPacket({ draftPacket, decision, generatedAt }) {
  const approvedPacket = JSON.parse(JSON.stringify(draftPacket));
  approvedPacket.status = "approved";
  approvedPacket.approvedBy = decision.reviewer.approvedBy;
  approvedPacket.approvedAt = decision.reviewer.approvedAt;
  approvedPacket.approvals = {
    ...approvedPacket.approvals,
    ...decision.approvals
  };
  approvedPacket.approvalDecisionRef = {
    artifact: decision.artifact,
    generatedAt: decision.generatedAt || null,
    decision: decision.decision,
    approvedBy: decision.reviewer.approvedBy,
    approvedAt: decision.reviewer.approvedAt,
    packetPath: decision.packet?.path || "",
    packetSha256: decision.packet?.sha256 || "",
    exactTextSha256: decision.packet?.exactTextSha256 || "",
    previewGeneratedAt: generatedAt
  };
  approvedPacket.notes = [
    ...(Array.isArray(approvedPacket.notes) ? approvedPacket.notes : []),
    "Approved packet preview derived from a hash-bound action-time approval decision.",
    "Run external-action-approval on this preview before any manual execution."
  ];
  return approvedPacket;
}

function statusFor({ valid, decisionValidation, approvalReport }) {
  if (valid) return "ready_for_external_action_approval";
  if (!decisionValidation?.approvedForPacketEdit) return "needs_approved_decision";
  if (approvalReport && !approvalReport.valid) return "needs_external_action_approval_fixes";
  return "needs_packet_fixes";
}

function boundary() {
  return {
    readsDraftPacket: true,
    readsApprovalDecision: true,
    writesFiles: false,
    writesPreviewOnly: true,
    approvesExternalAction: false,
    marksOriginalPacketApproved: false,
    postsContent: false,
    sendsOutreach: false,
    schedulesInterviews: false,
    signsWalletPayloads: false,
    deploysContracts: false,
    startsPilotTraffic: false,
    promotesMerchant: false,
    movesFunds: false,
    storesSecrets: false,
    updatesCanonicalState: false,
    enablesToken: false,
    requiresHumanApproval: true,
    finalExternalActionApprovalRequired: true,
    postExecutionEvidenceRequired: true
  };
}

function stringifyJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function prefixReasons(prefix, values = []) {
  return [...new Set((values || []).filter(Boolean).map((value) => `${prefix}: ${value}`))];
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
