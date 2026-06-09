import assert from "node:assert/strict";
import { buildPilotDisclosureReport } from "../src/pilotDisclosure.mjs";

const credibleEvidence = {
  environment: "testnet",
  merchantApproved: true,
  rail: "x402",
  network: "eip155:84532"
};

const records = [
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
    reasons: ["Payment metadata contains restricted data"],
    evidence: credibleEvidence,
    receipt: {
      id: "deny_1",
      agentId: "agent-alpha",
      merchantId: "mcp_search",
      decision: "deny",
      amountUsd: 0.25
    }
  }
];

const packet = {
  disclosureId: "pilot_disclosure_001",
  status: "approved",
  generatedAt: "2026-06-08",
  merchantId: "mcp_search",
  evidenceRef: "pilot-disclosure:pilot_disclosure_001",
  publicSummary: "Allow completed 2 merchant-approved testnet policy decisions: one allowed delivery and one denied unsafe payment intent.",
  receiptIds: ["allow_1", "deny_1"],
  metrics: {
    environment: "testnet",
    policyDecisions: 2,
    crediblePolicyDecisions: 2,
    allowedReceipts: 1,
    deniedReceipts: 1,
    activeAgents: 1,
    blockedValueUsd: 0.25
  },
  merchantApproval: {
    approved: true,
    merchantId: "mcp_search",
    approvedAt: "2026-06-08",
    approverRef: "@merchant-reviewer",
    scope: ["public_metrics", "launch_posts"],
    partnerClaimApproved: false,
    statement: "Approved for public metric disclosure."
  },
  redaction: {
    rawMetadataRemoved: true,
    personalDataRemoved: true,
    secretsRemoved: true,
    receiptIdsOnly: true
  },
  redactedReceipts: [
    {
      id: "allow_1",
      decision: "allow",
      upstreamStatus: 200,
      reasonCategory: "policy_allowed"
    },
    {
      id: "deny_1",
      decision: "deny",
      upstreamStatus: null,
      reasonCategory: "metadata_risk_blocked"
    }
  ]
};

const valid = buildPilotDisclosureReport(packet, records);
assert.equal(valid.valid, true);
assert.deepEqual(valid.reasons, []);
assert.equal(valid.receiptCount, 2);
assert.equal(valid.evidenceReport.valid, true);

const draft = buildPilotDisclosureReport({ ...packet, status: "draft" }, records);
assert.equal(draft.valid, false);
assert.ok(draft.reasons.includes("Pilot disclosure must be approved before public use"));

const missingReceipt = buildPilotDisclosureReport({ ...packet, receiptIds: ["allow_1", "missing"] }, records);
assert.equal(missingReceipt.valid, false);
assert.ok(missingReceipt.reasons.includes("Missing receipt records for disclosure ids: missing"));

const localOnly = buildPilotDisclosureReport(
  packet,
  records.map((record) => ({
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
assert.ok(localOnly.reasons.some((reason) => reason.includes("not merchant-approved testnet or mainnet evidence")));

const overclaimed = buildPilotDisclosureReport(
  {
    ...packet,
    metrics: {
      ...packet.metrics,
      policyDecisions: 3
    }
  },
  records
);
assert.equal(overclaimed.valid, false);
assert.ok(overclaimed.reasons.includes("metrics.policyDecisions overstates selected receipt evidence"));

const raw = buildPilotDisclosureReport(
  {
    ...packet,
    rawMetadata: {
      email: "person@example.com"
    }
  },
  records
);
assert.equal(raw.valid, false);
assert.ok(raw.reasons.some((reason) => reason.includes("raw or secret field")));

const partnerClaim = buildPilotDisclosureReport(
  {
    ...packet,
    publicSummary: "Allow is officially partnered with Example API after 2 pilot receipts."
  },
  records
);
assert.equal(partnerClaim.valid, false);
assert.ok(partnerClaim.reasons.includes("Partnership, backing, endorsement, or integration claims require explicit approval"));

console.log("pilotDisclosure tests passed");
