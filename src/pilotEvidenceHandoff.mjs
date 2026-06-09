export const PILOT_EVIDENCE_HANDOFF_STATUSES = [
  "ready_for_pilot_evidence_collection",
  "blocked_by_preflight",
  "pilot_evidence_complete"
];

export function buildPilotEvidenceHandoff(input = {}, options = {}) {
  const generatedAt = options.generatedAt || new Date().toISOString();
  const trafficActionPack = plainObject(input.trafficActionPack);
  const pilotEvidence = plainObject(input.pilotEvidence || input.pilotReport);
  const paths = normalizePaths(input.paths || {});
  const requests = requestSummaries(trafficActionPack.requests);
  const packets = packetSummaries(trafficActionPack.packets);
  const actionPackReady = trafficActionPack.valid === true;
  const evidenceComplete = pilotEvidence.valid === true;
  const merchantId = firstText(
    input.merchantId,
    trafficActionPack.preflight?.merchantId,
    requests[0]?.merchantId,
    pilotEvidence.required?.merchantId
  );
  const receiptLogPath = firstText(
    input.receiptLogPath,
    trafficActionPack.preflight?.receiptPath,
    paths.receiptLog
  );
  const blockers = blockersFor({
    trafficActionPack,
    actionPackReady,
    evidenceComplete,
    requests,
    packets,
    merchantId,
    receiptLogPath
  });
  const evidenceGaps = evidenceComplete
    ? []
    : (Array.isArray(pilotEvidence.reasons) ? pilotEvidence.reasons.map((reason) => `pilot evidence: ${reason}`) : []);
  const warnings = unique([
    ...(Array.isArray(input.sourceWarnings) ? input.sourceWarnings : []),
    ...(Array.isArray(trafficActionPack.warnings) ? trafficActionPack.warnings.map((warning) => `traffic action pack: ${warning}`) : []),
    ...(Array.isArray(pilotEvidence.warnings) ? pilotEvidence.warnings.map((warning) => `pilot evidence: ${warning}`) : [])
  ]);
  const status = evidenceComplete
    ? "pilot_evidence_complete"
    : actionPackReady && blockers.length === 0
      ? "ready_for_pilot_evidence_collection"
      : "blocked_by_preflight";
  const commands = commandSet(paths, receiptLogPath);
  const acceptanceCriteria = [
    "Live pilot preflight passes before any traffic is approved.",
    "Exactly two live_pilot packets are approved by a human: one allowed delivery and one denied guard.",
    "Allowed delivery execution evidence validates with a merchant-approved 2xx receipt.",
    "Denied guard execution evidence validates with a merchant-approved denied receipt and no upstream 2xx delivery.",
    "npm run pilot-report passes for the same receipt log before any usage, merchant-live, or distribution claim is made."
  ];
  const nextAction = nextActionFor(status, blockers);
  const markdown = buildMarkdown({
    generatedAt,
    status,
    merchantId,
    receiptLogPath,
    actionPackReady,
    evidenceComplete,
    requests,
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
    merchantId: merchantId || null,
    receiptLogPath: receiptLogPath || null,
    actionPack: {
      valid: actionPackReady,
      status: trafficActionPack.status || null,
      requestCount: requests.length,
      packetCount: packets.length,
      preflightStatus: trafficActionPack.preflight?.status || null,
      preflightValid: trafficActionPack.preflight?.valid === true
    },
    pilotEvidence: {
      valid: evidenceComplete,
      required: pilotEvidence.required || null,
      credibleAcceptanceSignals: pilotEvidence.credibleAcceptanceSignals || null
    },
    requests,
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
      startsPilotTraffic: false,
      approvesExternalAction: false,
      postsContent: false,
      sendsOutreach: false,
      signsWalletPayloads: false,
      deploysContracts: false,
      movesFunds: false,
      storesSecrets: false,
      promotesMerchant: false,
      approvesPublicClaims: false,
      enablesToken: false,
      requiresHumanApproval: true,
      finalExternalActionApprovalRequired: true
    }
  };
}

export function publicPilotEvidenceHandoffReport(report = {}) {
  return {
    ...report,
    markdown: undefined
  };
}

function blockersFor({
  trafficActionPack,
  actionPackReady,
  evidenceComplete,
  requests,
  packets,
  merchantId,
  receiptLogPath
}) {
  if (evidenceComplete) return [];

  const blockers = [];
  if (!actionPackReady) {
    const reasons = Array.isArray(trafficActionPack.reasons) ? trafficActionPack.reasons : [];
    blockers.push(...(reasons.length ? reasons.map((reason) => `traffic action pack: ${reason}`) : ["traffic action pack is not ready"]));
  }
  if (!merchantId) blockers.push("No pilot merchant id is selected");
  if (!receiptLogPath) blockers.push("No pilot receipt log path is selected");
  if (requests.length !== 2) blockers.push("Pilot traffic handoff needs exactly two request drafts");
  if (!requests.some((request) => request.step === "allowed_delivery")) blockers.push("Missing allowed_delivery request draft");
  if (!requests.some((request) => request.step === "denied_guard")) blockers.push("Missing denied_guard request draft");
  if (packets.length !== 2) blockers.push("Pilot traffic handoff needs exactly two external-action packets");
  return unique(blockers);
}

