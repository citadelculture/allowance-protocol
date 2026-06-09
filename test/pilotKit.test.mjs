import assert from "node:assert/strict";
import { buildPilotKit } from "../src/pilotKit.mjs";

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

const kit = buildPilotKit(intake, { gatewayPort: 4999 });

assert.equal(kit.readiness.readyForTest, true);
assert.equal(kit.gatewayConfig.name, "allow-research_api-pilot");
assert.equal(kit.gatewayConfig.listen.port, 4999);
assert.equal(kit.gatewayConfig.upstream.baseUrl, "https://research.example");
assert.equal(kit.gatewayConfig.evidence.environment, "local");
assert.equal(kit.gatewayConfig.evidence.merchantApproved, false);
assert.equal(kit.gatewayConfig.evidence.rail, "x402");
assert.equal(kit.gatewayConfig.merchants[0].id, "research_api");
assert.equal(kit.gatewayConfig.routes[0].pathPrefix, "/v1/search");
assert.equal(kit.gatewayConfig.routes[0].amountUsd, 0.25);
assert.equal(kit.policyPatch.dailyCapUsd, 2);
assert.ok(kit.smokeTests.allowed.includes("research_api-allow-001"));
assert.ok(kit.smokeTests.deniedPii.includes("alex@example.com"));
assert.ok(kit.acceptanceCriteria.includes("`npm run gateway-smoke -- <gateway-config>` passes locally before merchant test traffic"));
assert.ok(kit.acceptanceCriteria.includes("Dispute packet path is agreed before any paid test traffic"));
assert.equal(kit.nextAction, "Send pilot kit to merchant and schedule protected endpoint test");

console.log("pilotKit tests passed");
