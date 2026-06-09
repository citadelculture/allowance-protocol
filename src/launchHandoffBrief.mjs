export const LAUNCH_HANDOFF_BRIEF_STATUSES = [
  "ready_for_human_handoff",
  "blocked_by_evidence",
  "needs_launch_fixes",
  "complete"
];

export function buildLaunchHandoffBrief(input = {}, options = {}) {
  const generatedAt = options.generatedAt || new Date().toISOString();
  const readiness = input.readiness || {};
  const launchSequence = input.launchSequence || {};
  const externalActionReviewBrief = input.externalActionReviewBrief || null;
  const interviewReviewBrief = input.interviewReviewBrief || null;
  const reasons = [
    ...(Array.isArray(launchSequence.reasons) ? launchSequence.reasons : []),
    ...invalidBriefReasons("external action review brief", externalActionReviewBrief),
    ...invalidBriefReasons("interview review brief", interviewReviewBrief)
  ];
  const warnings = [
    ...(Array.isArray(launchSequence.warnings) ? launchSequence.warnings : []),
    ...missingBriefWarnings("external action review brief", externalActionReviewBrief),
    ...missingBriefWarnings("interview review brief", interviewReviewBrief)
  ];
  const stages = Array.isArray(launchSequence.stages) ? launchSequence.stages : [];
  const currentStage = stages.find((stage) => stage.id === launchSequence.currentStage) || stages.find((stage) => stage.status !== "complete") || null;
  const readyExternalActions = (externalActionReviewBrief?.actions || []).map(actionSummary);
  const interviewPrep = interviewReviewBrief
    ? {
        status: interviewReviewBrief.status || null,
        valid: interviewReviewBrief.valid === true,
        reviewActions: interviewReviewBrief.counts?.reviewActions || 0,
        totalQuestions: interviewReviewBrief.counts?.totalQuestions || 0,
        blockedCandidates: interviewReviewBrief.counts?.blockedCandidates || 0,
        shortfall: interviewReviewBrief.counts?.shortfall || 0,
        shortfallAfterPlan: interviewReviewBrief.counts?.shortfallAfterPlan || 0,
        firstCandidate: interviewReviewBrief.actions?.[0]?.candidateName || interviewReviewBrief.actions?.[0]?.candidateId || null,
        nextAction: interviewReviewBrief.nextAction || null
      }
    : null;
  const openReadinessGates = openGatesFromReadiness(readiness);
  const blockedStages = stages
    .filter((stage) => ["blocked", "waiting_for_evidence", "not_ready"].includes(stage.status))
    .map(stageSummary);
  const valid = launchSequence.valid !== false && reasons.length === 0;
  const status = statusForBrief({ valid, launchSequence, currentStage, readyExternalActions, blockedStages });
  const markdown = buildMarkdown({
    generatedAt,
    status,
    readiness,
    launchSequence,
    currentStage,
    readyExternalActions,
    interviewPrep,
    openReadinessGates,
    blockedStages,
    reasons,
    warnings
  });

  return {
    generatedAt,
    valid,
    status,
    readinessStatus: readiness.status || launchSequence.readinessStatus || null,
    launchSequenceStatus: launchSequence.status || null,
    currentStage: currentStage ? stageSummary(currentStage) : null,
    readyExternalActions,
    interviewPrep,
    openReadinessGates,
    blockedStages,
    counts: {
      stages: stages.length,
      readyExternalActions: readyExternalActions.length,
      openReadinessGates: openReadinessGates.length,
      blockedStages: blockedStages.length,
      interviewReviewActions: interviewPrep?.reviewActions || 0
    },
    markdown,
    reasons: unique(reasons),
    warnings: unique(warnings),
    nextAction: valid
      ? currentStage?.nextAction || launchSequence.nextAction || "Keep launch execution behind human approval and evidence"
      : "Fix the launch handoff inputs before any human action",
    evidenceBoundary: {
      readsLocalReports: true,
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
      enablesToken: false,
      approvesExternalAction: false,
      requiresHumanApproval: true
    }
  };
}

export function publicLaunchHandoffBriefReport(report = {}) {
  return {
    ...report,
    markdown: undefined
  };
}

