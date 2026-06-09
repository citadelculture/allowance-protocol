export const INTERVIEW_COMPLETION_HANDOFF_STATUSES = [
  "blocked_by_prep",
  "ready_for_interview_execution",
  "interviews_complete"
];

export function buildInterviewCompletionHandoff(input = {}, options = {}) {
  const generatedAt = options.generatedAt || new Date().toISOString();
  const reviewBrief = plainObject(input.reviewBrief);
  const evidenceReport = plainObject(input.interviewEvidenceReport || input.evidenceReport);
  const paths = normalizePaths(input.paths || {});
  const actions = completionActions(reviewBrief.actions);
  const reviewReady = reviewBrief.valid === true && reviewBrief.status === "ready_for_interview_review";
  const interviewsComplete = evidenceReport.valid === true;
  const minimumCompleted = numberOrDefault(evidenceReport.minimumCompleted, reviewBrief.counts?.shortfall || 5);
  const validCompletedCount = numberOrDefault(evidenceReport.validCompletedCount, 0);
  const shortfall = Math.max(0, minimumCompleted - validCompletedCount);
  const blockers = blockersFor({
    reviewBrief,
    reviewReady,
    interviewsComplete,
    shortfall,
    actions,
    sourceErrors: input.sourceErrors
  });
  const evidenceGaps = interviewsComplete
    ? []
    : evidenceGapsFor(evidenceReport);
  const warnings = unique([
    ...(Array.isArray(input.sourceWarnings) ? input.sourceWarnings : []),
    ...(Array.isArray(reviewBrief.warnings) ? reviewBrief.warnings.map((warning) => `interview review brief: ${warning}`) : []),
    ...(Array.isArray(evidenceReport.warnings) ? evidenceReport.warnings.map((warning) => `interview evidence: ${warning}`) : [])
  ]);
  const status = interviewsComplete
    ? "interviews_complete"
    : blockers.length === 0 && actions.length > 0
      ? "ready_for_interview_execution"
      : "blocked_by_prep";
  const commands = commandSet(paths);
  const acceptanceCriteria = [
    "Every counted interview has status completed, completedAt, completedBy, and a concise summary.",
    "Every counted interview includes at least five answered questions or explicit answer text.",
    "Every counted interview confirms productFeedbackOnly, noTokenPitch, noSecretsRequested, and merchantUnderstandsPrototype.",
    "Every counted interview links to a merchant intake JSON that passes npm run validate-merchant.",
    "ops/interviews.json passes npm run interview-report before any interview counts toward launch readiness."
  ];
  const nextAction = nextActionFor(status, shortfall, actions, blockers);
  const markdown = buildMarkdown({
    generatedAt,
    status,
    reviewBrief,
    evidenceReport,
    actions,
    commands,
    acceptanceCriteria,
    blockers,
    evidenceGaps,
    warnings,
    minimumCompleted,
    validCompletedCount,
    shortfall,
    nextAction
  });

  return {
    generatedAt,
    valid: true,
    status,
    reviewBrief: {
      valid: reviewBrief.valid === true,
      status: reviewBrief.status || null,
      reviewActions: actions.length,
      shortfall: numberOrDefault(reviewBrief.counts?.shortfall, shortfall),
      shortfallAfterPlan: numberOrDefault(reviewBrief.counts?.shortfallAfterPlan, shortfall)
    },
    interviewEvidence: {
      valid: interviewsComplete,
      minimumCompleted,
      completedCount: numberOrDefault(evidenceReport.completedCount, 0),
      validCompletedCount,
      invalidCompletedCount: numberOrDefault(evidenceReport.invalidCompletedCount, 0),
      scheduledCount: numberOrDefault(evidenceReport.scheduledCount, 0),
      validScheduledCount: numberOrDefault(evidenceReport.validScheduledCount, 0),
      invalidScheduledCount: numberOrDefault(evidenceReport.invalidScheduledCount, 0)
    },
    actions,
    commands,
    acceptanceCriteria,
    blockers,
    evidenceGaps,
    warnings,
    markdown,
    nextAction,
    evidenceBoundary: {
      readsLocalInterviewPrep: true,
      readsLocalInterviewEvidence: true,
      writesFiles: false,
      sendsOutreach: false,
      schedulesInterviews: false,
      countsInterviews: false,
      createsMerchantApproval: false,
      startsPilotTraffic: false,
      postsContent: false,
      signsWalletPayloads: false,
      deploysContracts: false,
      movesFunds: false,
      requestsSecrets: false,
      storesSecrets: false,
      tokenPitch: false,
      enablesToken: false,
      requiresHumanApproval: true
    }
  };
}

