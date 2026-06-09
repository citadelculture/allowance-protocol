import assert from "node:assert/strict";
import {
  buildMerchantPolicyPatch,
  scoreMerchantIntake,
  summarizeMerchantReadiness,
  validateMerchantIntake
} from "../src/merchantIntake.mjs";

const highFitIntake = {
  merchantId: "research_api",
  name: "Research API",
  website: "https://research.example",
  contact: {
    name: "Casey",
    role: "Founder",
    emailOrHandle: "@casey"
  },
  service: {
    category: "research",
    endpointType: "api",
    description: "Metered research endpoint for agents.",
    pricingModel: "per_request",
    examplePriceUsd: 0.25
  },
  agentPaymentFit: {
    expectsAgentUsers: true,
    currentX402Support: true,
    currentMcpSupport: false,
    needsSpendCaps: true,
    needsMetadataFilters: true,
    needsReplayProtection: true,
    needsReceipts: true
  },
  risk: {
    sensitiveMetadataClasses: ["query_text"],
    abuseModes: ["looped_agent_calls"],
    maxSafeTestSpendUsd: 2
  },
  integration: {
    preferredSurface: "server_middleware",
    canTestThisWeek: true,
    testEndpoint: "https://research.example/v1/search",
    successMetric: "public demo with one allowed receipt and one denied receipt"
  },
  notes: "Potential public case study."
};

const validation = validateMerchantIntake(highFitIntake);
assert.equal(validation.valid, true);
assert.deepEqual(validation.reasons, []);

const score = scoreMerchantIntake(highFitIntake);
assert.equal(score.total, 12);
assert.equal(score.tier, "immediate");

const readiness = summarizeMerchantReadiness(highFitIntake);
assert.equal(readiness.readyForTest, true);
assert.equal(readiness.nextAction, "Create Allow policy patch and run protected endpoint test");

const patch = buildMerchantPolicyPatch(highFitIntake);
assert.deepEqual(patch.policyPatch.allowedMerchants, ["research_api"]);
assert.equal(patch.policyPatch.perTxCapUsd, 0.25);
assert.equal(patch.policyPatch.dailyCapUsd, 2);
assert.equal(patch.policyPatch.requireIntentNonce, true);
assert.equal(patch.policyPatch.blockPii, true);

const incomplete = summarizeMerchantReadiness({
  merchantId: "",
  service: {
    endpointType: "unknown",
    pricingModel: "unknown",
    examplePriceUsd: 0
  },
  risk: {},
  integration: {
    preferredSurface: "unknown",
    canTestThisWeek: false
  }
});

assert.equal(incomplete.valid, false);
assert.equal(incomplete.readyForTest, false);
assert.ok(incomplete.reasons.includes("Missing merchantId"));
assert.ok(incomplete.nextAction.startsWith("Complete required fields"));

console.log("merchantIntake tests passed");
