import assert from "node:assert/strict";
import { buildExternalActionApprovalReport } from "../src/externalActionApproval.mjs";
import { buildXPostActionPack } from "../src/xPostActionPack.mjs";

const post = {
  id: "builder-ask",
  status: "draft_only",
  assetPath: "launch/allow-dashboard-rendered.png",
  text: "Looking for API/MCP builders to test no-custody allowance checks for agent payments. No token pitch."
};
const approvals = {
  humanWillExecute: true,
  automationDisabled: true,
  exactActionReviewed: true,
  externalSideEffectAcknowledged: true,
  noPrivateKeys: true,
  noCustodyOrEscrow: true,
  noTokenPitch: true,
  noMarketManipulation: true,
  legalEthicsReviewed: true
};

const pack = buildXPostActionPack([post], {
  destination: "@allow_protocol",
  requestedAt: "2026-06-08"
});
assert.equal(pack.valid, true);
assert.equal(pack.status, "ready_for_human_approval");
assert.equal(pack.readyDrafts, 1);
assert.equal(pack.packets.length, 1);
assert.equal(pack.evidenceBoundary.postsContent, false);
assert.equal(pack.evidenceBoundary.finalExternalActionApprovalRequired, true);

const packet = pack.packets[0];
assert.equal(packet.actionType, "x_post");
assert.equal(packet.status, "draft");
assert.equal(packet.action.destination, "@allow_protocol");
assert.equal(packet.action.exactText, post.text);
assert.equal(packet.payload.post.id, post.id);
assert.equal(packet.approvals.noTokenPitch, false);

const approvedPacket = {
  ...packet,
  status: "approved",
  approvedBy: "x-account-owner",
  approvedAt: "2026-06-08",
  approvals
};
const approved = await buildExternalActionApprovalReport(approvedPacket);
assert.equal(approved.valid, true);
assert.equal(approved.typeReport.post.id, post.id);

const badHandle = buildXPostActionPack([post], {
  destination: "not-a-handle"
});
assert.equal(badHandle.valid, false);
assert.ok(badHandle.reasons.includes("destination must be the X account handle"));

const sentPost = buildXPostActionPack([{ ...post, status: "posted" }]);
assert.equal(sentPost.valid, false);
assert.ok(sentPost.reasons.includes("builder-ask: post.status must be draft_only before preparing X action approvals"));
assert.ok(sentPost.warnings.some((warning) => warning.includes("Post is not marked draft_only")));

const tokenPitch = buildXPostActionPack([
  {
    ...post,
    text: "Buy the Allow token now. Guaranteed returns."
  }
]);
assert.equal(tokenPitch.valid, false);
assert.ok(tokenPitch.reasons.some((reason) => reason.includes("Do not promote a token")));

const mismatch = await buildExternalActionApprovalReport({
  ...approvedPacket,
  action: {
    ...approvedPacket.action,
    exactText: "Different text"
  }
});
assert.equal(mismatch.valid, false);
assert.ok(mismatch.reasons.includes("x_post: action.exactText must exactly match payload.post.text"));

console.log("xPostActionPack tests passed");
