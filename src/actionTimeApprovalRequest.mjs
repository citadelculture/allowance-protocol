export const ACTION_TIME_APPROVAL_REQUEST_STATUSES = [
  "ready_for_human_decision",
  "needs_preflight_fixes",
  "needs_packet_fixes",
  "no_action_ready"
];

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

const SENSITIVE_TEXT_PATTERNS = [
  { id: "private_key", pattern: /\b0x[0-9a-fA-F]{64}\b/, reason: "Approval request must not include private keys" },
  { id: "seed_phrase", pattern: /\b(?:seed phrase|mnemonic|recovery phrase)\b/i, reason: "Approval request must not include wallet seed or recovery phrase material" },
  { id: "bearer_token", pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b/i, reason: "Approval request must not include bearer tokens" },
  { id: "api_key", pattern: /\b(api[_-]?key|secret|password)\s*[:=]\s*\S+/i, reason: "Approval request must not include API keys, secrets, or passwords" }
];

export function buildActionTimeApprovalRequest(input = {}, options = {}) {
  const generatedAt = options.generatedAt || new Date().toISOString();
  const preflight = input.approvalPreflight || null;
  const action = preflight?.action || null;
  const packet = input.draftPacket || null;
  const packetPath = input.packetPath || action?.packetPath || null;
  const evidenceTemplatePath = input.evidenceTemplatePath || action?.evidenceTemplatePath || null;
  const reasons = [];
  const warnings = [];

  validatePreflight(preflight, reasons, warnings);
  validateDraftPacket(packet, action, reasons, warnings);

  const exactText = exactTextForPacket(packet);
  const sensitiveFlags = sensitiveFlagsFor([exactText, packet?.action?.summary, packet?.action?.destination].join("\n"));
  reasons.push(...sensitiveFlags.map((flag) => flag.reason));

  const valid = reasons.length === 0;
  const status = statusForRequest({ valid, preflight, packet, action });
  const approvalCommands = approvalCommandsFor({ action, packetPath, evidenceTemplatePath });
  const markdown = buildMarkdown({
    generatedAt,
    status,
    preflight,
    action,
    packet,
    packetPath,
    evidenceTemplatePath,
    exactText,
    approvalCommands,
    reasons,
    warnings
  });

  return {
    generatedAt,
    valid,
    ready: valid && status === "ready_for_human_decision",
    status,
    approvalId: action?.approvalId || packet?.approvalId || null,
    actionType: action?.actionType || packet?.actionType || null,
    packetPath,
    evidenceTemplatePath,
    action: actionSummary(action, packet),
    exactText: exactText || null,
    exactTextChars: exactText.length,
    approvalFieldsRequired: {
      status: "approved",
      approvedBy: "<real reviewer>",
      approvedAt: "<approval timestamp>",
      flags: APPROVAL_FLAGS
    },
    commands: approvalCommands,
    redactionFlags: sensitiveFlags,
    reasons: unique(reasons),
    warnings: unique(warnings),
    nextAction: valid
      ? `Ask for action-time approval for ${action.approvalId}; if approved, edit the packet and run external-action-approval before any human execution.`
      : nextActionForStatus(status),
    markdown,
    evidenceBoundary: {
      readsLocalPreflight: true,
      readsDraftPacket: true,
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
    }
  };
}

export function publicActionTimeApprovalRequestReport(report = {}) {
  return {
    ...report,
    markdown: undefined
  };
}

function validatePreflight(preflight, reasons, warnings) {
  if (!preflight) {
    reasons.push("Missing approval preflight");
    return;
  }
  if (preflight.valid !== true || preflight.ready !== true) {
    reasons.push(...prefixReasons("Approval preflight", preflight.reasons));
    if ((preflight.reasons || []).length === 0) reasons.push(`Approval preflight is not ready: ${preflight.status || "unknown"}`);
  }
  if (!preflight.action?.approvalId) reasons.push("Approval preflight is missing the primary action");
  warnings.push(...prefixReasons("Approval preflight warning", preflight.warnings));
}

