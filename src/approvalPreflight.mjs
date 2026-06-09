import { APPROVAL_RUNBOOK_FLAGS } from "./approvalRunbook.mjs";

export const APPROVAL_PREFLIGHT_STATUSES = [
  "ready_for_action_time_approval",
  "needs_review_workspace_fixes",
  "needs_runbook_fixes",
  "blocked_by_launch_sequence",
  "no_external_action_ready",
  "needs_preflight_fixes"
];

const FALSE_BOUNDARY_FIELDS = [
  "writesFiles",
  "postsContent",
  "sendsOutreach",
  "schedulesInterviews",
  "signsWalletPayloads",
  "deploysContracts",
  "startsPilotTraffic",
  "promotesMerchant",
  "movesFunds",
  "storesSecrets",
  "approvesExternalAction",
  "marksExecuted",
  "enablesToken"
];

export function buildApprovalPreflight(input = {}, options = {}) {
  const generatedAt = options.generatedAt || new Date().toISOString();
  const externalActionReviewBrief = input.externalActionReviewBrief || null;
  const approvalRunbook = input.approvalRunbook || null;
  const launchHandoffBrief = input.launchHandoffBrief || null;
  const launchSequence = input.launchSequence || {};
  const launchSequenceStatus = launchSequence.status || launchHandoffBrief?.launchSequenceStatus || null;
  const currentStage = currentStageFromInputs({ launchHandoffBrief, launchSequence });
  const fullPrimaryAction = primaryRunbookAction(approvalRunbook, currentStage);
  const reviewAction = matchingReviewAction(externalActionReviewBrief, fullPrimaryAction, currentStage);
  const reasons = [];
  const warnings = [];

  validateReviewBrief(externalActionReviewBrief, reasons, warnings);
  validateRunbook(approvalRunbook, reasons, warnings);
  validateCurrentStage(currentStage, { ...launchSequence, status: launchSequenceStatus }, reasons);
  validateActionPair(fullPrimaryAction, reviewAction, currentStage, reasons);
  validateSafetyBoundary("external action review brief", externalActionReviewBrief, reasons);
  validateSafetyBoundary("approval runbook", approvalRunbook, reasons);

  const valid = reasons.length === 0;
  const status = statusForPreflight({
    valid,
    externalActionReviewBrief,
    approvalRunbook,
    currentStage,
    launchSequence: { ...launchSequence, status: launchSequenceStatus }
  });
  const markdown = buildMarkdown({
    generatedAt,
    status,
    currentStage,
    action: fullPrimaryAction,
    reviewAction,
    reasons,
    warnings
  });

  return {
    generatedAt,
    valid,
    ready: valid && status === "ready_for_action_time_approval",
    status,
    launchSequenceStatus,
    currentStage,
    action: fullPrimaryAction ? publicAction(fullPrimaryAction) : null,
    reviewAction: reviewAction ? publicReviewAction(reviewAction) : null,
    checks: {
      reviewBriefValid: externalActionReviewBrief?.valid === true,
      runbookValid: approvalRunbook?.valid === true,
      currentStageReady: currentStage?.status === "ready_for_human_action",
      currentStageHasExternalAction: Boolean(currentStage?.externalActionType),
      actionMatchesCurrentStage: Boolean(fullPrimaryAction && currentStage?.id && fullPrimaryAction.stageId === currentStage.id),
      reviewActionMatchesRunbook: Boolean(reviewAction && fullPrimaryAction?.approvalId === reviewAction.approvalId),
      postEvidencePathPresent: fullPrimaryAction ? postEvidenceFragmentsFor(fullPrimaryAction.actionType).every((fragment) =>
        actionEvidenceText(fullPrimaryAction).includes(fragment)
      ) : false
    },
    reasons: unique(reasons),
    warnings: unique(warnings),
    nextAction: valid
      ? `Run final approval for ${fullPrimaryAction.approvalId}, execute manually only after approval passes, then validate evidence and previews.`
      : nextActionForStatus(status),
    markdown,
    evidenceBoundary: {
      readsLocalReviewBrief: true,
      readsLocalRunbook: true,
      writesFiles: false,
      postsContent: false,
      sendsOutreach: false,
      schedulesInterviews: false,
      signsWalletPayloads: false,
      deploysContracts: false,
      startsPilotTraffic: false,
      promotesMerchant: false,
      movesFunds: false,
      storesSecrets: false,
      approvesExternalAction: false,
      marksExecuted: false,
      updatesCanonicalState: false,
      enablesToken: false,
      requiresHumanApproval: true,
      finalExternalActionApprovalRequired: true,
      postExecutionEvidenceRequired: true
    }
  };
}

