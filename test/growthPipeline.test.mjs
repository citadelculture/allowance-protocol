import assert from "node:assert/strict";
import { scoreProspect, summarizePipeline } from "../src/growthPipeline.mjs";

const prospect = {
  id: "p1",
  name: "High Fit API",
  segment: "x402 sellers",
  contactStatus: "identified",
  outreachStatus: "not_started",
  score: {
    existingEndpoint: 2,
    usageBasedPricing: 2,
    agentUsersLikely: 2,
    metadataOrAbuseRisk: 2,
    canTestWithinWeek: 2,
    publicProofPotential: 1
  }
};

const scored = scoreProspect(prospect);
assert.equal(scored.score, 11);
assert.equal(scored.tier, "immediate");
assert.equal(scored.nextAction, "Send direct test-integration ask");

const lowFit = scoreProspect({
  id: "p2",
  name: "Low Fit",
  segment: "other",
  score: {
    existingEndpoint: 0,
    usageBasedPricing: 0,
    agentUsersLikely: 1,
    metadataOrAbuseRisk: 0,
    canTestWithinWeek: 0,
    publicProofPotential: 0
  }
});

assert.equal(lowFit.score, 1);
assert.equal(lowFit.tier, "skip");

const summary = summarizePipeline(
  [
    prospect,
    {
      id: "p3",
      name: "Async Fit",
      segment: "mcp",
      contactStatus: "needs_contact_discovery",
      outreachStatus: "not_started",
      score: {
        existingEndpoint: 2,
        usageBasedPricing: 1,
        agentUsersLikely: 1,
        metadataOrAbuseRisk: 1,
        canTestWithinWeek: 1,
        publicProofPotential: 1
      }
    }
  ],
  []
);

assert.equal(summary.counts.total, 2);
assert.equal(summary.integrationCandidates, 1);
assert.equal(summary.topProspects[0].name, "High Fit API");
assert.equal(summary.nextRecruitingAction, "Find contact and send product-feedback ask for High Fit API");

console.log("growthPipeline tests passed");