function validateDraftPacket(packet, action, reasons, warnings) {
  if (!packet || typeof packet !== "object" || Array.isArray(packet)) {
    reasons.push("Missing draft packet JSON for approval request");
    return;
  }
  if (action?.approvalId && packet.approvalId !== action.approvalId) reasons.push("Draft packet approvalId does not match preflight action");
  if (action?.actionType && packet.actionType !== action.actionType) reasons.push("Draft packet actionType does not match preflight action");
  if (packet.status !== "draft") reasons.push("Draft packet must still have status=draft before action-time approval");
  if (String(packet.approvedBy || "").trim()) reasons.push("Draft packet approvedBy must still be empty");
  if (String(packet.approvedAt || "").trim()) reasons.push("Draft packet approvedAt must still be empty");
  if (packet.action?.executionMode !== "human_only") reasons.push("Draft packet action.executionMode must be human_only");
  if (packet.action?.automated !== false) reasons.push("Draft packet action.automated must be false");

  const trueFlags = APPROVAL_FLAGS.filter((flag) => packet.approvals?.[flag] === true);
  if (trueFlags.length > 0) reasons.push(`Draft packet must not prefill approval flags: ${trueFlags.join(", ")}`);
  const missingFlags = APPROVAL_FLAGS.filter((flag) => !(flag in (packet.approvals || {})));
  if (missingFlags.length > 0) reasons.push(`Draft packet is missing approval flags: ${missingFlags.join(", ")}`);
  const nonFalseFlags = APPROVAL_FLAGS.filter((flag) => packet.approvals?.[flag] !== false);
  if (nonFalseFlags.length > 0) warnings.push(`Approval flags should be explicitly false before approval: ${nonFalseFlags.join(", ")}`);

  const exactText = exactTextForPacket(packet);
  if (["x_post", "merchant_outreach"].includes(packet.actionType) && !exactText) {
    reasons.push("Draft packet must include exact action text for review");
  }
  if (packet.actionType === "x_post" && exactText !== String(packet.payload?.post?.text || "")) {
    reasons.push("X post exactText must match payload.post.text");
  }
  if (packet.actionType === "merchant_outreach" && exactText !== String(packet.payload?.outreachDraft?.message || "")) {
    reasons.push("Outreach exactText must match payload.outreachDraft.message");
  }
}

function approvalCommandsFor({ action, packetPath, evidenceTemplatePath }) {
  const commands = [
    action?.approvalCommand || (packetPath ? `npm run external-action-approval -- ${packetPath}` : "npm run external-action-approval -- <approved-packet.json>"),
    action?.evidenceValidationCommand || (evidenceTemplatePath ? evidenceValidationCommandFor(action?.actionType, evidenceTemplatePath) : "npm run <matching-execution-evidence-validator> -- <filled-evidence.json>")
  ];

  if (action?.actionType === "x_post") {
    commands.push(
      "npm run execution-evidence-ledger-entry -- <filled-x-post-evidence.json>",
      "npm run state-update-preview -- work/execution-evidence-ledger-entry.json",
      "npm run canonical-update-set -- work/execution-evidence-ledger-entry.json work/state-update-preview.json",
      "npm run x-post-state -- ops/x_post_execution_records.json"
    );
  } else if (action?.actionType === "merchant_outreach") {
    commands.push(
      "npm run execution-evidence-ledger-entry -- <filled-outreach-evidence.json>",
      "npm run state-update-preview -- work/execution-evidence-ledger-entry.json",
      "npm run canonical-update-set -- work/execution-evidence-ledger-entry.json work/state-update-preview.json",
      "npm run outreach-state -- ops/outreach_execution_records.json"
    );
  } else if (action?.actionType === "controller_policy_signature") {
    commands.push("ALLOW_POLICY_PATH=<signed-policy.json> npm run readiness");
  } else if (action?.actionType === "live_pilot") {
    commands.push("npm run pilot-report -- <receipt-log.jsonl>", "npm run pilot-integration-state");
  }

  return commands;
}

