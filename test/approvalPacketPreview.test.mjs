import assert from "node:assert/strict";
import { buildActionTimeApprovalDecisionTemplate } from "../src/actionTimeApprovalDecision.mjs";
import { buildApprovalPacketPreview } from "../src/approvalPacketPreview.mjs";

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
    "npm run external-action-approval -- work/external-action-workspace/packets/01-x-post-day-one.draft.json"
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
const decisionTemplate = buildActionTimeApprovalDecisionTemplate({
  approvalRequest,
  draftPacket,
  draftPacketSource
}).template;

const approvedDecision = {
  ...decisionTemplate,
  status: "approved",
  decision: "approved",
  reviewer: {
    approvedBy: "dom",
    approvedAt: "2026-06-09T11:40:00.000Z",
    decisionReason: "Reviewed exact draft packet and approved manual posting."
  },
  approvals: Object.fromEntries(Object.keys(decisionTemplate.approvals).map((flag) => [flag, true])),
  assertions: Object.fromEntries(Object.keys(decisionTemplate.assertions).map((assertion) => [assertion, true]))
};

const preview = await buildApprovalPacketPreview(
  {
    approvalDecision: approvedDecision,
    approvalRequest,
    draftPacket,
    draftPacketSource
  },
  {
    generatedAt: "2026-06-09T11:41:00.000Z"
  }
);

assert.equal(preview.valid, true);
assert.equal(preview.status, "ready_for_external_action_approval");
assert.equal(preview.approvedPacket.status, "approved");
assert.equal(preview.approvedPacket.approvedBy, "dom");
assert.equal(preview.approvedPacket.approvedAt, "2026-06-09T11:40:00.000Z");
assert.equal(preview.approvedPacket.approvals.humanWillExecute, true);
assert.equal(preview.approvedPacket.approvalDecisionRef.packetSha256, approvedDecision.packet.sha256);
assert.equal(preview.externalActionApproval.valid, true);
assert.equal(preview.evidenceBoundary.approvesExternalAction, false);
assert.equal(preview.evidenceBoundary.marksOriginalPacketApproved, false);
assert.equal(preview.evidenceBoundary.postsContent, false);

const pendingPreview = await buildApprovalPacketPreview({
  approvalDecision: decisionTemplate,
  approvalRequest,
  draftPacket,
  draftPacketSource
});

assert.equal(pendingPreview.valid, false);
assert.equal(pendingPreview.status, "needs_approved_decision");
assert.equal(pendingPreview.approvedPacket, null);
assert.ok(pendingPreview.reasons.includes("Approval decision must be approved before deriving an approved packet preview"));

const tamperedPreview = await buildApprovalPacketPreview({
  approvalDecision: approvedDecision,
  approvalRequest,
  draftPacket,
  draftPacketSource: `${draftPacketSource}\n`
});

assert.equal(tamperedPreview.valid, false);
assert.ok(tamperedPreview.reasons.some((reason) => reason.includes("packet.sha256")));

console.log("approvalPacketPreview tests passed");
