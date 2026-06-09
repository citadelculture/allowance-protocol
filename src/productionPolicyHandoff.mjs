export const PRODUCTION_POLICY_HANDOFF_STATUSES = [
  "blocked_by_policy_template",
  "ready_for_controller_signature",
  "signed_policy_verified"
];

export function buildProductionPolicyHandoff(input = {}, options = {}) {
  const generatedAt = options.generatedAt || new Date().toISOString();
  const actionPack = plainObject(input.actionPack);
  const executionEvidence = plainObject(input.executionEvidenceReport || input.executionEvidence);
  const paths = normalizePaths(input.paths || {});
  const packets = packetSummaries(actionPack.packets);
  const actionPackReady = actionPack.valid === true;
  const signedPolicyVerified = executionEvidence.valid === true;
  const signing = plainObject(actionPack.signing);
  const controller = firstText(input.controller, signing.controller, packets[0]?.walletAddress);
  const policyId = firstText(input.policyId, signing.policyId, packets[0]?.policyId);
  const fingerprint = firstText(input.fingerprint, signing.fingerprint, packets[0]?.policyFingerprint);
  const blockers = blockersFor({
    actionPack,
    actionPackReady,
    signedPolicyVerified,
    controller,
    packets,
    sourceErrors: input.sourceErrors
  });
  const evidenceGaps = signedPolicyVerified
    ? []
    : (Array.isArray(executionEvidence.reasons) ? executionEvidence.reasons.map((reason) => `controller signing evidence: ${reason}`) : []);
  const warnings = unique([
    ...(Array.isArray(input.sourceWarnings) ? input.sourceWarnings : []),
    ...(Array.isArray(actionPack.warnings) ? actionPack.warnings.map((warning) => `controller signing action pack: ${warning}`) : []),
    ...(Array.isArray(executionEvidence.warnings) ? executionEvidence.warnings.map((warning) => `controller signing evidence: ${warning}`) : [])
  ]);
  const status = signedPolicyVerified
    ? "signed_policy_verified"
    : actionPackReady && blockers.length === 0
      ? "ready_for_controller_signature"
      : "blocked_by_policy_template";
  const commands = commandSet(paths, controller);
  const acceptanceCriteria = [
    "Production policy template uses a real 20-byte controller address.",
    "controller_policy_signature packet is approved by a human owner before signing.",
    "Typed data is signed in a wallet UI, hardware wallet, Safe, or approved wallet flow without exposing private-key material.",
    "Signed policy JSON is stored outside the repository or in a gitignored local path.",
    "controller-signing-execution-evidence passes before ALLOW_POLICY_PATH is used for pilot runtime."
  ];
  const nextAction = nextActionFor(status, blockers);
  const markdown = buildMarkdown({
    generatedAt,
    status,
    controller,
    policyId,
    fingerprint,
    actionPackReady,
    signedPolicyVerified,
    packets,
    commands,
    acceptanceCriteria,
    blockers,
    evidenceGaps,
    warnings,
    nextAction
  });

  return {
    generatedAt,
    valid: true,
    status,
    controller: controller || null,
    policyId: policyId || null,
    fingerprint: fingerprint || null,
    actionPack: {
      valid: actionPackReady,
      status: actionPack.status || null,
      packetCount: packets.length,
      signingStatus: signing.status || null
    },
    controllerSigningEvidence: {
      valid: signedPolicyVerified,
      status: executionEvidence.status || null,
      policy: executionEvidence.policy || null,
      storage: executionEvidence.storage || null
    },
    packets,
    commands,
    acceptanceCriteria,
    blockers,
    evidenceGaps,
    warnings,
    markdown,
    nextAction,
    evidenceBoundary: {
      readsLocalReports: true,
      writesFiles: false,
      approvesExternalAction: false,
      signsWalletPayloads: false,
      signsPolicy: false,
      storesSignedPolicy: false,
      storesSecrets: false,
      startsRuntime: false,
      startsPilotTraffic: false,
      deploysContracts: false,
      movesFunds: false,
      postsContent: false,
      sendsOutreach: false,
      enablesToken: false,
      requiresHumanApproval: true,
      finalExternalActionApprovalRequired: true
    }
  };
}

export function publicProductionPolicyHandoffReport(report = {}) {
  return {
    ...report,
    markdown: undefined
  };
}

function blockersFor({ actionPack, actionPackReady, signedPolicyVerified, controller, packets, sourceErrors }) {
  if (signedPolicyVerified) return [];

  const blockers = [];
  blockers.push(...(Array.isArray(sourceErrors) ? sourceErrors : []));
  if (!actionPackReady) {
    const reasons = Array.isArray(actionPack.reasons) ? actionPack.reasons : [];
    blockers.push(...(reasons.length ? reasons.map((reason) => `controller signing action pack: ${reason}`) : ["controller signing action pack is not ready"]));
  }
  if (!controller) blockers.push("No controller wallet address is selected");
  if (packets.length !== 1) blockers.push("Production policy handoff needs exactly one controller_policy_signature packet");
  if (packets[0] && packets[0].actionType !== "controller_policy_signature") {
    blockers.push("Controller signing packet actionType must be controller_policy_signature");
  }
  return unique(blockers);
}