export function publicApprovalPreflightReport(report = {}) {
  return {
    ...report,
    markdown: undefined
  };
}

function validateReviewBrief(report, reasons, warnings) {
  if (!report) {
    reasons.push("Missing external action review brief");
    return;
  }
  if (report.valid !== true) {
    reasons.push(...prefixReasons("External action review brief", report.reasons));
    if ((report.reasons || []).length === 0) reasons.push(`External action review brief is not valid: ${report.status || "unknown"}`);
  }
  warnings.push(...prefixReasons("External action review brief warning", report.warnings));
}

function validateRunbook(report, reasons, warnings) {
  if (!report) {
    reasons.push("Missing approval runbook");
    return;
  }
  if (report.valid !== true) {
    reasons.push(...prefixReasons("Approval runbook", report.reasons));
    if ((report.reasons || []).length === 0) reasons.push(`Approval runbook is not valid: ${report.status || "unknown"}`);
  }
  if (report.status && report.status !== "ready_for_operator_review") {
    reasons.push(`Approval runbook status must be ready_for_operator_review before preflight, got ${report.status}`);
  }
  warnings.push(...prefixReasons("Approval runbook warning", report.warnings));
}

function validateCurrentStage(currentStage, launchSequence, reasons) {
  if (!currentStage?.id) {
    reasons.push("Missing current launch stage");
    return;
  }
  if (!currentStage.externalActionType) {
    reasons.push(`Current launch stage ${currentStage.id} is not an external-action stage`);
  }
  if (currentStage.status && currentStage.status !== "ready_for_human_action") {
    reasons.push(`Current launch stage ${currentStage.id} must be ready_for_human_action, got ${currentStage.status}`);
  }
  if (launchSequence.status && launchSequence.status !== "ready_for_external_action") {
    reasons.push(`Launch sequence must be ready_for_external_action before approval preflight, got ${launchSequence.status}`);
  }
}

function validateActionPair(action, reviewAction, currentStage, reasons) {
  if (!action) {
    reasons.push("Missing primary approval runbook action");
    return;
  }
  requireField(action.approvalId, "Primary action approvalId", reasons);
  requireField(action.stageId, "Primary action stageId", reasons);
  requireField(action.actionType, "Primary action actionType", reasons);
  requireField(action.packetPath, "Primary action packetPath", reasons);
  requireField(action.evidenceTemplatePath, "Primary action evidenceTemplatePath", reasons);
  requireField(action.approvalCommand, "Primary action approvalCommand", reasons);
  requireField(action.evidenceValidationCommand, "Primary action evidenceValidationCommand", reasons);

  if (currentStage?.id && action.stageId !== currentStage.id) {
    reasons.push(`Primary action stageId ${action.stageId || "missing"} does not match current stage ${currentStage.id}`);
  }
  if (currentStage?.externalActionType && action.actionType !== currentStage.externalActionType) {
    reasons.push(`Primary action type ${action.actionType || "missing"} does not match current stage type ${currentStage.externalActionType}`);
  }
  if (!String(action.approvalCommand || "").includes("external-action-approval")) {
    reasons.push("Primary action approvalCommand must run external-action-approval");
  }
  if (action.packetPath && !String(action.approvalCommand || "").includes(action.packetPath)) {
    reasons.push(`Primary action approvalCommand must reference packet path ${action.packetPath}`);
  }
  if (action.evidenceTemplatePath && !String(action.evidenceValidationCommand || "").includes(action.evidenceTemplatePath)) {
    reasons.push(`Primary action evidenceValidationCommand must reference evidence template ${action.evidenceTemplatePath}`);
  }

  const approval = action.approval || {};
  if (approval.flagsRequired !== APPROVAL_RUNBOOK_FLAGS.length) {
    reasons.push(`Primary action must require ${APPROVAL_RUNBOOK_FLAGS.length} approval flags`);
  }
  if ((approval.missingFlags || []).length !== APPROVAL_RUNBOOK_FLAGS.length) {
    reasons.push("Primary action should still have every approval flag false before action-time approval");
  }

  if (!reviewAction) {
    reasons.push(`No matching review brief action found for ${action.approvalId || currentStage?.id || "current stage"}`);
  } else {
    if (reviewAction.approvalId !== action.approvalId) reasons.push("Review action approvalId does not match runbook action");
    if (reviewAction.stageId !== action.stageId) reasons.push("Review action stageId does not match runbook action");
    if (reviewAction.actionType !== action.actionType) reasons.push("Review action actionType does not match runbook action");
    if (reviewAction.packetPath !== action.packetPath) reasons.push("Review action packetPath does not match runbook action");
    if (reviewAction.evidenceTemplatePath !== action.evidenceTemplatePath) reasons.push("Review action evidenceTemplatePath does not match runbook action");
  }

  const evidenceText = actionEvidenceText(action);
  for (const fragment of postEvidenceFragmentsFor(action.actionType)) {
    if (!evidenceText.includes(fragment)) {
      reasons.push(`Primary action evidence steps must include ${fragment}`);
    }
  }
}

