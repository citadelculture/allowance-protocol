import { OUTREACH_EXECUTION_STATUSES, buildOutreachExecutionEvidenceReport } from "./outreachExecutionEvidence.mjs";

export const PIPELINE_OUTREACH_STATUSES = ["not_started", ...OUTREACH_EXECUTION_STATUSES];
export const PIPELINE_INTERVIEW_STATUSES = ["not_started", "scheduled", "completed"];

const OUTREACH_STATUS_RANK = {
  not_started: 0,
  sent: 1,
  bounced: 2,
  declined: 2,
  replied: 3,
  scheduled: 4
};

export async function buildOutreachStateReport(input = {}, options = {}) {
  const prospects = Array.isArray(input.prospects) ? input.prospects : [];
  const evidenceRecords = recordsFromInput(input.evidenceRecords ?? input.records);
  const contactCandidates = Array.isArray(input.contactCandidates) ? input.contactCandidates : [];
  const interviews = Array.isArray(input.interviews) ? input.interviews : [];
  const reasons = [];
  const warnings = [];
  const prospectIds = new Set(prospects.map((prospect) => prospect.id).filter(Boolean));
  const candidateIds = new Set(contactCandidates.map((candidate) => candidate.id).filter(Boolean));
  const seenEvidenceIds = new Set();

  const evidenceEntries = [];
  for (const [index, record] of evidenceRecords.entries()) {
    const report = await buildOutreachExecutionEvidenceReport(record, options.executionOptions || {});
    const entryReasons = [...report.reasons];
    const evidenceId = report.evidenceId || record?.evidenceId || `record[${index}]`;

    if (seenEvidenceIds.has(evidenceId)) entryReasons.push(`Duplicate evidenceId: ${evidenceId}`);
    if (evidenceId) seenEvidenceIds.add(evidenceId);
    if (report.prospectId && prospectIds.size > 0 && !prospectIds.has(report.prospectId)) {
      entryReasons.push(`Unknown prospectId: ${report.prospectId}`);
    }
    if (report.candidateId && candidateIds.size > 0 && !candidateIds.has(report.candidateId)) {
      entryReasons.push(`Unknown candidateId: ${report.candidateId}`);
    }

    const valid = report.valid && entryReasons.length === 0;
    evidenceEntries.push({
      index,
      evidenceId,
      valid,
      prospectId: report.prospectId,
      candidateId: report.candidateId,
      outreachStatus: report.outreachStatus,
      responseStatus: report.responseStatus,
      sentAt: report.sent.sentAt,
      interviewId: report.response.interviewId,
      reasons: unique(entryReasons),
      warnings: report.warnings,
      evidenceBoundary: report.evidenceBoundary
    });
    reasons.push(...entryReasons.map((reason) => `${evidenceId}: ${reason}`));
    warnings.push(...report.warnings.map((warning) => `${evidenceId}: ${warning}`));
  }

  const validEntries = evidenceEntries.filter((entry) => entry.valid);
  const entriesByProspect = groupBy(validEntries, "prospectId");
  const scheduledInterviewProspectIds = new Set(
    interviews
      .filter((interview) => interview.status === "scheduled")
      .map((interview) => interview.prospectId)
      .filter(Boolean)
  );

  const prospectsReport = prospects.map((prospect) =>
    prospectStateReport(prospect, entriesByProspect.get(prospect.id) || [], scheduledInterviewProspectIds)
  );
  for (const prospect of prospectsReport) {
    reasons.push(...prospect.reasons.map((reason) => `${prospect.prospectId}: ${reason}`));
    warnings.push(...prospect.warnings.map((warning) => `${prospect.prospectId}: ${warning}`));
  }

  return {
    generatedAt: new Date().toISOString(),
    valid: reasons.length === 0,
    status: statusForReport({ reasons, evidenceEntries, prospectsReport }),
    counts: {
      prospects: prospects.length,
      evidenceRecords: evidenceEntries.length,
      validEvidenceRecords: validEntries.length,
      invalidEvidenceRecords: evidenceEntries.length - validEntries.length,
      prospectsWithValidatedOutreach: prospectsReport.filter((prospect) => prospect.hasValidatedOutreach).length,
      scheduledFromOutreachEvidence: validEntries.filter((entry) => entry.outreachStatus === "scheduled").length,
      completedInterviewsFromOutreachEvidence: 0
    },
    byOutreachStatus: statusCounts(prospectsReport.map((prospect) => prospect.projected.outreachStatus)),
    evidenceEntries,
    prospects: prospectsReport,
    projectedProspects: prospectsReport.map((prospect) => prospect.projected),
    reasons: unique(reasons),
    warnings: unique(warnings),
    nextAction: nextActionForReport({ reasons, validEntries, prospectsReport }),
    evidenceBoundary: {
      sendsOutreach: false,
      approvesExternalAction: false,
      countsAsCompletedInterview: false,
      marksProspectIntegrated: false,
      startsPilotTraffic: false,
      movesFunds: false,
      storesSecrets: false,
      marksTokenReady: false
    }
  };
}