function commandSet(paths, controller) {
  const controllerArg = isEvmAddress(controller) ? controller : "<controller-address>";
  return {
    signingPacket: `npm run policy-signing-packet -- ${paths.policyTemplate} ${controllerArg}`,
    actionPack: `npm run controller-signing-action-pack -- ${paths.policyTemplate} ${controllerArg}`,
    approvePacket: "npm run external-action-approval -- <approved-controller-signing-packet.json>",
    validateExecutionEvidence: `npm run controller-signing-execution-evidence -- ${paths.executionEvidence}`,
    verifySignedPolicy: "npm run verify-policy -- <signed-policy.json>",
    ceremonyAudit: `ALLOW_PRODUCTION=1 ALLOW_REQUIRE_AGENT_SIGNATURE=1 ALLOW_EXPECTED_CONTROLLER=${controllerArg} npm run ceremony-audit -- <signed-policy.json>`,
    readinessWithPolicy: "ALLOW_POLICY_PATH=<signed-policy.json> npm run readiness",
    pilotEvidenceHandoff: "ALLOW_POLICY_PATH=<signed-policy.json> npm run pilot-evidence-handoff"
  };
}

function buildMarkdown({
  generatedAt,
  status,
  controller,
  policyId,
  fingerprint,
  actionPackReady,
  signedPolicyVerified,
  packets,
  commands,
  acceptanceCriteria,
  blockers,
  evidenceGaps,
  warnings,
  nextAction
}) {
  const lines = [
    "# Allow Production Policy Handoff",
    "",
    `Generated: ${generatedAt}`,
    `Status: ${status}`,
    `Controller: ${controller || "not selected"}`,
    `Policy: ${policyId || "unknown"}`,
    `Fingerprint: ${fingerprint || "unknown"}`,
    "",
    "## Safety Boundary",
    "",
    "- This handoff is local review material only.",
    "- It does not approve external actions, sign wallet payloads, store signed policies, store secrets, start runtime, start pilot traffic, deploy contracts, move funds, post content, send outreach, or enable a token.",
    "- The controller wallet owner must approve the exact packet before signing typed data.",
    ""
  ];

  lines.push("## Current State", "");
  lines.push(`- Controller signing action pack ready: ${actionPackReady ? "yes" : "no"}`);
  lines.push(`- Controller signing evidence verified: ${signedPolicyVerified ? "yes" : "no"}`);
  lines.push(`- Controller signing packets: ${packets.length}`);
  lines.push("");

  if (blockers.length > 0) {
    lines.push("## Blockers", "");
    for (const blocker of blockers) lines.push(`- ${blocker}`);
    lines.push("");
  }

  if (evidenceGaps.length > 0) {
    lines.push("## Evidence Gaps", "");
    for (const gap of evidenceGaps) lines.push(`- ${gap}`);
    lines.push("");
  }

  lines.push("## Packet Review", "");
  if (packets.length === 0) {
    lines.push("No controller_policy_signature packet is ready yet.", "");
  } else {
    for (const packet of packets) {
      lines.push(`- \`${packet.approvalId}\` (${packet.status || "draft"}): ${packet.summary || "review exact typed data"}`);
    }
    lines.push("");
  }

  lines.push("## Commands", "");
  for (const [label, command] of Object.entries(commands)) {
    lines.push(`- ${label}: \`${command}\``);
  }
  lines.push("");

  lines.push("## Acceptance Criteria", "");
  for (const item of acceptanceCriteria) lines.push(`- ${item}`);
  lines.push("");

  if (warnings.length > 0) {
    lines.push("## Warnings", "");
    for (const warning of warnings) lines.push(`- ${warning}`);
    lines.push("");
  }

  lines.push("## Next Action", "", nextAction);
  return lines.join("\n");
}

function packetSummaries(value) {
  return Array.isArray(value)
    ? value.map((packet) => ({
        approvalId: packet.approvalId || null,
        actionType: packet.actionType || null,
        status: packet.status || null,
        summary: packet.action?.summary || null,
        destination: packet.action?.destination || null,
        walletAddress: packet.action?.walletAddress || packet.payload?.controller || null,
        policyId: packet.payload?.policyId || null,
        policyFingerprint: packet.payload?.policyFingerprint || null,
        executionMode: packet.action?.executionMode || null
      }))
    : [];
}

function normalizePaths(paths = {}) {
  return {
    policyTemplate: paths.policyTemplate || "allow-policy.example.json",
    executionEvidence: paths.executionEvidence || "ops/controller_signing_execution_template.json"
  };
}

function nextActionFor(status, blockers) {
  if (status === "signed_policy_verified") {
    return "Set ALLOW_POLICY_PATH or ALLOW_POLICY_JSON for production-mode readiness and rerun the pilot evidence handoff.";
  }
  if (status === "ready_for_controller_signature") {
    return "Review the controller_policy_signature packet, record action-time approval, sign typedData with the controller wallet, then validate controller signing execution evidence.";
  }
  const text = blockers.join("\n");
  if (/20-byte EVM address|controller wallet|No controller/i.test(text)) {
    return "Set ALLOW_EXPECTED_CONTROLLER to the real controller wallet address and regenerate the production policy handoff.";
  }
  return "Fix the production policy template before preparing a controller signing approval packet.";
}

function firstText(...values) {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return "";
}

function isEvmAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(value || "").trim());
}

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
