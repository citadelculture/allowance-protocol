import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { buildInterviewWorkspaceAuditReport } from "./interviewWorkspaceAudit.mjs";

export const INTERVIEW_REVIEW_BRIEF_STATUSES = [
  "ready_for_interview_review",
  "needs_workspace_fixes",
  "no_ready_candidates",
  "missing_manifest"
];

const INTERVIEW_APPROVAL_FLAGS = [
  "productFeedbackOnly",
  "noTokenPitch",
  "noSecretsRequested",
  "merchantUnderstandsPrototype"
];

export async function buildInterviewReviewBrief(workspaceDir, options = {}) {
  const root = resolve(options.root || process.cwd());
  const workspaceRoot = resolve(root, workspaceDir || "work/interview-workspace");
  const generatedAt = options.generatedAt || new Date().toISOString();
  const audit = options.audit || await buildInterviewWorkspaceAuditReport(workspaceRoot, {
    root,
    generatedAt
  });
  const reasons = [...(audit.reasons || [])];
  const warnings = [...(audit.warnings || [])];
  const manifestRead = await readJsonInside(workspaceRoot, "manifest.json");
  const manifest = manifestRead.ok ? manifestRead.value : null;

  if (!manifestRead.ok) reasons.push(`Unable to read interview workspace manifest: ${manifestRead.reason}`);

  const actions = [];
  for (const [index, entry] of (manifest?.interviewPackets || []).entries()) {
    actions.push(await actionSummaryForEntry({
      index,
      entry,
      manifest,
      audit,
      workspaceRoot
    }));
  }

  const valid = audit.valid === true && manifestRead.ok;
  const status = !manifestRead.ok || audit.status === "missing_manifest"
    ? "missing_manifest"
    : !audit.valid
      ? "needs_workspace_fixes"
      : actions.length > 0
        ? "ready_for_interview_review"
        : "no_ready_candidates";
  const markdown = buildMarkdownBrief({
    generatedAt,
    workspaceRoot,
    valid,
    status,
    audit,
    manifest,
    actions,
    reasons,
    warnings
  });

  return {
    generatedAt,
    valid,
    status,
    workspaceDir: workspaceRoot,
    audit: {
      status: audit.status,
      valid: audit.valid,
      counts: audit.counts,
      reasons: audit.reasons || [],
      warnings: audit.warnings || []
    },
    counts: {
      reviewActions: actions.length,
      interviewPackets: manifest?.interviewPackets?.length || 0,
      interviewRecordTemplates: manifest?.interviewRecordTemplates?.length || 0,
      merchantIntakeTemplates: manifest?.merchantIntakeTemplates?.length || 0,
      blockedCandidates: manifest?.blockedCandidates?.length || 0,
      shortfall: manifest?.campaign?.target?.shortfall || 0,
      shortfallAfterPlan: manifest?.campaign?.target?.shortfallAfterPlan || 0,
      totalQuestions: actions.reduce((sum, action) => sum + action.questions.count, 0)
    },
    actions,
    markdown,
    reasons: unique(reasons),
    warnings: unique(warnings),
    nextAction: valid
      ? "Use the review brief to inspect interview prep, then seek explicit approval before any outbound contact."
      : "Fix or regenerate the interview workspace before using the review brief.",
    evidenceBoundary: {
      readsLocalWorkspaceFiles: true,
      writesFiles: false,
      sendsOutreach: false,
      schedulesInterviews: false,
      countsAsCompletedInterview: false,
      createsMerchantApproval: false,
      startsPilotTraffic: false,
      requestsSecrets: false,
      storesSecrets: false,
      tokenPitch: false,
      requiresHumanApproval: true
    }
  };
}

export function publicInterviewReviewBriefReport(report = {}) {
  return {
    ...report,
    markdown: undefined
  };
}

