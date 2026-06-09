import assert from "node:assert/strict";
import {
  buildOutreachActionPack,
  buildOutreachExternalActionPacket
} from "../src/outreachActionPack.mjs";
import { buildExternalActionApprovalReport } from "../src/externalActionApproval.mjs";

const draft = {
  prospectId: "p1",
  candidateId: "c1",
  channel: "contact form",
  destination: "https://example.com/contact",
  subject: "Allow Protocol feedback for paid search endpoint",
  message: [
    "Hi Example API,",
    "",
    "I am building Allow Protocol, a no-custody policy layer for agent payments.",
    "",
    "Would you be open to giving blunt feedback on one low-risk endpoint?",
    "",
    "No token pitch. I am trying to learn where agent-payment guardrails are actually painful."
  ].join("\n"),
  status: "draft_only"
};

const packet = buildOutreachExternalActionPacket(draft, {
  requestedBy: "operator",
  requestedAt: "2026-06-08",
  approvalIdPrefix: "outreach"
});

assert.equal(packet.approvalId, "outreach_c1");
assert.equal(packet.actionType, "merchant_outreach");
assert.equal(packet.status, "draft");
assert.equal(packet.action.executionMode, "human_only");
assert.equal(packet.action.automated, false);
assert.equal(packet.action.exactText, draft.message);
assert.equal(packet.payload.outreachDraft, draft);
assert.equal(packet.approvals.humanWillExecute, false);

const pack = buildOutreachActionPack(
  {
    drafts: [draft]
  },
  {
    requestedBy: "operator",
    requestedAt: "2026-06-08",
    approvalIdPrefix: "outreach"
  }
);

assert.equal(pack.valid, true);
assert.equal(pack.status, "ready_for_human_approval");
assert.equal(pack.count, 1);
assert.equal(pack.validDraftCount, 1);
assert.equal(pack.evidenceBoundary.sendsOutreach, false);
assert.equal(pack.evidenceBoundary.finalExternalActionApprovalRequired, true);

const unapprovedFinal = await buildExternalActionApprovalReport(packet);
assert.equal(unapprovedFinal.valid, false);
assert.ok(unapprovedFinal.reasons.includes("External action must be approved before execution"));
assert.ok(unapprovedFinal.reasons.includes("approvals.humanWillExecute must be true"));

const approvedPacket = {
  ...packet,
  status: "approved",
  approvedBy: "account-owner",
  approvedAt: "2026-06-08",
  approvals: Object.fromEntries(Object.keys(packet.approvals).map((flag) => [flag, true]))
};
const approvedFinal = await buildExternalActionApprovalReport(approvedPacket);
assert.equal(approvedFinal.valid, true);
assert.deepEqual(approvedFinal.reasons, []);

const invalidPack = buildOutreachActionPack({
  drafts: [
    {
      ...draft,
      status: "sent",
      message: `${draft.message}\nThis is a 100x token launch.`
    }
  ]
});
assert.equal(invalidPack.valid, false);
assert.equal(invalidPack.status, "needs_draft_fixes");
assert.ok(invalidPack.reasons.includes("Outreach must remain draft_only until explicitly approved and sent by a human"));
assert.ok(invalidPack.reasons.includes("Do not use price-hype or pump language"));

console.log("outreachActionPack tests passed");
