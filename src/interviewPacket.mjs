export const INTERVIEW_INTAKE_FIELDS = [
  "merchantId",
  "name",
  "website",
  "service.category",
  "service.endpointType",
  "service.pricingModel",
  "service.examplePriceUsd",
  "agentPaymentFit.expectsAgentUsers",
  "agentPaymentFit.currentX402Support",
  "agentPaymentFit.currentMcpSupport",
  "risk.sensitiveMetadataClasses",
  "risk.abuseModes",
  "risk.maxSafeTestSpendUsd",
  "integration.preferredSurface",
  "integration.canTestThisWeek",
  "integration.testEndpoint",
  "integration.successMetric"
];

export function buildMerchantInterviewPacket(candidate = {}, prospect = {}, script = {}, options = {}) {
  const validation = validateInterviewPacketSource(candidate, prospect, script);
  const questionCount = Number(options.questionCount || 8);
  const questions = buildQuestionSet(script.questions || [], candidate, prospect, questionCount);
  const valid = validation.reasons.length === 0;

  return {
    generatedAt: new Date().toISOString(),
    valid,
    status: valid ? "ready_for_human_review" : "action_required",
    prospectId: candidate.prospectId || prospect.id || null,
    prospectName: prospect.name || null,
    candidateId: candidate.id || null,
    candidateName: candidate.name || null,
    channel: candidate.preferredChannel || "unknown",
    destination: candidate.contactPath || null,
    relevantSurface: candidate.relevantSurface || prospect.name || "paid agent endpoint",
    publicEvidence: candidate.publicEvidence || prospect.evidence || "",
    reasons: validation.reasons,
    warnings: validation.warnings,
    opening: script.opening || defaultOpening(),
    questions,
    close: script.close || defaultClose(),
    intakeFieldsToFill: INTERVIEW_INTAKE_FIELDS,
    qualificationSignals: qualificationSignals(prospect),
    humanApprovalChecklist: [
      "Account owner confirms destination and channel before outreach",
      "Message remains a product-feedback or integration ask, not a token pitch",
      "Interviewer records answers into a merchant intake file before any pilot claim",
      "Merchant explicitly approves a low-risk test endpoint before pilot traffic",
      "No private keys, seed phrases, API secrets, or settlement credentials are requested"
    ],
    evidenceBoundary: {
      outreachSentByThisPacket: false,
      merchantApprovedByThisPacket: false,
      countsAsCompletedInterview: false,
      completedInterviewRequires: [
        "merchant identity and contact path confirmed",
        "questions answered or explicitly skipped by merchant",
        "merchant intake JSON created and validates",
        "test endpoint approval captured before any traffic"
      ]
    },
    nextAction: valid
      ? `Review interview packet, then ask ${candidate.name || "the candidate"} for product feedback`
      : "Complete candidate, prospect, and interview script fields before outreach review"
  };
}

export function buildMerchantInterviewPackets(candidates = [], prospects = [], script = {}, options = {}) {
  const limit = Number(options.limit || 3);
  return candidates
    .filter((candidate) => candidate.status === "draft_ready")
    .sort((a, b) => {
      if (Number(b.confidence || 0) !== Number(a.confidence || 0)) {
        return Number(b.confidence || 0) - Number(a.confidence || 0);
      }
      return String(a.name || "").localeCompare(String(b.name || ""));
    })
    .slice(0, limit)
    .map((candidate) => {
      const prospect = prospects.find((item) => item.id === candidate.prospectId) || {};
      return buildMerchantInterviewPacket(candidate, prospect, script, options);
    });
}

export function validateInterviewPacketSource(candidate = {}, prospect = {}, script = {}) {
  const reasons = [];
  const warnings = [];

  requireText(reasons, candidate.id, "candidate id");
  requireText(reasons, candidate.prospectId || prospect.id, "prospect id");
  requireText(reasons, candidate.name, "candidate name");
  requireText(reasons, candidate.relevantSurface, "relevant surface");
  requireText(reasons, candidate.contactPath, "contact path");

  if (candidate.status !== "draft_ready") {
    reasons.push("Candidate is not draft_ready");
  }

  if (candidate.contactPath && !safeDestination(candidate.contactPath)) {
    reasons.push("Contact path must be an http or https URL");
  }

  if (!Array.isArray(script.questions) || script.questions.length < 5) {
    reasons.push("Interview script must include at least five questions");
  }

  if (!prospect.id) {
    warnings.push("Prospect record was not found; packet will lack segment context");
  }

  if (!candidate.publicEvidence && !prospect.evidence) {
    warnings.push("No public evidence recorded for why this candidate fits");
  }

  return {
    valid: reasons.length === 0,
    reasons,
    warnings
  };
}

function buildQuestionSet(baseQuestions, candidate, prospect, questionCount) {
  const questions = baseQuestions.slice(0, Math.max(5, questionCount));
  const surface = candidate.relevantSurface || prospect.name || "this endpoint";
  const targeted = `Would you test Allow on one low-risk ${surface} path if the first pass takes less than one hour?`;

  if (!questions.some((question) => question.includes("less than one hour"))) {
    questions.push(targeted);
  }

  return questions;
}

function qualificationSignals(prospect = {}) {
  const score = prospect.score || {};
  return {
    existingEndpoint: Number(score.existingEndpoint || 0),
    usageBasedPricing: Number(score.usageBasedPricing || 0),
    agentUsersLikely: Number(score.agentUsersLikely || 0),
    metadataOrAbuseRisk: Number(score.metadataOrAbuseRisk || 0),
    canTestWithinWeek: Number(score.canTestWithinWeek || 0),
    publicProofPotential: Number(score.publicProofPotential || 0)
  };
}

function safeDestination(destination) {
  try {
    const url = new URL(destination);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function requireText(reasons, value, label) {
  if (!String(value || "").trim()) reasons.push(`Missing ${label}`);
}

function defaultOpening() {
  return "We are building Allow Protocol, a no-custody allowance layer for agent payments.";
}

function defaultClose() {
  return "No token pitch. We need product feedback from builders who handle paid agent requests.";
}
