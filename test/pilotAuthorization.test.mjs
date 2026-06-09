import assert from "node:assert/strict";
import { buildPilotAuthorizationReport } from "../src/pilotAuthorization.mjs";

const intake = {
  merchantId: "research_api",
  name: "Research API",
  website: "https://research.example",
  service: {
    category: "research",
    endpointType: "api",
    description: "Research endpoint",
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

const interview = {
  id: "interview-001",
  prospectId: "p1",
  candidateId: "c1",
  status: "completed",
  valid: true,
  pilotApproval: {
    merchantId: "research_api",
    merchantApprovedTestEndpoint: true,
    testEndpoint: "https://research.example/v1/search"
  }
};

const packet = {
  authorizationId: "pilot-auth-001",
  generatedAt: "2026-06-08",
  interviewId: "interview-001",
  intakeRef: "ops/intakes/research_api.json",
  pilotPacketRef: "pilot-packet:research_api",
  publicSummary: "Experimental Allow Protocol pilot authorization. No token pitch.",
  merchant: {
    merchantId: "research_api",
    name: "Research API",
    approverRef: "merchant-ops",
    approvedAt: "2026-06-08"
  },
  pilot: {
    environment: "testnet",
    network: "eip155:84532",
    paymentRail: "x402",
    testEndpoint: "https://research.example/v1/search",
    pathPrefix: "/v1/search",
    amountUsd: 0.25,
    maxRequests: 4,
    maxTotalSpendUsd: 1,
    expiresAt: "2026-06-30",
    receiptLogPath: "ops/gateway-receipts.research-api.testnet.jsonl",
    evidenceLabel: "merchant-approved-testnet-research-api"
  },
  approvals: {
    merchantApprovedPilot: true,
    merchantUnderstandsExperimental: true,
    noProductionSla: true,
    noSecretsShared: true,
    noCustodyOrEscrow: true,
    noTokenPitch: true,
    dataUseApproved: true,
    disputePathApproved: true,
    publicClaimsRequireSeparateApproval: true
  },
  safety: {
    noTradingAuthority: true,
    merchantScoped: true,
    spendCapsReviewed: true,
    metadataPolicyReviewed: true,
    rateLimitReviewed: true,
    settlementProofRequired: true
  },
  dispute: {
    contact: "merchant-ops",
    processRef: "ops/dispute_template.json"
  },
  evidence: {
    label: "merchant-approved-testnet-research-api",
    publicUseApproved: false,
    caseStudyApproved: false
  }
};

const valid = buildPilotAuthorizationReport(packet, {
  intake,
  interview
});

assert.equal(valid.valid, true);
assert.equal(valid.status, "ready_for_pilot_binding");
assert.equal(valid.approvalRef, "pilot-authorization:pilot-auth-001");
assert.equal(valid.merchantReadiness.readyForTest, true);
assert.equal(valid.interview.valid, true);
assert.equal(valid.evidenceBoundary.startsPilotTraffic, false);
assert.equal(valid.evidenceBoundary.countsAsPilotEvidence, false);

const noIntake = buildPilotAuthorizationReport(packet, {
  interview
});
assert.equal(noIntake.valid, false);
assert.ok(noIntake.reasons.includes("A validated merchant intake is required for pilot authorization"));

const badSpend = buildPilotAuthorizationReport(
  {
    ...packet,
    pilot: {
      ...packet.pilot,
      maxTotalSpendUsd: 5
    }
  },
  {
    intake,
    interview
  }
);
assert.equal(badSpend.valid, false);
assert.ok(badSpend.reasons.includes("pilot.maxTotalSpendUsd must not exceed intake.risk.maxSafeTestSpendUsd"));

const badEndpoint = buildPilotAuthorizationReport(
  {
    ...packet,
    pilot: {
      ...packet.pilot,
      testEndpoint: "http://localhost:3000/v1/search"
    }
  },
  {
    intake,
    interview
  }
);
assert.equal(badEndpoint.valid, false);
assert.ok(badEndpoint.reasons.includes("pilot.testEndpoint must be an https URL"));
assert.ok(badEndpoint.reasons.includes("pilot.testEndpoint must match intake.integration.testEndpoint"));

const incompleteApproval = buildPilotAuthorizationReport(
  {
    ...packet,
    approvals: {
      ...packet.approvals,
      merchantApprovedPilot: false
    }
  },
  {
    intake,
    interview
  }
);
assert.equal(incompleteApproval.valid, false);
assert.ok(incompleteApproval.reasons.includes("approvals.merchantApprovedPilot must be true"));

const publicClaims = buildPilotAuthorizationReport(
  {
    ...packet,
    evidence: {
      ...packet.evidence,
      publicUseApproved: true
    }
  },
  {
    intake,
    interview
  }
);
assert.equal(publicClaims.valid, false);
assert.ok(publicClaims.reasons.includes("evidence.publicUseApproved must remain false until pilot-disclosure passes"));

const noInterviewApproval = buildPilotAuthorizationReport(packet, {
  intake,
  interview: {
    ...interview,
    pilotApproval: {
      merchantApprovedTestEndpoint: false
    }
  }
});
assert.equal(noInterviewApproval.valid, false);
assert.ok(noInterviewApproval.reasons.includes("Linked interview must include pilotApproval.merchantApprovedTestEndpoint=true"));

const tokenHype = buildPilotAuthorizationReport(
  {
    ...packet,
    publicSummary: "Experimental pilot and token launch for 100x market cap."
  },
  {
    intake,
    interview
  }
);
assert.equal(tokenHype.valid, false);
assert.ok(tokenHype.reasons.includes("Do not use price-hype or pump language"));
assert.ok(tokenHype.reasons.includes("Do not make market-cap or valuation claims"));

console.log("pilotAuthorization tests passed");