function validateSafetyBoundary(label, report, reasons) {
  const boundary = report?.evidenceBoundary || {};
  for (const field of FALSE_BOUNDARY_FIELDS) {
    if (field in boundary && boundary[field] !== false) {
      reasons.push(`${label} evidenceBoundary.${field} must be false`);
    }
  }
  if (boundary.requiresHumanApproval !== true) {
    reasons.push(`${label} evidenceBoundary.requiresHumanApproval must be true`);
  }
}

function currentStageFromInputs({ launchHandoffBrief, launchSequence }) {
  if (launchHandoffBrief?.currentStage?.id) return normalizeStage(launchHandoffBrief.currentStage);
  const stages = Array.isArray(launchSequence?.stages) ? launchSequence.stages : [];
  const current = stages.find((stage) => stage.id === launchSequence.currentStage) || stages.find((stage) => stage.status !== "complete");
  return current ? normalizeStage(current) : null;
}

function normalizeStage(stage = {}) {
  return {
    id: stage.id || null,
    title: stage.title || null,
    status: stage.status || null,
    externalActionType: stage.externalActionType || null,
    nextAction: stage.nextAction || null
  };
}

function primaryRunbookAction(runbook, currentStage) {
  const actions = Array.isArray(runbook?.actions) ? runbook.actions : [];
  return actions.find((action) => currentStage?.id && action.stageId === currentStage.id && action.isCurrentStage)
    || actions.find((action) => currentStage?.id && action.stageId === currentStage.id)
    || actions.find((action) => action.approvalId === runbook?.primaryAction?.approvalId)
    || null;
}

function matchingReviewAction(reviewBrief, action, currentStage) {
  const actions = Array.isArray(reviewBrief?.actions) ? reviewBrief.actions : [];
  if (action?.approvalId) return actions.find((item) => item.approvalId === action.approvalId) || null;
  return actions.find((item) => currentStage?.id && item.stageId === currentStage.id && item.actionType === currentStage.externalActionType) || null;
}

function postEvidenceFragmentsFor(actionType) {
  if (actionType === "x_post") {
    return [
      "execution-evidence-ledger-entry",
      "state-update-preview",
      "canonical-update-set",
      "x-post-state -- ops/x_post_execution_records.json"
    ];
  }
  if (actionType === "merchant_outreach") {
    return [
      "execution-evidence-ledger-entry",
      "state-update-preview",
      "canonical-update-set",
      "outreach-state -- ops/outreach_execution_records.json"
    ];
  }
  if (actionType === "controller_policy_signature") {
    return ["ALLOW_POLICY_PATH", "npm run readiness"];
  }
  if (actionType === "live_pilot") {
    return ["pilot-report", "pilot-integration-state"];
  }
  return [];
}

function actionEvidenceText(action = {}) {
  return [
    action.evidenceValidationCommand,
    ...(Array.isArray(action.evidence) ? action.evidence : [])
  ].join("\n");
}

function statusForPreflight({ valid, externalActionReviewBrief, approvalRunbook, currentStage, launchSequence }) {
  if (valid) return "ready_for_action_time_approval";
  if (externalActionReviewBrief?.valid !== true) return "needs_review_workspace_fixes";
  if (approvalRunbook?.valid !== true || approvalRunbook?.status !== "ready_for_operator_review") return "needs_runbook_fixes";
  if (!currentStage?.externalActionType) return "no_external_action_ready";
  if (currentStage?.status !== "ready_for_human_action" || launchSequence?.status && launchSequence.status !== "ready_for_external_action") {
    return "blocked_by_launch_sequence";
  }
  return "needs_preflight_fixes";
}

