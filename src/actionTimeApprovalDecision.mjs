import { createHash } from "node:crypto";

export const ACTION_TIME_APPROVAL_DECISION_STATUSES = [
  "ready_for_decision_record",
  "pending",
  "pending_decision",
  "approved",
  "approved_decision",
  "rejected",
  "rejected_decision",
  "needs_approval_request_fixes",
  "needs_packet_fixes",
  "needs_decision_fixes"
];

export const ACTION_TIME_APPROVAL_DECISIONS = ["pending", "approved", "rejected"];

const APPROVAL_FLAGS = [
  "humanWillExecute",
  "automationDisabled",
  "exactActionReviewed",
  "externalSideEffectAcknowledged",
  "noPrivateKeys",
  "noCustodyOrEscrow",
  "noTokenPitch",
  "noMarketManipulation",
  "legalEthicsReviewed"
];

const REQUIRED_ASSERTIONS = [
  "packetHashReviewed",
  "exactActionReviewedAtApprovalTime",
  "noChangesAfterReview",
  "humanWillExecuteExactlyOnce",
  "postExecutionEvidenceWillBeCollected"
];

export function buildActionTimeApprovalDecisionTemplate(input = {}, options = {}) {
  const generatedAt = options.generatedAt || new Date().toISOString();
  const approvalRequest = input.approvalRequest || null;
  const draftPacket = input.draftPacket || null;
  const packetSource = input.draftPacketSource || stringifyJson(draftPacket || {});
  const packetPath = input.packetPath || approvalRequest?.packetPath || null;
  const reasons = [];
  const warnings = [];

  validateApprovalRequest(approvalRequest, reasons, warnings);
  validateDraftPacket(draftPacket, approvalRequest, reasons);

  const exactText = exactTextForPacket(draftPacket);
  const packetSha256 = sha256(packetSource);
  const valid = reasons.length === 0;
  const template = {
    artifact: "allow_action_time_approval_decision",
    generatedAt,
    status: "pending",
    decision: "pending",
    approvalId: approvalRequest?.approvalId || draftPacket?.approvalId || "",
    actionType: approvalRequest?.actionType || draftPacket?.actionType || "",
    packet: {
      path: packetPath || "",
      sha256: packetSha256,
      bytes: Buffer.byteLength(packetSource, "utf8"),
      statusAtReview: draftPacket?.status || "",
      exactTextSha256: exactText ? sha256(exactText) : "",
      exactTextChars: exactText.length
    },
    reviewer: {
      approvedBy: "",
      approvedAt: "",
      decisionReason: ""
    },
    approvals: Object.fromEntries(APPROVAL_FLAGS.map((flag) => [flag, false])),
    assertions: Object.fromEntries(REQUIRED_ASSERTIONS.map((assertion) => [assertion, false])),
    commands: approvalRequest?.commands || [],
    instructions: [
      "Do not change this template to approved without explicit action-time approval.",
      "Before approval, confirm the current draft packet SHA-256 still matches packet.sha256.",
      "If approved, fill reviewer fields, set every approval flag and assertion to true, then edit the packet and run external-action-approval.",
      "If rejected, set decision to rejected, fill reviewer fields and decisionReason, and do not execute the action."
    ],
    evidenceBoundary: boundary()
  };

  return {
    generatedAt,
    valid,
    status: valid ? "ready_for_decision_record" : statusForTemplate({ approvalRequest, draftPacket }),
    template,
    packet: template.packet,
    reasons: unique(reasons),
    warnings: unique(warnings),
    nextAction: valid
      ? "Keep this decision template pending until explicit action-time approval or rejection is provided."
      : "Fix approval request or draft packet before preparing an approval decision template.",
    evidenceBoundary: boundary()
  };
}

