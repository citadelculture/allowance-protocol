import assert from "node:assert/strict";
import { buildMerchantPilotPacket } from "../src/pilotPacket.mjs";

const intake = {
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

const packet = await buildMerchantPilotPacket(intake, { gatewayPort: 4999 });
assert.equal(packet.valid, true);
assert.equal(packet.status, "ready_for_human_review");
assert.equal(packet.merchantId, "research_api");
assert.equal(packet.gatewayConfig.listen.port, 4999);
assert.equal(packet.localSmoke.valid, true);
assert.equal(packet.localSmoke.receipts.length, 2);
assert.equal(packet.evidenceBoundary.localSmokeCountsAsPilotEvidence, false);
assert.ok(packet.commands.validatePilotEvidence.includes("ALLOW_PILOT_MERCHANT_ID=research_api"));
assert.ok(packet.commands.localGatewaySmoke.includes("<pilot-gateway-config.json>"));
assert.ok(packet.humanApprovalChecklist.some((item) => item.includes("Merchant confirms endpoint")));
assert.ok(packet.warnings.includes("Packet is review-only and must not be treated as merchant approval."));

const incompletePacket = await buildMerchantPilotPacket({
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
assert.equal(incompletePacket.valid, false);
assert.equal(incompletePacket.status, "action_required");
assert.ok(incompletePacket.reasons.includes("Missing merchantId"));

console.log("pilotPacket tests passed");