async function actionSummaryForEntry({ index, entry, manifest, audit, workspaceRoot }) {
  const packetRead = await readJsonInside(workspaceRoot, entry.path || "");
  const packet = packetRead.ok ? packetRead.value : {};
  const recordEntry = matchingEntry(manifest.interviewRecordTemplates, entry);
  const intakeEntry = matchingEntry(manifest.merchantIntakeTemplates, entry);
  const recordRead = recordEntry ? await readJsonInside(workspaceRoot, recordEntry.path || "") : { ok: false, reason: "Missing record template entry" };
  const intakeRead = intakeEntry ? await readJsonInside(workspaceRoot, intakeEntry.path || "") : { ok: false, reason: "Missing intake template entry" };
  const record = recordRead.ok ? recordRead.value : {};
  const intake = intakeRead.ok ? intakeRead.value : {};
  const packetAuditFile = auditFileFor(audit, entry.path);
  const recordAuditFile = recordEntry ? auditFileFor(audit, recordEntry.path) : null;
  const intakeAuditFile = intakeEntry ? auditFileFor(audit, intakeEntry.path) : null;
  const trueApprovalFlags = INTERVIEW_APPROVAL_FLAGS.filter((flag) => record.approvals?.[flag] === true);
  const falseApprovalFlags = INTERVIEW_APPROVAL_FLAGS.filter((flag) => record.approvals?.[flag] === false);

  return {
    index: index + 1,
    actionId: entry.actionId || null,
    candidateId: entry.candidateId || packet.candidateId || null,
    candidateName: entry.candidateName || packet.candidateName || null,
    prospectId: entry.prospectId || packet.prospectId || null,
    prospectName: entry.prospectName || packet.prospectName || null,
    channel: packet.channel || null,
    destination: packet.destination || null,
    relevantSurface: packet.relevantSurface || null,
    publicEvidence: packet.publicEvidence || null,
    packetPath: entry.path || null,
    packetAuditStatus: packetAuditFile?.status || "not_checked",
    packetHashMatches: packetAuditFile?.hashMatches ?? null,
    recordTemplatePath: recordEntry?.path || null,
    recordTemplateAuditStatus: recordAuditFile?.status || (recordEntry ? "not_checked" : "missing"),
    intakeTemplatePath: intakeEntry?.path || null,
    intakeTemplateAuditStatus: intakeAuditFile?.status || (intakeEntry ? "not_checked" : "missing"),
    opening: packet.opening || "",
    close: packet.close || "",
    nextAction: packet.nextAction || null,
    questions: {
      count: Array.isArray(packet.questions) ? packet.questions.length : 0,
      items: Array.isArray(packet.questions) ? packet.questions : []
    },
    intakeFieldsToFill: Array.isArray(packet.intakeFieldsToFill) ? packet.intakeFieldsToFill : [],
    recordTemplate: {
      completedAt: record.completedAt || "",
      completedBy: record.completedBy || "",
      intakePath: record.intakePath || "",
      suggestedIntakePath: record.suggestedIntakePath || null,
      answeredCount: answerCount(record.answers),
      approvalFlags: {
        required: INTERVIEW_APPROVAL_FLAGS.length,
        falseCount: falseApprovalFlags.length,
        trueCount: trueApprovalFlags.length,
        trueFlags: trueApprovalFlags
      },
      pilotApproved: record.pilotApproval?.merchantApprovedTestEndpoint === true
    },
    intakeTemplate: {
      merchantId: intake.merchantId || "",
      canTestThisWeek: intake.integration?.canTestThisWeek === true,
      testEndpoint: intake.integration?.testEndpoint || "",
      maxSafeTestSpendUsd: intake.risk?.maxSafeTestSpendUsd ?? null
    },
    commands: {
      validateIntake: `npm run validate-merchant -- ${record.suggestedIntakePath || "ops/intakes/<merchant>.json"}`,
      countInterview: "npm run interview-report"
    },
    reasons: [
      ...(packetRead.ok ? [] : [`Unable to read packet JSON: ${packetRead.reason}`]),
      ...(recordRead.ok ? [] : [`Unable to read record template JSON: ${recordRead.reason}`]),
      ...(intakeRead.ok ? [] : [`Unable to read intake template JSON: ${intakeRead.reason}`]),
      ...(packetAuditFile?.reasons || []),
      ...(recordAuditFile?.reasons || []),
      ...(intakeAuditFile?.reasons || [])
    ],
    warnings: [
      ...(packetAuditFile?.warnings || []),
      ...(recordAuditFile?.warnings || []),
      ...(intakeAuditFile?.warnings || [])
    ]
  };
}