export function validateActionTimeApprovalDecision(decision = {}, input = {}) {
  const approvalRequest = input.approvalRequest || null;
  const draftPacket = input.draftPacket || null;
  const packetSource = input.draftPacketSource || stringifyJson(draftPacket || {});
  const packetPath = input.packetPath || approvalRequest?.packetPath || null;
  const reasons = [];
  const warnings = [];

  validateApprovalRequest(approvalRequest, reasons, warnings);
  validateDraftPacket(draftPacket, approvalRequest, reasons);

  if (!decision || typeof decision !== "object" || Array.isArray(decision)) {
    reasons.push("Approval decision must be a JSON object");
  }
  if (decision.artifact !== "allow_action_time_approval_decision") {
    reasons.push("artifact must be allow_action_time_approval_decision");
  }
  if (!ACTION_TIME_APPROVAL_DECISIONS.includes(decision.decision)) {
    reasons.push(`decision must be one of ${ACTION_TIME_APPROVAL_DECISIONS.join(", ")}`);
  }
  if (decision.status !== decision.decision) {
    reasons.push("status must match decision");
  }
  if (approvalRequest?.approvalId && decision.approvalId !== approvalRequest.approvalId) {
    reasons.push("decision approvalId must match approval request");
  }
  if (approvalRequest?.actionType && decision.actionType !== approvalRequest.actionType) {
    reasons.push("decision actionType must match approval request");
  }
  if (decision.packet?.sha256 !== sha256(packetSource)) {
    reasons.push("decision packet.sha256 must match the current draft packet bytes");
  }
  if (packetPath && decision.packet?.path !== packetPath) {
    reasons.push("decision packet.path must match the approval request packet path");
  }
  if (decision.packet?.exactTextSha256 && sha256(exactTextForPacket(draftPacket)) !== decision.packet.exactTextSha256) {
    reasons.push("decision packet.exactTextSha256 must match the current draft packet exact action text");
  }
  if (draftPacket?.status !== "draft") {
    reasons.push("current packet must still be draft while recording an action-time decision");
  }

  if (decision.decision === "approved") {
    requireText(decision.reviewer?.approvedBy, "reviewer.approvedBy", reasons);
    requireText(decision.reviewer?.approvedAt, "reviewer.approvedAt", reasons);
    for (const flag of APPROVAL_FLAGS) {
      if (decision.approvals?.[flag] !== true) reasons.push(`approvals.${flag} must be true for approved decisions`);
    }
    for (const assertion of REQUIRED_ASSERTIONS) {
      if (decision.assertions?.[assertion] !== true) reasons.push(`assertions.${assertion} must be true for approved decisions`);
    }
  } else if (decision.decision === "rejected") {
    requireText(decision.reviewer?.approvedBy, "reviewer.approvedBy", reasons);
    requireText(decision.reviewer?.approvedAt, "reviewer.approvedAt", reasons);
    requireText(decision.reviewer?.decisionReason, "reviewer.decisionReason", reasons);
  } else {
    const trueFlags = APPROVAL_FLAGS.filter((flag) => decision.approvals?.[flag] === true);
    if (trueFlags.length > 0) warnings.push(`Pending decision should not prefill approval flags: ${trueFlags.join(", ")}`);
    const trueAssertions = REQUIRED_ASSERTIONS.filter((assertion) => decision.assertions?.[assertion] === true);
    if (trueAssertions.length > 0) warnings.push(`Pending decision should not prefill assertions: ${trueAssertions.join(", ")}`);
  }

  const valid = reasons.length === 0;
  const approvedForPacketEdit = valid && decision.decision === "approved";
  const rejectedForExecution = valid && decision.decision === "rejected";
  return {
    generatedAt: new Date().toISOString(),
    valid,
    status: valid ? statusForDecision(decision.decision) : "needs_decision_fixes",
    approvalId: decision.approvalId || null,
    actionType: decision.actionType || null,
    decision: decision.decision || null,
    approvedForPacketEdit,
    rejectedForExecution,
    packet: decision.packet || null,
    reasons: unique(reasons),
    warnings: unique(warnings),
    nextAction: nextActionForDecision({ valid, decision: decision.decision }),
    evidenceBoundary: boundary()
  };
}

export function publicActionTimeApprovalDecisionTemplateReport(report = {}) {
  return {
    ...report,
    template: undefined
  };
}

export function publicActionTimeApprovalDecisionReport(report = {}) {
  return {
    ...report
  };
}

function validateApprovalRequest(report, reasons, warnings) {
  if (!report) {
    reasons.push("Missing action-time approval request");
    return;
  }
  if (report.valid !== true || report.ready !== true) {
    reasons.push(...prefixReasons("Approval request", report.reasons));
    if ((report.reasons || []).length === 0) reasons.push(`Approval request is not ready: ${report.status || "unknown"}`);
  }
  warnings.push(...prefixReasons("Approval request warning", report.warnings));
}

function validateDraftPacket(packet, approvalRequest, reasons) {
  if (!packet || typeof packet !== "object" || Array.isArray(packet)) {
    reasons.push("Missing draft packet JSON");
    return;
  }
  if (packet.status !== "draft") reasons.push("Draft packet must still have status=draft");
  if (approvalRequest?.approvalId && packet.approvalId !== approvalRequest.approvalId) {
    reasons.push("Draft packet approvalId must match approval request");
  }
  if (approvalRequest?.actionType && packet.actionType !== approvalRequest.actionType) {
    reasons.push("Draft packet actionType must match approval request");
  }
  const trueFlags = APPROVAL_FLAGS.filter((flag) => packet.approvals?.[flag] === true);
  if (trueFlags.length > 0) reasons.push(`Draft packet must not prefill approval flags: ${trueFlags.join(", ")}`);
}

function statusForTemplate({ approvalRequest, draftPacket }) {
  if (!approvalRequest || approvalRequest.valid !== true || approvalRequest.ready !== true) return "needs_approval_request_fixes";
  if (!draftPacket || draftPacket.status !== "draft") return "needs_packet_fixes";
  return "needs_packet_fixes";
}

function statusForDecision(decision) {
  if (decision === "approved") return "approved_decision";
  if (decision === "rejected") return "rejected_decision";
  return "pending_decision";
}

function nextActionForDecision({ valid, decision }) {
  if (!valid) return "Fix the approval decision JSON before using it for any packet edit or execution.";
  if (decision === "approved") return "Edit the packet only after confirming the hash-bound approved decision, then run external-action-approval before manual execution.";
  if (decision === "rejected") return "Do not execute the action; keep the packet draft and choose another local milestone or prepare a new request.";
  return "Keep the decision pending until explicit action-time approval or rejection is provided.";
}

function exactTextForPacket(packet = {}) {
  return String(packet?.action?.exactText || packet?.payload?.post?.text || packet?.payload?.outreachDraft?.message || "");
}

function boundary() {
  return {
    writesFiles: false,
    approvesExternalAction: false,
    marksApproved: false,
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

function requireText(value, label, reasons) {
  if (!String(value || "").trim()) reasons.push(`${label} is required`);
}

function sha256(value) {
  return `0x${createHash("sha256").update(String(value || "")).digest("hex")}`;
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
