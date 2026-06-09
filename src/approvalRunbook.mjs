export const APPROVAL_RUNBOOK_STATUSES = [
  "ready_for_operator_review",
  "needs_review_workspace_fixes",
  "no_actions_ready"
];

export const APPROVAL_RUNBOOK_FLAGS = [
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

export function buildApprovalRunbook(input = {}, options = {}) {
  const generatedAt = options.generatedAt || new Date().toISOString();
  const reviewBrief = input.externalActionReviewBrief || null;
  const launchHandoffBrief = input.launchHandoffBrief || null;
  const launchSequence = input.launchSequence || {};
  const currentStageId = launchHandoffBrief?.currentStage?.id || launchSequence.currentStage || null;
  const actions = Array.isArray(reviewBrief?.actions) ? reviewBrief.actions : [];
  const reasons = [];
  const warnings = [];

  if (!reviewBrief) {
    reasons.push("Missing external action review brief");
  } else {
    if (reviewBrief.valid !== true) {
      reasons.push(...(reviewBrief.reasons || []));
      if ((reviewBrief.reasons || []).length === 0) {
        reasons.push(`External action review brief is not valid: ${reviewBrief.status || "unknown"}`);
      }
    }
    warnings.push(...(reviewBrief.warnings || []));
  }

  const checklists = actions.map((action, index) =>
    buildActionChecklist(action, {
      index,
      currentStageId
    })
  );
  const primaryAction = checklists.find((action) => action.isCurrentStage) || checklists[0] || null;
  const valid = reviewBrief?.valid === true && reasons.length === 0;
  const status = !valid
    ? "needs_review_workspace_fixes"
    : checklists.length === 0
      ? "no_actions_ready"
      : "ready_for_operator_review";
  const markdown = buildMarkdown({
    generatedAt,
    status,
    reviewBrief,
    launchHandoffBrief,
    currentStageId,
    primaryAction,
    checklists,
    reasons,
    warnings
  });

  return {
    generatedAt,
    valid,
    status,
    reviewBriefStatus: reviewBrief?.status || null,
    currentStage: currentStageId,
    primaryAction: primaryAction ? publicAction(primaryAction) : null,
    counts: {
      actions: checklists.length,
      xPosts: checklists.filter((action) => action.actionType === "x_post").length,
      merchantOutreach: checklists.filter((action) => action.actionType === "merchant_outreach").length,
      controllerSignatures: checklists.filter((action) => action.actionType === "controller_policy_signature").length,
      livePilots: checklists.filter((action) => action.actionType === "live_pilot").length,
      missingApprovalFlags: checklists.reduce((total, action) => total + action.approval.missingFlags.length, 0)
    },
    actions: checklists,
    markdown,
    reasons: unique(reasons),
    warnings: unique(warnings),
    nextAction: nextAction({ valid, primaryAction, checklists }),
    evidenceBoundary: {
      readsLocalReviewBrief: true,
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
      enablesToken: false,
      requiresHumanApproval: true,
      finalExternalActionApprovalRequired: true,
      postExecutionEvidenceRequired: true
    }
  };
}

export function publicApprovalRunbookReport(report = {}) {
  return {
    ...report,
    markdown: undefined
  };
}

function buildActionChecklist(action = {}, options = {}) {
  const trueFlags = Array.isArray(action.approvalFlags?.trueFlags) ? action.approvalFlags.trueFlags : [];
  const missingFlags = APPROVAL_RUNBOOK_FLAGS.filter((flag) => !trueFlags.includes(flag));
  const approvalCommand = action.approvalCommand || (action.packetPath
    ? `npm run external-action-approval -- ${action.packetPath}`
    : "npm run external-action-approval -- <approved-packet.json>");
  const evidenceCommand = action.evidenceValidationCommand || evidenceCommandForAction(action);

  return {
    index: options.index + 1,
    approvalId: action.approvalId || null,
    stageId: action.stageId || null,
    isCurrentStage: Boolean(options.currentStageId && action.stageId === options.currentStageId),
    actionType: action.actionType || null,
    title: action.title || action.summary || action.approvalId || "Untitled external action",
    destination: action.destination || null,
    channel: action.channel || null,
    packetPath: action.packetPath || null,
    evidenceTemplatePath: action.evidenceTemplatePath || null,
    approvalCommand,
    evidenceValidationCommand: evidenceCommand,
    exactText: action.exactText || "",
    exactTextChars: action.exactTextChars || action.exactText?.length || 0,
    approval: {
      flagsRequired: APPROVAL_RUNBOOK_FLAGS.length,
      flagsTrue: trueFlags.length,
      missingFlags
    },
    beforeApproval: beforeApprovalSteps(action, approvalCommand, missingFlags),
    execution: executionSteps(action),
    evidence: evidenceSteps(action, evidenceCommand),
    safetyChecks: [
      "Do not execute unless the approval validator passes on the final approved packet.",
      "Do not change the destination, channel, text, typed data, or command after approval.",
      "Do not expose private keys, seed phrases, unredacted customer data, or custody credentials.",
      "Do not add token, investment, usage, partnership, or return claims without validated evidence."
    ]
  };
}

function beforeApprovalSteps(action, approvalCommand, missingFlags) {
  return [
    `Open the draft packet ${formatPath(action.packetPath)} and confirm it still represents the intended action.`,
    `Confirm the destination is ${formatValue(action.destination)} and the channel is ${formatValue(action.channel)}.`,
    action.exactText
      ? `Review the exact text (${action.exactText.length} characters) and do not approve edits that are outside the packet.`
      : "Review the exact payload or typed data in the packet before approval.",
    "Set status to approved only after action-time human approval.",
    "Fill approvedBy and approvedAt with the real reviewer and timestamp.",
    missingFlags.length > 0
      ? `Set every required approval flag to true: ${missingFlags.join(", ")}.`
      : "Confirm every required approval flag is already true.",
    `Run ${approvalCommand} and require a passing result before execution.`
  ];
}

function executionSteps(action) {
  if (action.actionType === "x_post") {
    return [
      "The approved account owner posts the exact text from the approved packet manually.",
      "Use the approved destination only; do not add thread posts, media, tags, or claims that were not reviewed.",
      "Capture the public post URL immediately after posting."
    ];
  }
  if (action.actionType === "merchant_outreach") {
    return [
      "The approved sender sends the exact reviewed outreach text manually.",
      "Use the approved channel and destination only; do not add sales, token, investment, or partnership claims.",
      "Capture redacted send proof immediately after sending."
    ];
  }
  if (action.actionType === "controller_policy_signature") {
    return [
      "The wallet owner signs only the exact typed data from the approved packet.",
      "Use a wallet UI or signer controlled by the owner; do not paste private keys or seed material anywhere.",
      "Store the signed policy outside the repository with access limited to the operator."
    ];
  }
  if (action.actionType === "live_pilot") {
    return [
      "Run only the exact approved pilot command against the approved merchant scope.",
      "Use the approved signed policy, agent binding, gateway config, and dispute packet.",
      "Capture the receipt log and any redacted upstream proof immediately after execution."
    ];
  }
  return [
    "Execute only the exact approved action manually.",
    "Do not mutate payload, destination, channel, signer, or runtime parameters after approval.",
    "Capture redacted proof immediately after execution."
  ];
}

function evidenceSteps(action, evidenceCommand) {
  return [
    `Fill the matching evidence template ${formatPath(action.evidenceTemplatePath)} after the human action is complete.`,
    "Attach the approved packet reference, execution timestamp, actor, destination, and redacted proof.",
    `Run ${evidenceCommand} and require a passing result before updating state or making public claims.`,
    ...postEvidenceUpdateSteps(action)
  ];
}

function postEvidenceUpdateSteps(action) {
  if (action.actionType === "x_post") {
    const evidencePath = evidencePathFromValidationCommand(action.evidenceValidationCommand) || action.evidenceTemplatePath || "<filled-x-post-evidence.json>";
    return [
      `Run npm run execution-evidence-ledger-entry -- ${evidencePath} to build the local ledger append preview.`,
      "Run npm run state-update-preview -- work/execution-evidence-ledger-entry.json to preview launch/x_posts.json changes.",
      "Run npm run canonical-update-set -- work/execution-evidence-ledger-entry.json work/state-update-preview.json and review file hashes plus proposed JSON before editing canonical files.",
      "Only after review, append the passed record, apply the previewed launch state change, then run npm run x-post-state -- ops/x_post_execution_records.json."
    ];
  }
  if (action.actionType === "merchant_outreach") {
    const evidencePath = evidencePathFromValidationCommand(action.evidenceValidationCommand) || action.evidenceTemplatePath || "<filled-outreach-evidence.json>";
    return [
      `Run npm run execution-evidence-ledger-entry -- ${evidencePath} to build the local ledger append preview.`,
      "Run npm run state-update-preview -- work/execution-evidence-ledger-entry.json to preview ops/prospects.json changes.",
      "Run npm run canonical-update-set -- work/execution-evidence-ledger-entry.json work/state-update-preview.json and review file hashes plus proposed JSON before editing canonical files.",
      "Only after review, append the passed record, apply the previewed prospect state change, then run npm run outreach-state -- ops/outreach_execution_records.json."
    ];
  }
  if (action.actionType === "live_pilot") return ["After evidence passes, run npm run pilot-report and pilot-integration-state before any usage claim."];
  if (action.actionType === "controller_policy_signature") return ["After evidence passes, configure ALLOW_POLICY_PATH or ALLOW_POLICY_JSON and rerun npm run readiness."];
  return ["After evidence passes, update only the matching evidence-backed state surface."];
}

function evidencePathFromValidationCommand(command = "") {
  return String(command).match(/\s--\s+(\S+)/)?.[1] || "";
}

function evidenceCommandForAction(action) {
  if (action.evidenceTemplatePath && action.actionType === "x_post") return `npm run x-post-execution-evidence -- ${action.evidenceTemplatePath}`;
  if (action.evidenceTemplatePath && action.actionType === "merchant_outreach") return `npm run outreach-execution-evidence -- ${action.evidenceTemplatePath}`;
  if (action.evidenceTemplatePath && action.actionType === "controller_policy_signature") return `npm run controller-signing-execution-evidence -- ${action.evidenceTemplatePath}`;
  if (action.evidenceTemplatePath && action.actionType === "live_pilot") return `npm run pilot-traffic-execution-evidence -- ${action.evidenceTemplatePath} <receipt-log-path>`;
  return "npm run <matching-execution-evidence-validator> -- <filled-evidence.json>";
}

function buildMarkdown({ generatedAt, status, reviewBrief, launchHandoffBrief, currentStageId, primaryAction, checklists, reasons, warnings }) {
  const lines = [
    "# Allow Approval Runbook",
    "",
    `Generated: ${generatedAt}`,
    `Status: ${status}`,
    `Review brief: ${reviewBrief?.status || "missing"}`,
    `Current stage: ${launchHandoffBrief?.currentStage?.id || currentStageId || "unknown"}`,
    "",
    "## Safety Boundary",
    "",
    "- This runbook is local operator guidance only.",
    "- It does not approve packets, post to X, send outreach, schedule interviews, sign wallet payloads, deploy contracts, start pilot traffic, promote merchants, move funds, store secrets, update state, or enable tokens.",
    "- Every external action still requires a passing final approval packet and post-execution evidence.",
    ""
  ];

  if (reasons.length > 0) {
    lines.push("## Runbook Needs Fixes", "");
    for (const reason of unique(reasons)) lines.push(`- ${reason}`);
    appendWarnings(lines, warnings);
    return lines.join("\n");
  }

  if (!primaryAction) {
    lines.push("No ready external actions were found in the review brief.");
    appendWarnings(lines, warnings);
    return lines.join("\n");
  }

  lines.push(
    "## Primary Action",
    "",
    `- Approval id: \`${primaryAction.approvalId}\``,
    `- Type: \`${primaryAction.actionType || "unknown"}\``,
    `- Stage: \`${primaryAction.stageId || "unknown"}\``,
    `- Destination: \`${primaryAction.destination || "unknown"}\``,
    `- Packet: \`${primaryAction.packetPath || "unknown"}\``,
    `- Evidence template: \`${primaryAction.evidenceTemplatePath || "unknown"}\``,
    `- Approval flags still false: ${primaryAction.approval.missingFlags.length}`,
    ""
  );

  appendChecklist(lines, primaryAction);

  if (checklists.length > 1) {
    lines.push("## Remaining Ready Actions", "");
    for (const action of checklists.filter((item) => item !== primaryAction)) {
      lines.push(
        `- \`${action.approvalId}\` (${action.actionType}) for ${action.destination || "unknown destination"}: ${action.title}`
      );
    }
    lines.push("");
  }

  appendWarnings(lines, warnings);

  lines.push(
    "## Final Reminder",
    "",
    "Approve exactly one action at a time. Execute it manually only after approval passes, then validate evidence before touching state or claims."
  );

  return lines.join("\n");
}

function appendChecklist(lines, action) {
  lines.push("### Before Approval", "");
  for (const step of action.beforeApproval) lines.push(`- ${step}`);
  lines.push("", "### Human Execution", "");
  for (const step of action.execution) lines.push(`- ${step}`);
  lines.push("", "### Evidence After Execution", "");
  for (const step of action.evidence) lines.push(`- ${step}`);
  lines.push("", "### Safety Checks", "");
  for (const step of action.safetyChecks) lines.push(`- ${step}`);
  if (action.exactText) {
    lines.push("", "### Exact Action Text", "", fencedText(action.exactText), "");
  } else {
    lines.push("");
  }
}

function appendWarnings(lines, warnings) {
  const uniqueWarnings = unique(warnings);
  if (uniqueWarnings.length === 0) return;
  lines.push("## Warnings", "");
  for (const warning of uniqueWarnings) lines.push(`- ${warning}`);
  lines.push("");
}

function publicAction(action) {
  return {
    index: action.index,
    approvalId: action.approvalId,
    stageId: action.stageId,
    isCurrentStage: action.isCurrentStage,
    actionType: action.actionType,
    title: action.title,
    destination: action.destination,
    channel: action.channel,
    packetPath: action.packetPath,
    evidenceTemplatePath: action.evidenceTemplatePath,
    approvalCommand: action.approvalCommand,
    evidenceValidationCommand: action.evidenceValidationCommand,
    approval: action.approval
  };
}

function nextAction({ valid, primaryAction, checklists }) {
  if (!valid) return "Fix or regenerate the external-action review workspace before using the approval runbook.";
  if (!primaryAction) return "No ready external actions are available; continue clearing launch sequence blockers.";
  return `Use the ${primaryAction.approvalId} checklist, run final approval, execute manually only after approval passes, then validate evidence.`;
}

function formatPath(path) {
  return path ? `\`${path}\`` : "`<missing-path>`";
}

function formatValue(value) {
  return value ? `\`${value}\`` : "`unknown`";
}

function fencedText(value) {
  return ["```text", String(value), "```"].join("\n");
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