function prospectStateReport(prospect, evidenceEntries, scheduledInterviewProspectIds) {
  const reasons = [];
  const warnings = [];
  const currentOutreachStatus = normalizeKnown(prospect.outreachStatus, PIPELINE_OUTREACH_STATUSES, "not_started");
  const currentInterviewStatus = normalizeKnown(prospect.interviewStatus, PIPELINE_INTERVIEW_STATUSES, "not_started");
  const bestEvidence = bestOutreachEvidence(evidenceEntries);
  const evidenceOutreachStatus = bestEvidence?.outreachStatus || null;
  const projectedOutreachStatus = evidenceOutreachStatus
    ? maxOutreachStatus(currentOutreachStatus, evidenceOutreachStatus)
    : currentOutreachStatus;
  const hasScheduledEvidence = evidenceEntries.some((entry) => entry.outreachStatus === "scheduled");
  const projectedInterviewStatus =
    currentInterviewStatus === "completed"
      ? "completed"
      : hasScheduledEvidence || scheduledInterviewProspectIds.has(prospect.id)
        ? "scheduled"
        : currentInterviewStatus;

  if (!PIPELINE_OUTREACH_STATUSES.includes(String(prospect.outreachStatus || "not_started"))) {
    reasons.push("Invalid outreachStatus");
  }
  if (!PIPELINE_INTERVIEW_STATUSES.includes(String(prospect.interviewStatus || "not_started"))) {
    reasons.push("Invalid interviewStatus");
  }
  if (OUTREACH_STATUS_RANK[currentOutreachStatus] > 0 && evidenceEntries.length === 0) {
    reasons.push(`outreachStatus=${currentOutreachStatus} has no valid outreach execution evidence`);
  }
  if (evidenceOutreachStatus && OUTREACH_STATUS_RANK[currentOutreachStatus] > OUTREACH_STATUS_RANK[evidenceOutreachStatus]) {
    reasons.push(`outreachStatus=${currentOutreachStatus} is ahead of validated evidence status=${evidenceOutreachStatus}`);
  }
  if (currentInterviewStatus === "scheduled" && !hasScheduledEvidence && !scheduledInterviewProspectIds.has(prospect.id)) {
    reasons.push("interviewStatus=scheduled needs scheduled outreach evidence or a scheduled interview record");
  }
  if (currentInterviewStatus === "completed") {
    warnings.push("Completed interview status still requires npm run interview-report evidence; outreach state does not prove completion");
  }

  return {
    prospectId: prospect.id || null,
    name: prospect.name || null,
    current: {
      outreachStatus: currentOutreachStatus,
      interviewStatus: currentInterviewStatus,
      integrationStatus: prospect.integrationStatus || "not_started"
    },
    evidence: {
      outreachStatus: evidenceOutreachStatus,
      evidenceIds: evidenceEntries.map((entry) => entry.evidenceId),
      candidateIds: unique(evidenceEntries.map((entry) => entry.candidateId).filter(Boolean)),
      latestSentAt: latestDate(evidenceEntries.map((entry) => entry.sentAt).filter(Boolean)),
      scheduledInterviewIds: unique(evidenceEntries.map((entry) => entry.interviewId).filter(Boolean))
    },
    projected: {
      ...prospect,
      outreachStatus: projectedOutreachStatus,
      interviewStatus: projectedInterviewStatus
    },
    hasValidatedOutreach: evidenceEntries.length > 0,
    reasons,
    warnings
  };
}

function recordsFromInput(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object" && Array.isArray(value.records)) return value.records;
  return [];
}

function bestOutreachEvidence(entries) {
  return [...entries].sort((a, b) => {
    const rankDiff = (OUTREACH_STATUS_RANK[b.outreachStatus] || 0) - (OUTREACH_STATUS_RANK[a.outreachStatus] || 0);
    if (rankDiff !== 0) return rankDiff;
    return String(b.sentAt || "").localeCompare(String(a.sentAt || ""));
  })[0] || null;
}

function maxOutreachStatus(a, b) {
  return (OUTREACH_STATUS_RANK[b] || 0) > (OUTREACH_STATUS_RANK[a] || 0) ? b : a;
}

function normalizeKnown(value, allowed, fallback) {
  const text = String(value || fallback);
  return allowed.includes(text) ? text : fallback;
}

function statusForReport({ reasons, evidenceEntries, prospectsReport }) {
  if (reasons.length > 0) return "needs_state_fixes";
  if (evidenceEntries.length === 0) return "no_outreach_evidence_yet";
  if (prospectsReport.some((prospect) => prospect.projected.interviewStatus === "scheduled")) return "has_scheduled_response";
  if (prospectsReport.some((prospect) => prospect.hasValidatedOutreach)) return "evidence_backed_outreach";
  return "no_outreach_evidence_yet";
}

function nextActionForReport({ reasons, validEntries, prospectsReport }) {
  if (reasons.length > 0) return "Fix invalid outreach evidence or prospect statuses before advancing the pipeline";
  const scheduled = prospectsReport.find((prospect) => prospect.projected.interviewStatus === "scheduled");
  if (scheduled) return `Run scheduled interview for ${scheduled.name || scheduled.prospectId}, then validate it with npm run interview-report`;
  if (validEntries.length > 0) return "Follow up on validated outreach responses without marking interviews complete";
  return "Send the first approved outreach manually, then add its execution evidence record";
}

function groupBy(items, key) {
  const groups = new Map();
  for (const item of items) {
    const value = item[key];
    if (!value) continue;
    if (!groups.has(value)) groups.set(value, []);
    groups.get(value).push(item);
  }
  return groups;
}

function statusCounts(values) {
  return values.reduce((acc, value) => {
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function latestDate(values) {
  return values.sort().at(-1) || null;
}

function unique(values) {
  return [...new Set(values)];
}
