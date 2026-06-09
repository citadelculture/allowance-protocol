import assert from "node:assert/strict";
import {
  buildPilotGatewayConfigReport,
  validatePilotGatewayPaymentRequirements
} from "../src/pilotGatewayConfig.mjs";

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

const paymentRequirements = {
  scheme: "exact",
  network: "eip155:84532",
  asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  amount: "250000",
  payTo: "0x122F8Fcaf2152420445Aa424E1D8C0306935B5c9",
  maxTimeoutSeconds: 60,
  extra: {
    name: "USDC",
    version: "2"
  }
};

const ready = buildPilotGatewayConfigReport(
  packet,
  {
    intake,
    interview
  },
  {
    paymentRequirements
  }
);

assert.equal(ready.valid, true);
assert.equal(ready.status, "ready_for_live_pilot_preflight");
assert.equal(ready.gatewayConfig.upstream.baseUrl, "https://research.example");
assert.equal(ready.gatewayConfig.routes[0].pathPrefix, "/v1/search");
assert.equal(ready.gatewayConfig.routes[0].merchantId, "research_api");
assert.equal(ready.gatewayConfig.settlement.merchantApproval.approved, true);
assert.equal(ready.gatewayConfig.settlement.merchantApproval.approvalRef, "pilot-authorization:pilot-auth-001");
assert.equal(ready.gatewayConfig.settlement.paymentRequirements.network, "eip155:84532");
assert.equal(ready.gatewayConfig.evidence.merchantApproved, true);
assert.equal(ready.gatewayConfig.rateLimit.max, 4);
assert.equal(ready.evidenceBoundary.startsPilotTraffic, false);
assert.equal(ready.evidenceBoundary.movesFunds, false);

const draft = buildPilotGatewayConfigReport(packet, {
  intake,
  interview
});
assert.equal(draft.valid, false);
assert.equal(draft.status, "draft_needs_payment_requirements");
assert.ok(draft.reasons.includes("x402 paymentRequirements are required before a pilot gateway config is live-preflight ready"));
assert.equal(draft.gatewayConfig.settlement.merchantApproval.approved, false);

const wrongNetwork = buildPilotGatewayConfigReport(
  packet,
  {
    intake,
    interview
  },
  {
    paymentRequirements: {
      ...paymentRequirements,
      network: "eip155:8453"
    }
  }
);
assert.equal(wrongNetwork.valid, false);
assert.equal(wrongNetwork.status, "draft_needs_payment_requirements");
assert.ok(wrongNetwork.reasons.includes("paymentRequirements.network must match the pilot authorization network"));

const badAddress = validatePilotGatewayPaymentRequirements(
  {
    ...paymentRequirements,
    payTo: "not-an-address"
  },
  {
    required: true,
    expectedNetwork: "eip155:84532",
    paymentRail: "x402"
  }
);
assert.equal(badAddress.valid, false);
assert.ok(badAddress.reasons.includes("paymentRequirements.payTo must be a 20-byte EVM address"));

const invalidAuthorization = buildPilotGatewayConfigReport(
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
  },
  {
    paymentRequirements
  }
);
assert.equal(invalidAuthorization.valid, false);
assert.equal(invalidAuthorization.status, "needs_authorization_fixes");
assert.ok(invalidAuthorization.reasons.includes("authorization: approvals.merchantApprovedPilot must be true"));
assert.equal(invalidAuthorization.gatewayConfig.settlement.merchantApproval.approved, false);

console.log("pilotGatewayConfig tests passed");
