import assert from "node:assert/strict";
import { buildInterviewCampaignPlan } from "../src/interviewCampaign.mjs";

const script = {
  questions: [
    "Do agents call your API?",
    "Do you price per request?",
    "What can go wrong?",
    "Do you need spend limits?",
    "Would receipts help?"
  ]
};

const prospect = {
  id: "p1",
  name: "High Fit API",
  segment: "x402 sellers",
  score: {
    existingEndpoint: 2,
    usageBasedPricing: 2,
    agentUsersLikely: 2,
    metadataOrAbuseRisk: 2,
    canTestWithinWeek: 2,
    publicProofPotential: 1
  }
};

function candidate(id, confidence = 0.8, status = "draft_ready") {
  return {
    id,
    prospectId: "p1",
    name: `Candidate ${id}`,
    relevantSurface: "paid search endpoint",
    contactPath: `https://example.com/${id}`,
    preferredChannel: "contact form",
    publicEvidence: "Public API docs.",
    confidence,
    status
  };
}

const plan = buildInterviewCampaignPlan(
  {
    prospects: [prospect],
    candidates: [
      candidate("used", 1),
      candidate("a", 0.9),
      candidate("b", 0.7),
      candidate("blocked", 0.99, "needs_contact_discovery")
    ],
    interviews: [
      { id: "i1", candidateId: "used", status: "scheduled" },
      { id: "i2", candidateId: "done", status: "completed" }
    ],
    script
  },
  { minimumCompleted: 5, limit: 2 }
);

assert.equal(plan.valid, true);
assert.equal(plan.status, "ready_for_human_review");
assert.equal(plan.campaignTarget.recordedCompletedCount, 1);
assert.equal(plan.campaignTarget.scheduledCount, 1);
assert.equal(plan.campaignTarget.shortfall, 4);
assert.equal(plan.campaignTarget.plannedActionCount, 2);
assert.equal(plan.campaignTarget.shortfallAfterPlan, 2);
assert.deepEqual(plan.plannedActions.map((action) => action.candidateId), ["a", "b"]);
assert.ok(plan.blockedCandidates.some((item) => item.candidateId === "used" && item.usedByInterview));
assert.ok(plan.blockedCandidates.some((item) => item.candidateId === "blocked"));
assert.equal(plan.evidenceBoundary.sendsOutreach, false);
assert.equal(plan.evidenceBoundary.countsAsCompletedInterview, false);
assert.equal(plan.evidenceBoundary.tokenPitch, false);

const complete = buildInterviewCampaignPlan(
  {
    prospects: [prospect],
    candidates: [candidate("later")],
    interviews: [1, 2, 3, 4, 5].map((id) => ({ id: `i${id}`, status: "completed" })),
    script
  },
  { minimumCompleted: 5 }
);

assert.equal(complete.valid, true);
assert.equal(complete.status, "complete");
assert.equal(complete.plannedActions.length, 0);

const needsScript = buildInterviewCampaignPlan({
  prospects: [prospect],
  candidates: [candidate("a")],
  interviews: [],
  script: { questions: ["q1"] }
});

assert.equal(needsScript.valid, false);
assert.equal(needsScript.status, "needs_script");
assert.ok(needsScript.reasons.includes("Interview script must include at least five questions"));

const noCandidates = buildInterviewCampaignPlan({
  prospects: [prospect],
  candidates: [candidate("blocked", 0.5, "needs_contact_discovery")],
  interviews: [],
  script
});

assert.equal(noCandidates.valid, false);
assert.equal(noCandidates.status, "needs_contact_discovery");
assert.ok(noCandidates.reasons.includes("No draft-ready interview candidates are available for human review"));

console.log("interviewCampaign tests passed");