export function publicInterviewCompletionHandoffReport(report = {}) {
  return {
    ...report,
    markdown: undefined
  };
}

function blockersFor({ reviewBrief, reviewReady, interviewsComplete, shortfall, actions, sourceErrors }) {
  if (interviewsComplete) return [];

  const blockers = [...(Array.isArray(sourceErrors) ? sourceErrors : [])];
  if (!reviewReady) {
    const reasons = Array.isArray(reviewBrief.reasons) ? reviewBrief.reasons : [];
    blockers.push(...(reasons.length ? reasons.map((reason) => `interview review brief: ${reason}`) : ["interview review brief is not ready"]));
  }
  if (shortfall > 0 && actions.length === 0) {
    blockers.push("No review-ready interview actions are available for the current shortfall");
  }
  return unique(blockers);
}

function evidenceGapsFor(report) {
  const gaps = [];
  if (Array.isArray(report.reasons)) {
    gaps.push(...report.reasons.map((reason) => `interview evidence: ${reason}`));
  }
  for (const record of Array.isArray(report.records) ? report.records : []) {
    if (record.status === "completed" && record.valid !== true) {
      for (const reason of Array.isArray(record.reasons) ? record.reasons : []) {
        gaps.push(`interview ${record.id || "unknown"}: ${reason}`);
      }
    }
    if (record.status === "scheduled" && record.valid !== true) {
      for (const reason of Array.isArray(record.reasons) ? record.reasons : []) {
        gaps.push(`scheduled interview ${record.id || "unknown"}: ${reason}`);
      }
    }
  }
  return unique(gaps);
}

function commandSet(paths) {
  return {
    prepareWorkspace: "npm run interview-workspace",
    auditWorkspace: "npm run interview-workspace-audit",
    reviewBrief: "npm run interview-review-brief",
    validateIntake: "npm run validate-merchant -- <completed-intake.json>",
    countInterviews: `npm run interview-report -- ${paths.interviews}`,
    readiness: "npm run readiness",
    launchSequence: "npm run launch-sequence"
  };
}

