export const SCORE_FIELDS = [
  "existingEndpoint",
  "usageBasedPricing",
  "agentUsersLikely",
  "metadataOrAbuseRisk",
  "canTestWithinWeek",
  "publicProofPotential"
];

export function scoreProspect(prospect) {
  const score = SCORE_FIELDS.reduce((sum, field) => {
    return sum + clampScore(prospect.score?.[field] ?? 0);
  }, 0);

  return {
    id: prospect.id,
    name: prospect.name,
    segment: prospect.segment,
    score,
    tier: tierForScore(score),
    nextAction: nextActionForProspect(prospect, score),
    status: {
      contact: prospect.contactStatus || "unknown",
      outreach: prospect.outreachStatus || "not_started",
      interview: prospect.interviewStatus || "not_started",
      integration: prospect.integrationStatus || "not_started"
    }
  };
}

export function summarizePipeline(prospects = [], interviews = []) {
  const scored = prospects.map(scoreProspect).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.name.localeCompare(b.name);
  });

  const counts = scored.reduce(
    (acc, prospect) => {
      acc.total += 1;
      acc.byTier[prospect.tier] = (acc.byTier[prospect.tier] || 0) + 1;
      acc.byOutreach[prospect.status.outreach] = (acc.byOutreach[prospect.status.outreach] || 0) + 1;
      return acc;
    },
    { total: 0, byTier: {}, byOutreach: {} }
  );

  const completedInterviews = interviews.filter((interview) => interview.status === "completed");
  const integrationCandidates = scored.filter((prospect) => prospect.score >= 9);

  return {
    counts,
    completedInterviews: completedInterviews.length,
    integrationCandidates: integrationCandidates.length,
    topProspects: scored.slice(0, 5),
    nextRecruitingAction: nextRecruitingAction(scored, completedInterviews.length)
  };
}

function nextRecruitingAction(scored, completedInterviewCount) {
  if (completedInterviewCount < 5) {
    const candidate = scored.find((prospect) => prospect.status.outreach === "not_started");
    if (candidate) return `Find contact and send product-feedback ask for ${candidate.name}`;
    return "Follow up with contacted prospects until five interviews are complete";
  }

  const integrationCandidate = scored.find((prospect) => prospect.score >= 9);
  if (integrationCandidate) return `Convert ${integrationCandidate.name} into a protected endpoint test`;
  return "Re-score segments after interviews and find stronger fit prospects";
}

function nextActionForProspect(prospect, score) {
  if (prospect.integrationStatus === "testing") return "Capture one allowed receipt and one denied receipt";
  if (prospect.interviewStatus === "scheduled") return "Run interview and fill merchant intake";
  if (prospect.outreachStatus === "sent") return "Follow up with one concrete middleware example";
  if (prospect.contactStatus !== "identified") return "Identify founder, maintainer, or developer-relations contact";
  if (score >= 9) return "Send direct test-integration ask";
  if (score >= 6) return "Send async feedback ask";
  return "Keep in nurture until agent-payment fit improves";
}

function tierForScore(score) {
  if (score >= 9) return "immediate";
  if (score >= 6) return "async";
  if (score >= 3) return "nurture";
  return "skip";
}

function clampScore(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(2, Math.round(number)));
}
