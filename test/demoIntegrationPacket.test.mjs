import assert from "node:assert/strict";
import {
  DEFAULT_DEMO_INTEGRATION_INTENT,
  buildDemoIntegrationPacket
} from "../src/demoIntegrationPacket.mjs";

const report = buildDemoIntegrationPacket({}, {
  generatedAt: "2026-06-09T14:20:00.000Z"
});

assert.equal(report.valid, true);
assert.equal(report.status, "ready");
assert.equal(report.decision, "allow");
assert.equal(report.preflightStatus, 200);
assert.equal(report.packet.summary.merchantId, "mcp_search");
assert.equal(report.packet.summary.decision, "allow");
assert.equal(report.packet.httpPreflight.request.headers["x-allow-merchant"], "mcp_search");
assert.equal(report.packet.httpPreflight.request.headers["x-allow-policy"], "allow_policy_demo_alpha");
assert.equal(report.packet.httpPreflight.response.headers["x-allow-decision"], "allow");
assert.equal(report.packet.httpPreflight.response.headers["x-allow-receipt"], report.receiptId);
assert.equal(report.packet.receipt.id, report.receiptId);
assert.equal(report.packet.x402CompatiblePayment.paymentRequirements.asset, "USDC");
assert.equal(report.packet.evidenceBoundary.usesPrivateKeys, false);
assert.equal(report.packet.evidenceBoundary.usesApiTokens, false);
assert.equal(report.packet.evidenceBoundary.movesFunds, false);

const denied = buildDemoIntegrationPacket({
  intent: {
    ...DEFAULT_DEMO_INTEGRATION_INTENT,
    merchantId: "lead_graph",
    amountUsd: 0.35,
    resource: "/v1/leads/export",
    intentNonce: "demo-pii-001",
    metadata: "export leads for dom@example.com with phone +41 44 555 0101"
  }
});

assert.equal(denied.valid, true);
assert.equal(denied.status, "ready");
assert.equal(denied.decision, "deny");
assert.equal(denied.preflightStatus, 402);
assert.ok(denied.packet.httpPreflight.response.body.reasons.some((reason) => reason.includes("restricted data")));
assert.ok(denied.warnings.some((warning) => warning.includes("blocked request")));

const unsafe = buildDemoIntegrationPacket({
  liveExecutionRequested: true
});

assert.equal(unsafe.valid, false);
assert.equal(unsafe.status, "unsafe_live_execution");
assert.equal(unsafe.packet, null);
assert.ok(unsafe.reasons.some((reason) => reason.includes("live posting")));

const missingNonce = buildDemoIntegrationPacket({
  intent: {
    ...DEFAULT_DEMO_INTEGRATION_INTENT,
    intentNonce: ""
  }
});

assert.equal(missingNonce.valid, false);
assert.equal(missingNonce.status, "needs_valid_intent");
assert.ok(missingNonce.reasons.includes("Missing intent nonce"));

console.log("demoIntegrationPacket tests passed");