function buildMarkdown({
  generatedAt,
  status,
  action,
  packet,
  packetPath,
  evidenceTemplatePath,
  exactText,
  approvalCommands,
  reasons,
  warnings
}) {
  const lines = [
    "# Allow Action-Time Approval Request",
    "",
    `Generated: ${generatedAt}`,
    `Status: ${status}`,
    "",
    "## Safety Boundary",
    "",
    "- This request is local review material only.",
    "- It does not approve the packet, post to X, send outreach, schedule interviews, sign wallet payloads, deploy contracts, start pilot traffic, promote merchants, move funds, store secrets, update canonical state, or enable tokens.",
    "- If approval is granted, edit the packet only after action-time review and run the approval validator before any human execution.",
    ""
  ];

  if (action || packet) {
    lines.push(
      "## Decision",
      "",
      `- Approval id: \`${action?.approvalId || packet?.approvalId || "unknown"}\``,
      `- Type: \`${action?.actionType || packet?.actionType || "unknown"}\``,
      `- Destination: \`${action?.destination || packet?.action?.destination || "unknown"}\``,
      `- Packet: \`${packetPath || "unknown"}\``,
      `- Evidence template: \`${evidenceTemplatePath || "unknown"}\``,
      `- Packet status now: \`${packet?.status || "missing"}\``,
      ""
    );
  }

  if (exactText) {
    lines.push("## Exact Action Text", "", fencedText(exactText), "");
  }

  lines.push(
    "## If Approved",
    "",
    "- Set `status` to `approved`.",
    "- Fill `approvedBy` with the real reviewer.",
    "- Fill `approvedAt` with the real approval timestamp.",
    "- Set every approval flag to `true` only after review.",
    "- Run the approval command and require a passing result before execution.",
    "",
    "Commands:",
    ""
  );
  for (const command of approvalCommands) lines.push(`- \`${command}\``);
  lines.push("");

  if (reasons.length > 0) {
    lines.push("## Request Needs Fixes", "");
    for (const reason of unique(reasons)) lines.push(`- ${reason}`);
    lines.push("");
  }

  if (warnings.length > 0) {
    lines.push("## Warnings", "");
    for (const warning of unique(warnings)) lines.push(`- ${warning}`);
    lines.push("");
  }

  lines.push(
    "## If Not Approved",
    "",
    "- Leave the packet in draft or mark it rejected.",
    "- Do not execute the action.",
    "- Do not create execution evidence, update canonical state, or make public claims."
  );

  return lines.join("\n");
}

function actionSummary(action = {}, packet = {}) {
  return {
    approvalId: action.approvalId || packet.approvalId || null,
    stageId: action.stageId || null,
    actionType: action.actionType || packet.actionType || null,
    title: action.title || packet.action?.summary || null,
    destination: action.destination || packet.action?.destination || null,
    channel: action.channel || packet.action?.channel || null,
    approvalCommand: action.approvalCommand || null,
    evidenceValidationCommand: action.evidenceValidationCommand || null
  };
}

function exactTextForPacket(packet = {}) {
  return String(packet?.action?.exactText || packet?.payload?.post?.text || packet?.payload?.outreachDraft?.message || "");
}

function evidenceValidationCommandFor(actionType, evidenceTemplatePath) {
  if (actionType === "x_post") return `npm run x-post-execution-evidence -- ${evidenceTemplatePath}`;
  if (actionType === "merchant_outreach") return `npm run outreach-execution-evidence -- ${evidenceTemplatePath}`;
  if (actionType === "controller_policy_signature") return `npm run controller-signing-execution-evidence -- ${evidenceTemplatePath}`;
  if (actionType === "live_pilot") return `npm run pilot-traffic-execution-evidence -- ${evidenceTemplatePath} <receipt-log-path>`;
  return `npm run <matching-execution-evidence-validator> -- ${evidenceTemplatePath}`;
}

function statusForRequest({ valid, preflight, packet, action }) {
  if (valid) return "ready_for_human_decision";
  if (!preflight || preflight.valid !== true || preflight.ready !== true) return "needs_preflight_fixes";
  if (!action) return "no_action_ready";
  if (!packet || packet.status !== "draft") return "needs_packet_fixes";
  return "needs_packet_fixes";
}

function nextActionForStatus(status) {
  const actions = {
    needs_preflight_fixes: "Fix or regenerate the approval preflight before requesting action-time approval.",
    needs_packet_fixes: "Fix or regenerate the draft packet before requesting action-time approval.",
    no_action_ready: "Wait until an external-action packet is ready for approval request."
  };
  return actions[status] || "Fix the approval request inputs before any external action.";
}

function sensitiveFlagsFor(text) {
  return SENSITIVE_TEXT_PATTERNS
    .filter((item) => item.pattern.test(String(text || "")))
    .map(({ id, reason }) => ({ id, reason }));
}

function prefixReasons(prefix, values = []) {
  return [...new Set((values || []).filter(Boolean).map((value) => `${prefix}: ${value}`))];
}

function fencedText(text) {
  return ["```text", String(text || "").replace(/```/g, "'''"), "```"].join("\n");
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