function buildMarkdown({
  generatedAt,
  status,
  readiness,
  launchSequence,
  currentStage,
  readyExternalActions,
  interviewPrep,
  openReadinessGates,
  blockedStages,
  reasons,
  warnings
}) {
  const lines = [
    "# Allow Launch Handoff Brief",
    "",
    `Generated: ${generatedAt}`,
    `Status: ${status}`,
    `Readiness: ${readiness.status || launchSequence.readinessStatus || "unknown"}`,
    `Launch sequence: ${launchSequence.status || "unknown"}`,
    "",
    "## Safety Boundary",
    "",
    "- This brief is local handoff material only.",
    "- It does not post to X, send outreach, schedule interviews, sign wallet payloads, deploy contracts, start pilot traffic, promote merchants, move funds, store secrets, approve actions, or enable tokens.",
    "- Any external action still needs action-time approval plus post-execution evidence.",
    ""
  ];

  if (reasons.length > 0) {
    lines.push("## Handoff Needs Fixes", "");
    for (const reason of unique(reasons)) lines.push(`- ${reason}`);
    appendWarnings(lines, warnings);
    return lines.join("\n");
  }

  if (currentStage) {
    lines.push(
      "## Current Stage",
      "",
      `- Stage: \`${currentStage.id}\``,
      `- Title: ${currentStage.title || "untitled"}`,
      `- Status: \`${currentStage.status}\``,
      `- External action type: \`${currentStage.externalActionType || "none"}\``,
      `- Next action: ${currentStage.nextAction || "none"}`,
      ""
    );
    if ((currentStage.commands || []).length > 0) {
      lines.push("Commands:", "");
      for (const command of currentStage.commands) lines.push(`- \`${command}\``);
      lines.push("");
    }
    if ((currentStage.evidenceRequired || []).length > 0) {
      lines.push("Evidence required:", "");
      for (const item of currentStage.evidenceRequired) lines.push(`- ${item}`);
      lines.push("");
    }
  }

  lines.push("## Ready External Actions", "");
  if (readyExternalActions.length === 0) {
    lines.push("No draft external-action packets are ready for approval review.", "");
  } else {
    for (const action of readyExternalActions) {
      lines.push(
        `- \`${action.approvalId}\` (${action.actionType}) for ${action.destination || "unknown destination"}: ${action.title || "untitled"}`,
        `  Approval command: \`${action.approvalCommand || "npm run external-action-approval -- <approved-packet.json>"}\``
      );
    }
    lines.push("");
  }

  lines.push("## Interview Prep", "");
  if (!interviewPrep) {
    lines.push("No interview review brief was supplied.", "");
  } else {
    lines.push(
      `- Status: \`${interviewPrep.status}\``,
      `- Review actions: ${interviewPrep.reviewActions}`,
      `- Total questions: ${interviewPrep.totalQuestions}`,
      `- Blocked candidates: ${interviewPrep.blockedCandidates}`,
      `- Shortfall: ${interviewPrep.shortfall}`,
      `- Shortfall after prep batch: ${interviewPrep.shortfallAfterPlan}`,
      `- First candidate: ${interviewPrep.firstCandidate || "none"}`,
      `- Next action: ${interviewPrep.nextAction || "none"}`,
      ""
    );
  }

  if (blockedStages.length > 0) {
    lines.push("## Blocked Or Waiting Stages", "");
    for (const stage of blockedStages) {
      const blockers = stage.blockers.length > 0 ? stage.blockers.join("; ") : stage.openGates.join("; ") || "waiting for evidence";
      lines.push(`- \`${stage.id}\` (${stage.status}): ${blockers}`);
    }
    lines.push("");
  }

  if (openReadinessGates.length > 0) {
    lines.push("## Open Readiness Gates", "");
    for (const gate of openReadinessGates) lines.push(`- \`${gate.id}\` (${gate.status}): ${gate.message || "open"}`);
    lines.push("");
  }

  appendWarnings(lines, warnings);

  lines.push(
    "## Final Reminder",
    "",
    "Use this brief to choose the next approved human step. Record execution evidence immediately after any approved external action."
  );

  return lines.join("\n");
}

function stageSummary(stage = {}) {
  return {
    id: stage.id || null,
    title: stage.title || null,
    status: stage.status || null,
    externalActionType: stage.externalActionType || null,
    commands: Array.isArray(stage.commands) ? stage.commands : [],
    evidenceRequired: Array.isArray(stage.evidenceRequired) ? stage.evidenceRequired : [],
    openGates: Array.isArray(stage.openGates) ? stage.openGates : [],
    blockers: Array.isArray(stage.blockers) ? stage.blockers : [],
    nextAction: stage.nextAction || null
  };
}

function actionSummary(action = {}) {
  return {
    approvalId: action.approvalId || null,
    actionType: action.actionType || null,
    title: action.title || action.summary || null,
    destination: action.destination || null,
    channel: action.channel || null,
    approvalCommand: action.approvalCommand || null,
    packetPath: action.packetPath || null,
    evidenceTemplatePath: action.evidenceTemplatePath || null,
    approvalFlagsTrue: action.approvalFlags?.trueCount ?? null,
    approvalFlagsRequired: action.approvalFlags?.required ?? null
  };
}

function openGatesFromReadiness(readiness = {}) {
  if (Array.isArray(readiness.openGates)) {
    return readiness.openGates.map((gate) => ({
      id: gate.id || null,
      status: gate.status || null,
      message: gate.message || null
    }));
  }
  return (Array.isArray(readiness.gates) ? readiness.gates : [])
    .filter((gate) => gate.status !== "pass")
    .map((gate) => ({
      id: gate.id || null,
      status: gate.status || null,
      message: gate.message || null
    }));
}

function statusForBrief({ valid, launchSequence, currentStage, readyExternalActions, blockedStages }) {
  if (!valid) return "needs_launch_fixes";
  if (launchSequence.status === "complete") return "complete";
  if (readyExternalActions.length > 0 || currentStage?.status === "ready_for_human_action") {
    return "ready_for_human_handoff";
  }
  if (blockedStages.length > 0) return "blocked_by_evidence";
  return "ready_for_human_handoff";
}

function invalidBriefReasons(label, brief) {
  if (!brief || brief.valid !== false) return [];
  const reasons = Array.isArray(brief.reasons) ? brief.reasons : [];
  return reasons.length > 0
    ? reasons.map((reason) => `${label}: ${reason}`)
    : [`${label} is invalid`];
}

function missingBriefWarnings(label, brief) {
  return brief ? [] : [`${label} was not supplied`];
}

function appendWarnings(lines, warnings) {
  if (!warnings.length) return;
  lines.push("## Warnings", "");
  for (const warning of unique(warnings)) lines.push(`- ${warning}`);
  lines.push("");
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
