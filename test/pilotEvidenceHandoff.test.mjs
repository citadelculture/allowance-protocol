import assert from "node:assert/strict";
import {
  buildPilotEvidenceHandoff,
  publicPilotEvidenceHandoffReport
} from "../src/pilotEvidenceHandoff.mjs";

const readyTrafficActionPack = {
  valid: true,
  status: "ready_for_human_approval",
  preflight: {
    valid: true,
    status: "ready_for_merchant_approved_pilot",
    merchantId: "mcp_search",
    receiptPath: "ops/gateway-receipts.pilot.jsonl"
  },
  requests: [
    {
      step: "allowed_delivery",
      merchantId: "mcp_search",
      destination: "gateway:/v1/search",
      expectedOutcome: "merchant_approved_allowed_2xx_receipt",
      receiptPath: "ops/gateway-receipts.pilot.jsonl",
      command: "curl allowed"
    },
    {
      step: "denied_guard",
      merchantId: "mcp_search",
      destination: "gateway:/v1/search",
      expectedOutcome: "merchant_approved_denied_guard_receipt",
      receiptPath: "ops/gateway-receipts.pilot.jsonl",
      command: "curl denied"
    }
  ],
  packets: [
    {
      approvalId: "live_pilot_mcp_search_allowed_delivery",
      actionType: "live_pilot",
      status: "draft",
      action: {
        summary: "Human runs allowed_delivery request for mcp_search live pilot",
        destination: "gateway:/v1/search",
        executionMode: "human_only"
      },
      payload: {
        pilotStep: "allowed_delivery"
      }
    },
    {
      approvalId: "live_pilot_mcp_search_denied_guard",
      actionType: "live_pilot",
      status: "draft",
      action: {
        summary: "Human runs denied_guard request for mcp_search live pilot",
        destination: "gateway:/v1/search",
        executionMode: "human_only"
      },
      payload: {
        pilotStep: "denied_guard"
      }
    }
  ],
  reasons: [],
  warnings: []
};

const missingPilotEvidence = {
  valid: false,
  reasons: [
    "No merchant-approved testnet or mainnet receipt evidence found",
    "No credible denied receipt proving the guard blocks unsafe intent"
  ],
  warnings: [],
  required: {
    merchantId: null,
    minimumActiveAgents: 1
  }
};

const ready = buildPilotEvidenceHandoff(
  {
    trafficActionPack: readyTrafficActionPack,
    pilotEvidence: missingPilotEvidence
  },
  {
    generatedAt: "2026-06-09T16:20:00.000Z"
  }
);

assert.equal(ready.valid, true);
assert.equal(ready.status, "ready_for_pilot_evidence_collection");
assert.equal(ready.merchantId, "mcp_search");
assert.equal(ready.actionPack.requestCount, 2);
assert.equal(ready.actionPack.packetCount, 2);
assert.equal(ready.blockers.length, 0);
assert.equal(ready.evidenceGaps.length, 2);
assert.ok(ready.commands.prepareActionPack.includes("npm run pilot-traffic-action-pack"));
assert.ok(ready.commands.validateAllowedExecution.includes("npm run pilot-traffic-execution-evidence"));
assert.ok(ready.commands.pilotReport.includes("ops/gateway-receipts.pilot.jsonl"));
assert.ok(ready.markdown.includes("## Evidence Gaps"));
assert.equal(ready.evidenceBoundary.startsPilotTraffic, false);
assert.equal(ready.evidenceBoundary.finalExternalActionApprovalRequired, true);

const blocked = buildPilotEvidenceHandoff(
  {
    trafficActionPack: {
      valid: false,
      status: "needs_preflight_fixes",
      reasons: ["preflight: policy missing"],
      requests: []
    },
    pilotEvidence: missingPilotEvidence
  },
  {
    generatedAt: "2026-06-09T16:21:00.000Z"
  }
);

assert.equal(blocked.status, "blocked_by_preflight");
assert.ok(blocked.blockers.includes("traffic action pack: preflight: policy missing"));
assert.ok(blocked.blockers.includes("Pilot traffic handoff needs exactly two request drafts"));
assert.ok(blocked.nextAction.includes("signed production policy"));

const complete = buildPilotEvidenceHandoff(
  {
    trafficActionPack: readyTrafficActionPack,
    pilotEvidence: {
      valid: true,
      reasons: [],
      warnings: [],
      required: {
        merchantId: "mcp_search",
        minimumActiveAgents: 1
      },
      credibleAcceptanceSignals: {
        crediblePilotReceipts: 2,
        activeAgents: 1,
        pilotMerchants: ["mcp_search"]
      }
    }
  },
  {
    generatedAt: "2026-06-09T16:22:00.000Z"
  }
);

assert.equal(complete.status, "pilot_evidence_complete");
assert.equal(complete.blockers.length, 0);
assert.equal(complete.evidenceGaps.length, 0);
assert.ok(complete.nextAction.includes("approved pilot disclosure"));

const publicReport = publicPilotEvidenceHandoffReport(ready);
assert.equal(publicReport.markdown, undefined);
assert.equal(publicReport.status, "ready_for_pilot_evidence_collection");

console.log("pilotEvidenceHandoff tests passed");
