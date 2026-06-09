import assert from "node:assert/strict";
import { buildXPostExternalActionPacket } from "../src/xPostActionPack.mjs";
import { buildXPostExecutionEvidenceReport } from "../src/xPostExecutionEvidence.mjs";

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

const validEvidence = {
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
  }
};

const valid = await buildXPostExecutionEvidenceReport(validEvidence);
assert.equal(valid.valid, true);
assert.equal(valid.status, "verified_x_post_execution");
assert.equal(valid.approvalReport.valid, true);
assert.equal(valid.postReport.valid, true);
assert.equal(valid.evidenceBoundary.postsContent, false);
assert.equal(valid.evidenceBoundary.marksTokenReady, false);

const unapproved = await buildXPostExecutionEvidenceReport({
  ...validEvidence,
  approvalPacket: {
    ...approvalPacket,
    status: "draft",
    approvedBy: "",
    approvals: {
      ...approvals,
      humanWillExecute: false
    }
  }
});
assert.equal(unapproved.valid, false);
assert.ok(unapproved.reasons.includes("approvalPacket: External action must be approved before execution"));
assert.ok(unapproved.reasons.includes("approvalPacket.status must be approved"));

const automated = await buildXPostExecutionEvidenceReport({
  ...validEvidence,
  posted: {
    ...validEvidence.posted,
    automationUsed: true
  }
});
assert.equal(automated.valid, false);
assert.ok(automated.reasons.includes("posted.automationUsed must be false"));

const mismatch = await buildXPostExecutionEvidenceReport({
  ...validEvidence,
  posted: {
    ...validEvidence.posted,
    exactText: `${post.text}\nDifferent trailing line.`
  }
});
assert.equal(mismatch.valid, false);
assert.ok(mismatch.reasons.includes("posted.exactText must match approvalPacket.action.exactText"));

const badUrl = await buildXPostExecutionEvidenceReport({
  ...validEvidence,
  posted: {
    ...validEvidence.posted,
    postUrl: "https://example.com/not-x"
  }
});
assert.equal(badUrl.valid, false);
assert.ok(badUrl.reasons.includes("posted.postUrl must be a public X/Twitter status URL"));

const secret = await buildXPostExecutionEvidenceReport({
  ...validEvidence,
  posted: {
    ...validEvidence.posted,
    exactText: `${post.text}\napi_key=abc123`
  }
});
assert.equal(secret.valid, false);
assert.ok(secret.reasons.includes("X post execution evidence must not include API keys, secrets, or passwords"));

const unredacted = await buildXPostExecutionEvidenceReport({
  ...validEvidence,
  proof: {
    ...validEvidence.proof,
    redacted: false
  }
});
assert.equal(unredacted.valid, false);
assert.ok(unredacted.reasons.includes("proof.redacted must be true"));

console.log("xPostExecutionEvidence tests passed");
