import { buildMerchantInterviewPacket, validateInterviewPacketSource } from "./interviewPacket.mjs";
import { scoreProspect } from "./growthPipeline.mjs";

export const INTERVIEW_CAMPAIGN_STATUSES = [
  "complete",
  "ready_for_human_review",
  "needs_contact_discovery",
  "needs_script"
];

export function buildInterviewCampaignPlan(input = {}, options = {}) {
  const prospects = Array.isArray(input.prospects) ? input.prospects : [];
  const candidates = Array.isArray(input.candidates) ? input.candidates : [];
  const interviews = Array.isArray(input.interviews) ? input.interviews : [];
  const script = input.script || {};
  const minimumCompleted = positiveInteger(options.minimumCompleted, 5);
  const limit = positiveInteger(options.limit, minimumCompleted);
  const completed = interviews.filter((record) => record.status === "completed");
  const scheduled = interviews.filter((record) => record.status === "scheduled");
  const usedCandidateIds = new Set(
    interviews
      .filter((record) => ["completed", "scheduled"].includes(record.status))
      .map((record) => record.candidateId)
      .filter(Boolean)
  );
  const shortfall = Math.max(0, minimumCompleted - completed.length);
  const scoredProspects = new Map(prospects.map((prospect) => [prospect.id, scoreProspect(prospect)]));
  const candidatePlans = candidates.map((candidate) =>
    candidatePlan(candidate, prospects, scoredProspects, script, usedCandidateIds, options)
  );
  const readyCandidates = candidatePlans
    .filter((plan) => plan.ready)
    .sort(sortCandidatePlans);
  const plannedActions = shortfall === 0
    ? []
    : readyCandidates
        .slice(0, Math.min(limit, shortfall))
        .map((plan, index) => actionFromPlan(plan, index));
  const blockedCandidates = candidatePlans
    .filter((plan) => !plannedActions.some((action) => action.candidateId === plan.candidateId))
    .filter((plan) => !plan.ready || plan.blockers.length > 0 || plan.usedByInterview)
    .sort(sortCandidatePlans)
    .slice(0, Number(options.blockedLimit || 10))
    .map((plan) => ({
      candidateId: plan.candidateId,
      candidateName: plan.candidateName,
      prospectId: plan.prospectId,
      status: plan.status,
      priorityScore: plan.priorityScore,
      blockers: plan.blockers,
      warnings: plan.warnings,
      usedByInterview: plan.usedByInterview
    }));
  const reasons = [];
  const warnings = [];
  const scriptValid = Array.isArray(script.questions) && script.questions.length >= 5;

  if (!scriptValid) reasons.push("Interview script must include at least five questions");
  if (shortfall > 0 && plannedActions.length === 0 && scriptValid) {
    reasons.push("No draft-ready interview candidates are available for human review");
  }
  if (plannedActions.length < shortfall && shortfall > 0 && plannedActions.length > 0) {
    warnings.push(`${shortfall - plannedActions.length} additional interview candidate(s) still need contact discovery or approval`);
  }
  if (scheduled.length > 0) warnings.push(`${scheduled.length} interview(s) are scheduled and should be completed or rescheduled`);

  const status = campaignStatus({ shortfall, plannedActions, scriptValid });

  return {
    generatedAt: new Date().toISOString(),
    valid: status !== "needs_script" && (shortfall === 0 || plannedActions.length > 0),
    status,
    campaignTarget: {
      minimumCompleted,
      recordedCompletedCount: completed.length,
      scheduledCount: scheduled.length,
      shortfall,
      plannedActionCount: plannedActions.length,
      shortfallAfterPlan: Math.max(0, shortfall - plannedActions.length)
    },
    reasons,
    warnings,
    plannedActions,
    blockedCandidates,
    nextAction: nextAction({ status, plannedActions, shortfall }),
    evidenceInstructions: [
      "Send only after account-owner approval through the external-action approval process",
      "Record completed answers in ops/interviews.json or a private interview evidence file",
      "Create and validate the linked merchant intake before the interview counts",
      "Run npm run interview-report after every completed interview",
      "Request merchant-approved test endpoint evidence only after product-feedback questions are complete"
    ],
    evidenceBoundary: {
      sendsOutreach: false,
      postsToX: false,
      startsPilotTraffic: false,
      countsAsCompletedInterview: false,
      requestsSecrets: false,
      tokenPitch: false,
      requiresHumanApproval: true
    }
  };
}

function candidatePlan(candidate, prospects, scoredProspects, script, usedCandidateIds, options) {
  const prospect = prospects.find((item) => item.id === candidate.prospectId) || {};
  const validation = validateInterviewPacketSource(candidate, prospect, script);
  const packet = buildMerchantInterviewPacket(candidate, prospect, script, options);
  const scoredProspect = scoredProspects.get(candidate.prospectId) || null;
  const prospectScore = Number(scoredProspect?.score || 0);
  const confidence = Number(candidate.confidence || 0);
  const usedByInterview = usedCandidateIds.has(candidate.id);
  const blockers = [...validation.reasons];

  if (usedByInterview) blockers.push("Candidate already has a scheduled or completed interview record");

  return {
    candidateId: candidate.id || null,
    candidateName: candidate.name || null,
    prospectId: candidate.prospectId || prospect.id || null,
    prospectName: prospect.name || null,
    status: candidate.status || "unknown",
    priorityScore: prospectScore * 100 + Math.round(confidence * 100),
    prospectScore,
    confidence,
    ready: validation.valid && !usedByInterview,
    blockers,
    warnings: validation.warnings,
    usedByInterview,
    packet
  };
}

function actionFromPlan(plan, index) {
  return {
    sequence: index + 1,
    actionId: `interview-review-${plan.candidateId}`,
    candidateId: plan.candidateId,
    candidateName: plan.candidateName,
    prospectId: plan.prospectId,
    prospectName: plan.prospectName,
    priorityScore: plan.priorityScore,
    channel: plan.packet.channel,
    destination: plan.packet.destination,
    packet: plan.packet,
    nextAction: plan.packet.nextAction,
    completionRequires: [
      "merchant answers or explicitly skips at least five questions",
      "approvals.productFeedbackOnly=true",
      "approvals.noTokenPitch=true",
      "approvals.noSecretsRequested=true",
      "approvals.merchantUnderstandsPrototype=true",
      "linked merchant intake validates with npm run validate-merchant"
    ]
  };
}

function campaignStatus({ shortfall, plannedActions, scriptValid }) {
  if (!scriptValid) return "needs_script";
  if (shortfall === 0) return "complete";
  if (plannedActions.length > 0) return "ready_for_human_review";
  return "needs_contact_discovery";
}

function nextAction({ status, plannedActions, shortfall }) {
  if (status === "complete") return "Use validated interviews to choose one merchant-approved protected endpoint test";
  if (status === "needs_script") return "Add at least five product-feedback questions before building interview packets";
  if (plannedActions.length > 0) {
    const first = plannedActions[0];
    return `Review ${plannedActions.length} interview packet(s), starting with ${first.candidateName || first.candidateId}; ${Math.max(0, shortfall - plannedActions.length)} more candidate(s) remain after this batch`;
  }
  return "Discover or approve more public contact candidates before scheduling interviews";
}

function sortCandidatePlans(a, b) {
  if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
  return String(a.candidateName || a.candidateId || "").localeCompare(String(b.candidateName || b.candidateId || ""));
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 1) return fallback;
  return Math.floor(number);
}
