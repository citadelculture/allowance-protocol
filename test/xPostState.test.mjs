import assert from "node:assert/strict";
import { buildXPostExternalActionPacket } from "../src/xPostActionPack.mjs";
import { buildXPostStateReport } from "../src/xPostState.mjs";

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

const post = {
  id: "day-one-thesis",
  status: "draft_only",
  assetPath: "launch/allow-dashboard-rendered.png",
  text: "AI agents need allowances, not blank checks. No token pitch."
};

const approvalPacket = {
  ...buildXPostExternalActionPacket(post, {
    destination: "@allow_protocol",
    requestedBy: "operator",
    requestedAt: "2026-06-08",
    approvalIdPrefix: "x_post"
  }),
  status: "approved",
  approvedBy: "x-account-owner",
  approvedAt: "2026-06-08",
  approvals
};

function evidence(overrides = {}) {
  return {
    evidenceId: "x-post-exec-001",
    generatedAt: "2026-06-08T12:00:00.000Z",
    executionStatus: "posted",
    approvalRef: "external-action:x_post_day_one_thesis",
    approvalPacket,
    posted: {
      postedAt: "2026-06-08T12:05:00.000Z",
      postedBy: "x-account-owner",
      accountHandle: "@allow_protocol",
      postUrl: "https://x.com/allow_protocol/status/1800000000000000000",
      exactText: post.text,
      humanExecuted: true,
      accountOwnerApproved: true,
      automationUsed: false
    },
    proof: {
      type: "post_permalink",
      ref: "https://x.com/allow_protocol/status/1800000000000000000",
      capturedAt: "2026-06-08T12:06:00.000Z",
      redacted: true
    },
    ...overrides
  };
}

const empty = await buildXPostStateReport({
  launchPosts: [post],
  executionRecords: []
});
assert.equal(empty.valid, true);
assert.equal(empty.status, "no_x_post_execution_evidence_yet");
assert.equal(empty.posts[0].projected.status, "draft_only");

const unsupportedManualAdvance = await buildXPostStateReport({
  launchPosts: [{ ...post, status: "posted" }],
  executionRecords: []
});
assert.equal(unsupportedManualAdvance.valid, false);
assert.ok(unsupportedManualAdvance.reasons.includes("day-one-thesis: status=posted has no valid X post execution evidence"));

const posted = await buildXPostStateReport({
  launchPosts: [post],
  executionRecords: [evidence()]
});
assert.equal(posted.valid, true);
assert.equal(posted.status, "has_x_post_execution_evidence");
assert.equal(posted.counts.validExecutionRecords, 1);
assert.equal(posted.counts.postsWithValidatedExecution, 1);
assert.equal(posted.posts[0].projected.status, "posted");
assert.equal(posted.byProjectedStatus.posted, 1);
assert.ok(posted.warnings.includes("day-one-thesis: Launch post remains draft_only; projected state is posted from execution evidence"));

const backedPostedState = await buildXPostStateReport({
  launchPosts: [{ ...post, status: "posted" }],
  executionRecords: [evidence()]
});
assert.equal(backedPostedState.valid, true);
assert.equal(backedPostedState.status, "state_backed_by_x_post_evidence");

const unknownPost = await buildXPostStateReport({
  launchPosts: [post],
  executionRecords: [
    evidence({
      postId: "missing-post"
    })
  ]
});
assert.equal(unknownPost.valid, false);
assert.ok(unknownPost.reasons.includes("x-post-exec-001: Unknown launch post id: missing-post"));

const duplicateEvidence = await buildXPostStateReport({
  launchPosts: [post],
  executionRecords: [
    evidence(),
    evidence({
      posted: {
        ...evidence().posted,
        postUrl: "https://x.com/allow_protocol/status/1800000000000000001"
      }
    })
  ]
});
assert.equal(duplicateEvidence.valid, false);
assert.ok(duplicateEvidence.reasons.includes("x-post-exec-001: Duplicate evidenceId: x-post-exec-001"));
assert.ok(duplicateEvidence.reasons.includes("x-post-exec-001: Duplicate post execution evidence for postId: day-one-thesis"));

const staleText = await buildXPostStateReport({
  launchPosts: [{ ...post, text: "Changed launch text after approval." }],
  executionRecords: [evidence()]
});
assert.equal(staleText.valid, false);
assert.ok(staleText.reasons.includes("x-post-exec-001: approvalPacket.payload.post.text must match launch post text"));

const invalidRecord = await buildXPostStateReport({
  launchPosts: [post],
  executionRecords: [
    evidence({
      posted: {
        ...evidence().posted,
        automationUsed: true
      }
    })
  ]
});
assert.equal(invalidRecord.valid, false);
assert.ok(invalidRecord.reasons.some((reason) => reason.includes("posted.automationUsed must be false")));
assert.equal(invalidRecord.posts[0].projected.status, "draft_only");

console.log("xPostState tests passed");
