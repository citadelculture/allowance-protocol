import assert from "node:assert/strict";
import {
  buildActionTimeApprovalDecisionTemplate,
  validateActionTimeApprovalDecision
} from "../src/actionTimeApprovalDecision.mjs";

const approvalFlags = {
  humanWillExecute: false,
  automationDisabled: false,
  exactActionReviewed: false,
  externalSideEffectAcknowledged: false,
  noPrivateKeys: false,
  noCustodyOrEscrow: false,
  noTokenPitch: false,
  noMarketManipulation: false,
  legalEthicsReviewed: false
};

const approvalRequest = {
  valid: true,
  ready: true,
  status: "ready_for_human_decision",
  approvalId: "x_post_day_one",
  actionType: "x_post",
  packetPath: "packets/01-x-post-day-one.draft.json",
  commands: [
    "npm run external-action-approval -- work/external-action-workspace/packets/01-x-post-day-one.draft.json",
    "npm run x-post-execution-evidence -- work/external-action-workspace/evidence/01-x-post-day-one.x-post-execution.template.json"
  ],
  reasons: [],
  warnings: []
};

const draftPacket = {
  approvalId: "x_post_day_one",
  actionType: "x_post",
  status: "draft",
  requestedBy: "allow-operator",
  requestedAt: "2026-06-09",
  approvedBy: "",
  approvedAt: "",
  action: {
    summary: "Human posts Allow launch draft",
    channel: "x",
    destination: "@allow_protocol",
    exactText: "AI agents should not get blank-check wallets.",
    executionMode: "human_only",
    automated: false
  },
  approvals: { ...approvalFlags },
  payload: {
    post: {
      id: "day-one",
      status: "draft_only",
      text: "AI agents should not get blank-check wallets."
    }
  }
};

const draftPacketSource = `${JSON.stringify(draftPacket, null, 2)}\n`;
const report = buildActionTimeApprovalDecisionTemplate(
  {
    approvalRequest,
    draftPacket,
    draftPacketSource
  },
  {
    generatedAt: "2026-06-09T10:30:00.000Z"
  }
);

assert.equal(report.valid, true);
assert.equal(report.status, "ready_for_decision_record");
assert.equal(report.template.status, "pending");
assert.equal(report.template.decision, "pending");
assert.equal(report.template.packet.path, "packets/01-x-post-day-one.draft.json");
assert.equal(report.template.packet.bytes, Buffer.byteLength(draftPacketSource, "utf8"));
assert.match(report.template.packet.sha256, /^0x[0-9a-f]{64}$/);
assert.match(report.template.packet.exactTextSha256, /^0x[0-9a-f]{64}$/);
assert.equal(report.template.packet.exactTextChars, 45);
assert.equal(report.template.approvals.humanWillExecute, false);
assert.equal(report.template.assertions.packetHashReviewed, false);
assert.equal(report.evidenceBoundary.approvesExternalAction, false);
assert.equal(report.evidenceBoundary.postsContent, false);
assert.equal(report.evidenceBoundary.updatesCanonicalState, false);

const pendingValidation = validateActionTimeApprovalDecision(report.template, {
  approvalRequest,
  draftPacket,
  draftPacketSource
});

assert.equal(pendingValidation.valid, true);
assert.equal(pendingValidation.status, "pending_decision");
assert.equal(pendingValidation.decision, "pending");

const approvedDecision = {
  ...report.template,
  status: "approved",
  decision: "approved",
  reviewer: {
    approvedBy: "dom",
    approvedAt: "2026-06-09T10:35:00.000Z",
    decisionReason: "Reviewed exact draft packet and approved manual posting."
  },
  approvals: Object.fromEntries(Object.keys(report.template.approvals).map((flag) => [flag, true])),
  assertions: Object.fromEntries(Object.keys(report.template.assertions).map((assertion) => [assertion, true]))
};

const approvedValidation = validateActionTimeApprovalDecision(approvedDecision, {
  approvalRequest,
  draftPacket,
  draftPacketSource
});

assert.equal(approvedValidation.valid, true);
assert.equal(approvedValidation.status, "approved_decision");

const missingAssertion = validateActionTimeApprovalDecision(
  {
    ...approvedDecision,
    assertions: {
      ...approvedDecision.assertions,
      packetHashReviewed: false
    }
  },
  {
    approvalRequest,
    draftPacket,
    draftPacketSource
  }
);

assert.equal(missingAssertion.valid, false);
assert.ok(missingAssertion.reasons.includes("assertions.packetHashReviewed must be true for approved decisions"));

const tamperedSource = validateActionTimeApprovalDecision(report.template, {
  approvalRequest,
  draftPacket,
  draftPacketSource: `${draftPacketSource}\n`
});

assert.equal(tamperedSource.valid, false);
assert.ok(tamperedSource.reasons.includes("decision packet.sha256 must match the current draft packet bytes"));

const prefilledPacket = buildActionTimeApprovalDecisionTemplate({
  approvalRequest,
  draftPacket: {
    ...draftPacket,
    approvals: {
      ...draftPacket.approvals,
      humanWillExecute: true
    }
  },
  draftPacketSource
});

assert.equal(prefilledPacket.valid, false);
assert.ok(prefilledPacket.reasons.some((reason) => reason.includes("must not prefill approval flags")));

console.log("actionTimeApprovalDecision tests passed");
