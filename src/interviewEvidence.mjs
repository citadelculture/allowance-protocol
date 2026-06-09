import { readFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { summarizeMerchantReadiness } from "./merchantIntake.mjs";
import { buildOutreachExecutionEvidenceReport } from "./outreachExecutionEvidence.mjs";

export const INTERVIEW_STATUSES = ["not_started", "scheduled", "completed", "declined"];

export function validateInterviewRecord(record = {}, context = {}) {
  const reasons = [];
  const warnings = [];
  const status = record.status || "not_started";
  const prospects = context.prospects || [];
  const candidates = context.contactCandidates || [];

  requireText(reasons, record.id, "interview id");
  requireText(reasons, record.prospectId, "prospect id");
  requireText(reasons, record.candidateId, "candidate id");

  if (!INTERVIEW_STATUSES.includes(status)) reasons.push(`Invalid interview status: ${status}`);
  if (record.prospectId && prospects.length > 0 && !prospects.some((item) => item.id === record.prospectId)) {
    reasons.push("Interview prospectId is not in prospects");
  }
  if (record.candidateId && candidates.length > 0 && !candidates.some((item) => item.id === record.candidateId)) {
    reasons.push("Interview candidateId is not in contact candidates");
  }

  if (status === "scheduled") {
    validateScheduledInterviewRecord(reasons, warnings, record, context);
  }

  if (status !== "completed") {
    return {
      valid: reasons.length === 0,
      status,
      reasons,
      warnings
    };
  }

  requireText(reasons, record.completedAt, "completedAt");
  requireText(reasons, record.summary, "summary");
  requireText(reasons, record.intakePath, "intakePath");

  if (record.completedAt && Number.isNaN(Date.parse(record.completedAt))) {
    reasons.push("completedAt must be a parseable date");
  }

  const answered = answerCount(record.answers);
  if (answered < 5) reasons.push("Completed interview must include at least five answered questions");

  const approvals = record.approvals || {};
  if (approvals.productFeedbackOnly !== true) reasons.push("Completed interview must confirm productFeedbackOnly=true");
  if (approvals.noTokenPitch !== true) reasons.push("Completed interview must confirm noTokenPitch=true");
  if (approvals.noSecretsRequested !== true) reasons.push("Completed interview must confirm noSecretsRequested=true");
  if (approvals.merchantUnderstandsPrototype !== true) {
    reasons.push("Completed interview must confirm merchantUnderstandsPrototype=true");
  }

  if (record.pilotApproval?.merchantApprovedTestEndpoint === true && !record.pilotApproval?.testEndpoint) {
    reasons.push("Pilot-approved interview must include pilotApproval.testEndpoint");
  }

  if (context.intakeReadiness) {
    if (!context.intakeReadiness.valid) {
      reasons.push(...context.intakeReadiness.reasons.map((reason) => `Linked intake invalid: ${reason}`));
    }
    warnings.push(...context.intakeReadiness.warnings.map((warning) => `Linked intake warning: ${warning}`));
  } else if (record.intakePath) {
    warnings.push("Linked intake was not loaded for validation");
  }

  return {
    valid: reasons.length === 0,
    status,
    reasons,
    warnings,
    answeredQuestions: answered,
    intake: context.intakeReadiness || null
  };
}

export function summarizeInterviewEvidence(interviews = [], context = {}, options = {}) {
  const minimumCompleted = Number(options.minimumCompleted || 5);
  const records = interviews.map((record) => {
    const validation = validateInterviewRecord(record, {
      ...context,
      intakeReadiness: context.intakeReadinessByPath?.[record.intakePath]
    });

    return {
      id: record.id || null,
      prospectId: record.prospectId || null,
      candidateId: record.candidateId || null,
      status: record.status || "not_started",
      valid: validation.valid,
      reasons: validation.reasons,
      warnings: validation.warnings,
      answeredQuestions: validation.answeredQuestions || 0,
      intake: validation.intake
    };
  });
  const validCompleted = records.filter((record) => record.status === "completed" && record.valid);
  const invalidCompleted = records.filter((record) => record.status === "completed" && !record.valid);
  const scheduled = records.filter((record) => record.status === "scheduled");
  const invalidScheduled = records.filter((record) => record.status === "scheduled" && !record.valid);
  const reasons = [];

  if (validCompleted.length < minimumCompleted) {
    reasons.push(`Only ${validCompleted.length} of ${minimumCompleted} required completed interviews are valid`);
  }
  if (invalidCompleted.length > 0) {
    reasons.push(`${invalidCompleted.length} completed interview record(s) need fixes before counting`);
  }
  if (invalidScheduled.length > 0) {
    reasons.push(`${invalidScheduled.length} scheduled interview record(s) need fixes before scheduling can be trusted`);
  }

  return {
    valid: reasons.length === 0,
    minimumCompleted,
    completedCount: records.filter((record) => record.status === "completed").length,
    validCompletedCount: validCompleted.length,
    invalidCompletedCount: invalidCompleted.length,
    scheduledCount: scheduled.length,
    validScheduledCount: scheduled.filter((record) => record.valid).length,
    invalidScheduledCount: invalidScheduled.length,
    reasons,
    warnings: records.flatMap((record) => record.warnings),
    records,
    nextAction:
      reasons.length === 0
        ? "Use validated interviews to choose one merchant-approved protected endpoint test"
        : "Complete interviews, link each to a valid merchant intake, and confirm safety approvals"
  };
}

export async function buildInterviewEvidenceReport(root, interviews = [], context = {}, options = {}) {
  const [intakeReadinessByPath, outreachEvidenceById] = await Promise.all([
    loadLinkedIntakes(root, interviews),
    loadOutreachEvidenceById(root, context)
  ]);
  return summarizeInterviewEvidence(
    interviews,
    {
      ...context,
      intakeReadinessByPath,
      outreachEvidenceById
    },
    options
  );
}

function validateScheduledInterviewRecord(reasons, warnings, record, context) {
  requireText(reasons, record.scheduledAt, "scheduledAt");
  requireText(reasons, record.scheduledBy, "scheduledBy");
  requireText(reasons, record.channel, "channel");
  requireText(reasons, record.outreachEvidenceRef, "outreachEvidenceRef");

  if (record.scheduledAt && Number.isNaN(Date.parse(record.scheduledAt))) {
    reasons.push("scheduledAt must be a parseable date");
  }

  const approvals = record.approvals || {};
  if (approvals.productFeedbackOnly !== true) reasons.push("Scheduled interview must confirm productFeedbackOnly=true");
  if (approvals.noTokenPitch !== true) reasons.push("Scheduled interview must confirm noTokenPitch=true");
  if (approvals.noSecretsRequested !== true) reasons.push("Scheduled interview must confirm noSecretsRequested=true");
  if (approvals.merchantUnderstandsPrototype !== true) {
    reasons.push("Scheduled interview must confirm merchantUnderstandsPrototype=true");
  }

  if (!record.outreachEvidenceRef) return;

  const evidence = context.outreachEvidenceById?.[record.outreachEvidenceRef];
  if (!evidence) {
    warnings.push("Scheduled interview outreachEvidenceRef was not loaded for validation");
    return;
  }

  if (!evidence.valid) {
    reasons.push(`Scheduled interview outreachEvidenceRef is invalid: ${evidence.reasons.join("; ")}`);
  }
  if (evidence.outreachStatus !== "scheduled") {
    reasons.push("Scheduled interview outreachEvidenceRef must have outreachStatus=scheduled");
  }
  if (evidence.prospectId && evidence.prospectId !== record.prospectId) {
    reasons.push("Scheduled interview outreachEvidenceRef prospectId must match interview prospectId");
  }
  if (evidence.candidateId && evidence.candidateId !== record.candidateId) {
    reasons.push("Scheduled interview outreachEvidenceRef candidateId must match interview candidateId");
  }
  if (evidence.interviewId && evidence.interviewId !== record.id) {
    reasons.push("Scheduled interview outreachEvidenceRef interviewId must match interview id");
  }
}

async function loadLinkedIntakes(root, interviews) {
  const entries = await Promise.all(
    interviews
      .filter((record) => record.status === "completed" && record.intakePath)
      .map(async (record) => {
        try {
          const path = resolveRootPath(root, record.intakePath);
          const intake = JSON.parse(await readFile(path, "utf8"));
          return [record.intakePath, summarizeMerchantReadiness(intake)];
        } catch (error) {
          return [
            record.intakePath,
            {
              valid: false,
              readyForTest: false,
              reasons: [`Could not load linked intake: ${error.message}`],
              warnings: []
            }
          ];
        }
      })
  );

  return Object.fromEntries(entries);
}

async function loadOutreachEvidenceById(root, context) {
  if (context.outreachEvidenceById) return context.outreachEvidenceById;
  const records = context.outreachExecutionRecords || await readOutreachRecords(root);
  const entries = await Promise.all(
    records.map(async (record) => {
      const report = await buildOutreachExecutionEvidenceReport(record);
      return [
        report.evidenceId || record.evidenceId,
        {
          valid: report.valid,
          reasons: report.reasons,
          warnings: report.warnings,
          outreachStatus: report.outreachStatus,
          prospectId: report.prospectId,
          candidateId: report.candidateId,
          interviewId: report.response.interviewId
        }
      ];
    })
  );
  return Object.fromEntries(entries.filter(([id]) => id));
}

async function readOutreachRecords(root) {
  try {
    const value = JSON.parse(await readFile(join(root, "ops/outreach_execution_records.json"), "utf8"));
    if (Array.isArray(value)) return value;
    if (Array.isArray(value.records)) return value.records;
  } catch {
    return [];
  }
  return [];
}

function resolveRootPath(root, path) {
  const absoluteRoot = resolve(root);
  const absolutePath = isAbsolute(path) ? resolve(path) : resolve(absoluteRoot, path);
  if (!absolutePath.startsWith(`${absoluteRoot}/`) && absolutePath !== absoluteRoot) {
    throw new Error("intakePath must stay inside the project root");
  }
  return absolutePath;
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

function requireText(reasons, value, label) {
  if (!String(value || "").trim()) reasons.push(`Missing ${label}`);
}