function buildMarkdown({ generatedAt, status, currentStage, action, reviewAction, reasons, warnings }) {
  const lines = [
    "# Allow Approval Preflight",
    "",
    `Generated: ${generatedAt}`,
    `Status: ${status}`,
    "",
    "## Safety Boundary",
    "",
    "- This preflight is local review material only.",
    "- It does not approve packets, post to X, send outreach, schedule interviews, sign wallet payloads, deploy contracts, start pilot traffic, promote merchants, move funds, store secrets, update canonical state, or enable tokens.",
    "- A ready preflight only means the next external-action packet has the required local review, runbook, approval, evidence, and post-evidence preview path.",
    ""
  ];

  if (currentStage) {
    lines.push(
      "## Current Stage",
      "",
      `- Stage: \`${currentStage.id || "unknown"}\``,
      `- Status: \`${currentStage.status || "unknown"}\``,
      `- External action type: \`${currentStage.externalActionType || "none"}\``,
      ""
    );
  }

  if (action) {
    lines.push(
      "## Primary Action",
      "",
      `- Approval id: \`${action.approvalId || "unknown"}\``,
      `- Type: \`${action.actionType || "unknown"}\``,
      `- Packet: \`${action.packetPath || "unknown"}\``,
      `- Evidence template: \`${action.evidenceTemplatePath || "unknown"}\``,
      `- Approval command: \`${action.approvalCommand || "unknown"}\``,
      `- Evidence validation: \`${action.evidenceValidationCommand || "unknown"}\``,
      `- Review action match: ${reviewAction ? "yes" : "no"}`,
      ""
    );
    const postEvidenceFragments = postEvidenceFragmentsFor(action.actionType);
    if (postEvidenceFragments.length > 0) {
      lines.push("Post-evidence path:", "");
      for (const fragment of postEvidenceFragments) lines.push(`- \`${fragment}\``);
      lines.push("");
    }
  }

  if (reasons.length > 0) {
    lines.push("## Preflight Needs Fixes", "");
    for (const reason of unique(reasons)) lines.push(`- ${reason}`);
    lines.push("");
  }

  if (warnings.length > 0) {
    lines.push("## Warnings", "");
    for (const warning of unique(warnings)) lines.push(`- ${warning}`);
    lines.push("");
  }

  lines.push(
    "## Final Reminder",
    "",
    "Run this before final approval. Execute exactly one external action manually only after the approved packet passes, then validate evidence and preview state updates before any canonical edit or public claim."
  );

  return lines.join("\n");
}

function publicAction(action = {}) {
  return {
    approvalId: action.approvalId || null,
    stageId: action.stageId || null,
    actionType: action.actionType || null,
    title: action.title || null,
    destination: action.destination || null,
    channel: action.channel || null,
    packetPath: action.packetPath || null,
    evidenceTemplatePath: action.evidenceTemplatePath || null,
    approvalCommand: action.approvalCommand || null,
    evidenceValidationCommand: action.evidenceValidationCommand || null,
    approval: action.approval || null
  };
}

function publicReviewAction(action = {}) {
  return {
    approvalId: action.approvalId || null,
    stageId: action.stageId || null,
    actionType: action.actionType || null,
    packetPath: action.packetPath || null,
    evidenceTemplatePath: action.evidenceTemplatePath || null,
    approvalCommand: action.approvalCommand || null,
    evidenceValidationCommand: action.evidenceValidationCommand || null
  };
}

function requireField(value, label, reasons) {
  if (!String(value || "").trim()) reasons.push(`${label} is required`);
}

function prefixReasons(prefix, values = []) {
  return [...new Set((values || []).filter(Boolean).map((value) => `${prefix}: ${value}`))];
}

function nextActionForStatus(status) {
  const actions = {
    needs_review_workspace_fixes: "Regenerate or fix the external-action review workspace and review brief before approval.",
    needs_runbook_fixes: "Regenerate or fix the approval runbook before approval.",
    blocked_by_launch_sequence: "Clear the launch sequence blockers before approval.",
    no_external_action_ready: "Wait until the launch sequence reaches an external-action stage.",
    needs_preflight_fixes: "Fix the current packet, evidence template, runbook, or post-evidence preview path before approval."
  };
  return actions[status] || "Fix approval preflight inputs before any external action.";
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