function buildMarkdown({
  generatedAt,
  status,
  reviewBrief,
  evidenceReport,
  actions,
  commands,
  acceptanceCriteria,
  blockers,
  evidenceGaps,
  warnings,
  minimumCompleted,
  validCompletedCount,
  shortfall,
  nextAction
}) {
  const lines = [
    "# Allow Interview Completion Handoff",
    "",
    `Generated: ${generatedAt}`,
    `Status: ${status}`,
    `Valid completed interviews: ${validCompletedCount}/${minimumCompleted}`,
    `Shortfall: ${shortfall}`,
    "",
    "## Safety Boundary",
    "",
    "- This handoff is local review material only.",
    "- It does not send outreach, schedule interviews, count interviews, approve merchants, start pilot traffic, post content, sign wallet payloads, deploy contracts, move funds, request secrets, store secrets, make token pitches, update state, or enable a token.",
    "- Completed interviews count only after real product-feedback answers, validated intake evidence, safety approvals, and `npm run interview-report`.",
    ""
  ];

  lines.push("## Current Evidence", "");
  lines.push(`- Completed records: ${numberOrDefault(evidenceReport.completedCount, 0)}`);
  lines.push(`- Valid completed records: ${validCompletedCount}`);
  lines.push(`- Invalid completed records: ${numberOrDefault(evidenceReport.invalidCompletedCount, 0)}`);
  lines.push(`- Scheduled records: ${numberOrDefault(evidenceReport.scheduledCount, 0)}`);
  lines.push(`- Valid scheduled records: ${numberOrDefault(evidenceReport.validScheduledCount, 0)}`);
  lines.push(`- Invalid scheduled records: ${numberOrDefault(evidenceReport.invalidScheduledCount, 0)}`);
  lines.push("");

  lines.push("## Prep Coverage", "");
  lines.push(`- Review brief status: \`${reviewBrief.status || "unknown"}\``);
  lines.push(`- Review-ready actions: ${actions.length}`);
  lines.push(`- Review brief shortfall: ${numberOrDefault(reviewBrief.counts?.shortfall, shortfall)}`);
  lines.push(`- Shortfall after current prep batch: ${numberOrDefault(reviewBrief.counts?.shortfallAfterPlan, shortfall)}`);
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

  lines.push("## Interview Completion Queue", "");
  if (actions.length === 0) {
    lines.push("No interview completion actions are ready.", "");
  } else {
    for (const action of actions) {
      lines.push(`### ${action.index}. ${action.candidateName || action.candidateId}`);
      lines.push("");
      lines.push(`- Candidate id: \`${action.candidateId || "unknown"}\``);
      lines.push(`- Prospect: \`${action.prospectName || action.prospectId || "unknown"}\``);
      lines.push(`- Packet: \`${action.packetPath || "none"}\``);
      lines.push(`- Record template: \`${action.recordTemplatePath || "none"}\``);
      lines.push(`- Intake template: \`${action.intakeTemplatePath || "none"}\``);
      lines.push(`- Suggested intake path: \`${action.suggestedIntakePath || "ops/intakes/<merchant>.json"}\``);
      lines.push(`- Questions prepared: ${action.questionCount}`);
      lines.push(`- Current answers filled in template: ${action.answeredCount}`);
      lines.push(`- Required approval flags true in template: ${action.approvalTrueCount}/${action.approvalRequiredCount}`);
      lines.push(`- Validate intake: \`${action.validateIntakeCommand}\``);
      lines.push(`- Count after recording: \`${commands.countInterviews}\``);
      lines.push("");
    }
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

function completionActions(actions = []) {
  return (Array.isArray(actions) ? actions : []).map((action) => ({
    index: numberOrDefault(action.index, 0),
    actionId: action.actionId || null,
    candidateId: action.candidateId || null,
    candidateName: action.candidateName || null,
    prospectId: action.prospectId || null,
    prospectName: action.prospectName || null,
    packetPath: action.packetPath || null,
    recordTemplatePath: action.recordTemplatePath || null,
    intakeTemplatePath: action.intakeTemplatePath || null,
    suggestedIntakePath: action.recordTemplate?.suggestedIntakePath || null,
    questionCount: numberOrDefault(action.questions?.count, 0),
    answeredCount: numberOrDefault(action.recordTemplate?.answeredCount, 0),
    approvalTrueCount: numberOrDefault(action.recordTemplate?.approvalFlags?.trueCount, 0),
    approvalRequiredCount: numberOrDefault(action.recordTemplate?.approvalFlags?.required, 4),
    validateIntakeCommand: action.commands?.validateIntake || "npm run validate-merchant -- <completed-intake.json>"
  }));
}

function nextActionFor(status, shortfall, actions, blockers) {
  if (status === "interviews_complete") {
    return "Use validated interviews to choose one merchant-approved protected endpoint test, then prepare pilot authorization.";
  }
  if (status === "ready_for_interview_execution") {
    return `Complete ${Math.min(shortfall, actions.length)} product-feedback interview${Math.min(shortfall, actions.length) === 1 ? "" : "s"} from the reviewed queue, record validated intake evidence, then rerun interview-report.`;
  }
  if (blockers.some((blocker) => /review brief/i.test(blocker))) {
    return "Regenerate and audit the interview workspace, then rerun the interview review brief before using this completion handoff.";
  }
  return "Prepare more review-ready interview actions before attempting to clear the five-interview gate.";
}

function normalizePaths(paths = {}) {
  return {
    interviews: paths.interviews || "ops/interviews.json"
  };
}

function numberOrDefault(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
