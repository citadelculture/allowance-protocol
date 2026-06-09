import assert from "node:assert/strict";
import { buildBuilderQuickstartReport } from "../src/builderQuickstart.mjs";

const report = buildBuilderQuickstartReport({
  server: {
    protocol: "http",
    host: "127.0.0.1",
    port: 4174
  },
  intent: {
    merchantId: "mcp_search",
    amountUsd: 0.018,
    resource: "/v1/search?q=agent+payments",
    intentNonce: "quickstart-search-001",
    metadata: "public search context for agent payment integration"
  }
}, {
  generatedAt: "2026-06-09T14:50:00.000Z"
});

assert.equal(report.valid, true);
assert.equal(report.status, "ready");
assert.equal(report.server.origin, "http://127.0.0.1:4174");
assert.equal(report.demoPacket.valid, true);
assert.equal(report.demoPacket.decision, "allow");
assert.equal(report.scenarios.length, 4);
assert.deepEqual(report.scenarios.map((scenario) => scenario.pass), [true, true, true, true]);
assert.deepEqual(report.scenarios.map((scenario) => scenario.decision), ["allow", "deny", "deny", "deny"]);
assert.deepEqual(report.scenarios.map((scenario) => scenario.status), [200, 402, 402, 402]);
assert.ok(report.scenarios.find((scenario) => scenario.id === "replay_denied").reasons.some((reason) => reason.includes("already used")));
assert.ok(report.scenarios.find((scenario) => scenario.id === "pii_metadata_denied").reasons.some((reason) => reason.includes("restricted data")));
assert.ok(report.scenarios.find((scenario) => scenario.id === "blocked_category_denied").reasons.some((reason) => reason.includes("Blocked merchant category")));
assert.ok(report.curlCommands.allowedPreflight.includes("/api/x402/preflight"));
assert.ok(report.curlCommands.localPaidRouteAllowed.includes("/api/demo/paid-search"));
assert.equal(report.evidenceBoundary.sendsNetworkRequests, false);
assert.equal(report.evidenceBoundary.usesPrivateKeys, false);
assert.equal(report.evidenceBoundary.usesApiTokens, false);
assert.equal(report.evidenceBoundary.movesFunds, false);

const unsafe = buildBuilderQuickstartReport({
  liveExecutionRequested: true
});

assert.equal(unsafe.valid, false);
assert.equal(unsafe.status, "unsafe_live_execution");
assert.ok(unsafe.reasons.some((reason) => reason.includes("live posting")));

console.log("builderQuickstart tests passed");
