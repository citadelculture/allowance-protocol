import assert from "node:assert/strict";
import { buildPilotEvidenceReport } from "../src/pilotEvidence.mjs";

const credibleEvidence = {
  environment: "testnet",
  merchantApproved: true,
  rail: "x402",
  network: "eip155:84532"
};

const validRecords = [
  {
    merchantId: "mcp_search",
    decision: "allow",
    upstreamStatus: 200,
    evidence: credibleEvidence,
    receipt: {
      id: "allow_1",
      agentId: "agent-alpha",
      merchantId: "mcp_search",
      decision: "allow",
      amountUsd: 0.018
    }
  },
  {
    merchantId: "mcp_search",
    decision: "deny",
    reasons: ["Payment metadata contains restricted data: email"],
    evidence: credibleEvidence,
    receipt: {
      id: "deny_1",
      agentId: "agent-alpha",
      merchantId: "mcp_search",
      decision: "deny",
      amountUsd: 0.018
    }
  }
];

const valid = buildPilotEvidenceReport(validRecords);
assert.equal(valid.valid, true);
assert.deepEqual(valid.reasons, []);
assert.equal(valid.credibleAcceptanceSignals.hasAllowedReceipt, true);
assert.equal(valid.credibleAcceptanceSignals.hasDeniedReceipt, true);
assert.equal(valid.credibleAcceptanceSignals.hasSuccessfulUpstream, true);
assert.deepEqual(valid.credibleAcceptanceSignals.pilotMerchants, ["mcp_search"]);
assert.equal(valid.credibleAcceptanceSignals.activeAgents, 1);

const localOnly = buildPilotEvidenceReport(
  validRecords.map((record) => ({
    ...record,
    evidence: {
      environment: "local",
      merchantApproved: false,
      rail: "x402",
      network: "eip155:84532"
    }
  }))
);
assert.equal(localOnly.valid, false);
assert.ok(localOnly.reasons.includes("No merchant-approved testnet or mainnet receipt evidence found"));

const noDenied = buildPilotEvidenceReport([validRecords[0]]);
assert.equal(noDenied.valid, false);
assert.ok(noDenied.reasons.includes("No credible denied receipt proving the guard blocks unsafe intent"));

const wrongMerchant = buildPilotEvidenceReport(validRecords, { merchantId: "vector_cloud" });
assert.equal(wrongMerchant.valid, false);
assert.ok(wrongMerchant.reasons.includes("No receipt records found for merchant vector_cloud"));

const needsMoreAgents = buildPilotEvidenceReport(validRecords, { minimumActiveAgents: 2 });
assert.equal(needsMoreAgents.valid, false);
assert.ok(needsMoreAgents.reasons.includes("Credible pilot needs at least 2 active agents"));

console.log("pilotEvidence tests passed");