function commandSet(paths, receiptLogPath) {
  const receiptLog = receiptLogPath || paths.receiptLog;
  return {
    prepareActionPack: `npm run pilot-traffic-action-pack -- ${paths.binding} ${paths.policy} ${paths.gateway} ${paths.dispute}`,
    approveAllowedTraffic: "npm run external-action-approval -- <approved-allowed-live-pilot-packet.json>",
    approveDeniedTraffic: "npm run external-action-approval -- <approved-denied-live-pilot-packet.json>",
    validateAllowedExecution: `npm run pilot-traffic-execution-evidence -- ${paths.allowedExecutionEvidence} ${receiptLog}`,
    validateDeniedExecution: `npm run pilot-traffic-execution-evidence -- ${paths.deniedExecutionEvidence} ${receiptLog}`,
    pilotReport: `npm run pilot-report -- ${receiptLog}`,
    pilotDisclosure: `npm run pilot-disclosure -- ${paths.pilotDisclosure} ${receiptLog}`,
    pilotIntegrationState: `npm run pilot-integration-state -- ${paths.pilotTrafficExecutionRecords} ${receiptLog}`
  };
}

function buildMarkdown({
  generatedAt,
  status,
  merchantId,
  receiptLogPath,
  actionPackReady,
  evidenceComplete,
  requests,
  packets,
  commands,
  acceptanceCriteria,
  blockers,
  evidenceGaps,
  warnings,
  nextAction
}) {
  const lines = [
    "# Allow Pilot Evidence Handoff",
    "",
    `Generated: ${generatedAt}`,
    `Status: ${status}`,
    `Merchant: ${merchantId || "not selected"}`,
    `Receipt log: ${receiptLogPath || "not selected"}`,
    "",
    "## Safety Boundary",
    "",
    "- This handoff is local review material only.",
    "- It does not start pilot traffic, approve external actions, post content, send outreach, sign wallet payloads, deploy contracts, move funds, store secrets, promote merchants, approve public claims, or enable a token.",
    "- Live pilot traffic requires human approval for the exact command and post-execution evidence for each request.",
    ""
  ];

  lines.push("## Current State", "");
  lines.push(`- Traffic action pack ready: ${actionPackReady ? "yes" : "no"}`);
  lines.push(`- Pilot evidence complete: ${evidenceComplete ? "yes" : "no"}`);
  lines.push(`- Request drafts: ${requests.length}`);
  lines.push(`- External-action packets: ${packets.length}`);
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

  lines.push("## Request Drafts", "");
  if (requests.length === 0) {
    lines.push("No pilot request drafts are ready yet.", "");
  } else {
    for (const request of requests) {
      lines.push(`- \`${request.step}\` for \`${request.merchantId || "unknown"}\`: ${request.expectedOutcome || "expected outcome pending"}`);
    }
    lines.push("");
  }

  lines.push("## Packet Review", "");
  if (packets.length === 0) {
    lines.push("No live_pilot external-action packets are ready yet.", "");
  } else {
    for (const packet of packets) {
      lines.push(`- \`${packet.approvalId}\` (${packet.status || "draft"}): ${packet.summary || "review exact command"}`);
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

function requestSummaries(value) {
  return Array.isArray(value)
    ? value.map((request) => ({
        step: request.step || null,
        merchantId: request.merchantId || null,
        destination: request.destination || null,
        expectedOutcome: request.expectedOutcome || null,
        receiptPath: request.receiptPath || null,
        commandPresent: Boolean(request.command)
      }))
    : [];
}

function packetSummaries(value) {
  return Array.isArray(value)
    ? value.map((packet) => ({
        approvalId: packet.approvalId || null,
        actionType: packet.actionType || null,
        status: packet.status || null,
        summary: packet.action?.summary || null,
        destination: packet.action?.destination || null,
        pilotStep: packet.payload?.pilotStep || null,
        executionMode: packet.action?.executionMode || null
      }))
    : [];
}

function normalizePaths(paths = {}) {
  return {
    binding: paths.binding || "ops/pilot_binding.template.json",
    policy: paths.policy || "ops/signed-policy.local.json",
    gateway: paths.gateway || "ops/gateway.x402.example.json",
    dispute: paths.dispute || "ops/dispute_template.json",
    receiptLog: paths.receiptLog || "ops/gateway-receipts.pilot.jsonl",
    allowedExecutionEvidence: paths.allowedExecutionEvidence || "work/pilot-traffic-allowed-execution.json",
    deniedExecutionEvidence: paths.deniedExecutionEvidence || "work/pilot-traffic-denied-execution.json",
    pilotDisclosure: paths.pilotDisclosure || "ops/pilot_disclosure_template.json",
    pilotTrafficExecutionRecords: paths.pilotTrafficExecutionRecords || "ops/pilot_traffic_execution_records.json"
  };
}

function nextActionFor(status, blockers) {
  if (status === "pilot_evidence_complete") {
    return "Use approved pilot disclosure and integration-state tooling before making any public usage or merchant-live claim.";
  }
  if (status === "ready_for_pilot_evidence_collection") {
    return "Review and approve the two live_pilot packets one at a time, execute them manually, then validate both execution evidence records and run pilot-report.";
  }
  const text = blockers.join("\n");
  if (/policy JSON|policy missing|Policy must be|signed policy/i.test(text)) {
    return "Create the signed production policy outside the repository, set ALLOW_POLICY_PATH, then rerun the pilot evidence handoff.";
  }
  if (/pilot\.merchantId|pilot binding|walletControl|controlSignature/i.test(text)) {
    return "Fill the merchant-approved pilot binding and wallet-control evidence, then rerun the pilot evidence handoff.";
  }
  if (/gateway|merchant approval|payment requirements/i.test(text)) {
    return "Fill the merchant-approved live gateway config and payment requirements, then rerun the pilot evidence handoff.";
  }
  return "Fix live pilot preflight and evidence inputs before approving pilot traffic.";
}

function firstText(...values) {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return "";
}

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