function buildMarkdownBrief({ generatedAt, workspaceRoot, valid, status, audit, manifest, actions, reasons, warnings }) {
  const lines = [
    "# Allow Merchant Interview Review Brief",
    "",
    `Generated: ${generatedAt}`,
    `Workspace: ${workspaceRoot}`,
    `Status: ${status}`,
    `Audit: ${audit.status} (${audit.valid ? "valid" : "invalid"})`,
    "",
    "## Safety Boundary",
    "",
    "- This brief is local interview review material only.",
    "- No outreach is sent, no call is scheduled, no interview is counted, and no merchant approval is created by this brief.",
    "- Keep the ask product-feedback-only and explicitly not a token pitch.",
    "- Completed interviews count only after real answers, a validated merchant intake, and `npm run interview-report`.",
    ""
  ];

  if (!valid) {
    lines.push("## Workspace Needs Fixes", "");
    for (const reason of unique(reasons)) lines.push(`- ${reason}`);
    if (warnings.length > 0) {
      lines.push("", "## Warnings", "");
      for (const warning of unique(warnings)) lines.push(`- ${warning}`);
    }
    return lines.join("\n");
  }

  lines.push(
    "## Review Queue",
    "",
    `- Interview packets: ${manifest?.interviewPackets?.length || 0}`,
    `- Completed-record templates: ${manifest?.interviewRecordTemplates?.length || 0}`,
    `- Merchant-intake templates: ${manifest?.merchantIntakeTemplates?.length || 0}`,
    `- Completed-interview shortfall: ${manifest?.campaign?.target?.shortfall || 0}`,
    `- Shortfall after this prep batch: ${manifest?.campaign?.target?.shortfallAfterPlan || 0}`,
    `- Blocked candidates: ${manifest?.blockedCandidates?.length || 0}`,
    ""
  );

  if (actions.length === 0) {
    lines.push("No interview candidates are ready for review.");
  } else {
    for (const action of actions) {
      lines.push(
        `### ${action.index}. ${action.candidateName || action.candidateId}`,
        "",
        `- Candidate id: \`${action.candidateId}\``,
        `- Prospect: \`${action.prospectName || action.prospectId || "unknown"}\``,
        `- Channel: \`${action.channel || "unknown"}\``,
        `- Destination: \`${action.destination || "unknown"}\``,
        `- Surface: ${action.relevantSurface || "unknown"}`,
        `- Packet: \`${action.packetPath}\` (${action.packetAuditStatus})`,
        `- Record template: \`${action.recordTemplatePath || "none"}\` (${action.recordTemplateAuditStatus})`,
        `- Intake template: \`${action.intakeTemplatePath || "none"}\` (${action.intakeTemplateAuditStatus})`,
        `- Questions: ${action.questions.count}`,
        `- Record approvals true: ${action.recordTemplate.approvalFlags.trueCount}/${action.recordTemplate.approvalFlags.required}`,
        `- Record answers filled: ${action.recordTemplate.answeredCount}`,
        `- Pilot approval captured: ${action.recordTemplate.pilotApproved ? "yes" : "no"}`,
        `- Intake can test this week: ${action.intakeTemplate.canTestThisWeek ? "yes" : "no"}`,
        `- Suggested intake path: \`${action.recordTemplate.suggestedIntakePath || "none"}\``,
        `- Validate intake: \`${action.commands.validateIntake}\``,
        `- Count completed interview: \`${action.commands.countInterview}\``,
        ""
      );

      if (action.opening) {
        lines.push("Opening:", "", fencedText(action.opening), "");
      }
      if (action.questions.items.length > 0) {
        lines.push("Questions:", "");
        for (const question of action.questions.items) lines.push(`- ${question}`);
        lines.push("");
      }
      if (action.close) {
        lines.push("Close:", "", fencedText(action.close), "");
      }
    }
  }

  if ((manifest?.blockedCandidates || []).length > 0) {
    lines.push("## Blocked Candidates", "");
    for (const candidate of manifest.blockedCandidates) {
      lines.push(`- ${candidate.candidateId}: ${(candidate.blockers || []).join("; ") || candidate.status || "blocked"}`);
    }
    lines.push("");
  }

  lines.push(
    "## Completion Steps",
    "",
    "1. Get explicit approval before any outbound contact.",
    "2. Run the interview as product feedback, not as a token or investment conversation.",
    "3. Fill at least five answers or explicit skips in the completed-record template.",
    "4. Create and validate a merchant intake.",
    "5. Add the completed interview record to `ops/interviews.json`.",
    "6. Run `npm run interview-report` before counting the interview.",
    "",
    "## Final Reminder",
    "",
    "Run `npm run interview-workspace-audit` before review. This brief does not send outreach, schedule calls, count interviews, approve merchants, or start pilot traffic."
  );

  return lines.join("\n");
}

function matchingEntry(entries, entry) {
  return (Array.isArray(entries) ? entries : []).find((candidate) => {
    if (entry.actionId && candidate.actionId === entry.actionId) return true;
    if (entry.candidateId && candidate.candidateId === entry.candidateId) return true;
    return false;
  }) || null;
}

function auditFileFor(audit, path) {
  return (audit.files || []).find((file) => file.path === path) || null;
}

async function readJsonInside(root, relativePath) {
  const safePath = safeResolve(root, relativePath);
  if (!safePath.ok) return { ok: false, reason: safePath.reason };
  try {
    return { ok: true, value: JSON.parse(await readFile(safePath.path, "utf8")) };
  } catch (error) {
    return { ok: false, reason: error.message };
  }
}

function safeResolve(root, relativePath) {
  const path = resolve(root, String(relativePath || ""));
  if (path !== root && !path.startsWith(`${root}${sep}`)) {
    return { ok: false, reason: `Refusing path outside workspace: ${relativePath}` };
  }
  return { ok: true, path };
}

function answerCount(answers) {
  if (Array.isArray(answers)) {
    return answers.filter((answer) => answerText(answer)).length;
  }
  if (answers && typeof answers === "object") {
    return Object.values(answers).filter((answer) => answerText(answer)).length;
  }
  return 0;
}

function answerText(answer) {
  if (typeof answer === "string") return answer.trim();
  if (answer && typeof answer === "object") return String(answer.answer || answer.response || "").trim();
  return "";
}

function fencedText(text) {
  return ["```text", String(text || "").replace(/```/g, "'''"), "```"].join("\n");
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
