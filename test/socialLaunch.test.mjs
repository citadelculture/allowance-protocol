import assert from "node:assert/strict";
import { countPostChars, summarizeLaunchPosts, validateXPost } from "../src/socialLaunch.mjs";

assert.equal(countPostChars("Allow"), 5);

const valid = validateXPost({
  id: "p1",
  status: "draft_only",
  text: "AI agents need allowances, not blank checks."
});

assert.equal(valid.valid, true);
assert.equal(valid.warnings.length, 0);
assert.ok(valid.remaining > 0);

const tooLong = validateXPost({
  id: "p2",
  status: "draft_only",
  text: "x".repeat(281)
});

assert.equal(tooLong.valid, false);
assert.ok(tooLong.reasons.includes("Post exceeds 280 characters"));

const risky = validateXPost({
  id: "p3",
  status: "draft_only",
  text: "Allow token presale will be a 100x investment opportunity."
});

assert.equal(risky.valid, false);
assert.ok(risky.reasons.includes("Do not promote a token, airdrop, presale, or whitelist"));
assert.ok(risky.reasons.includes("Do not use price-hype or pump language"));
assert.ok(risky.claimFlags.includes("token_sale"));

const metricClaim = validateXPost({
  id: "p4",
  status: "draft_only",
  text: "Allow processed 1000 receipts this week.",
  evidenceRef: "metrics-report:2026-06-08"
});

assert.equal(metricClaim.valid, true);

const strictMetricClaim = validateXPost(
  {
    id: "p5",
    status: "draft_only",
    text: "Allow processed 1000 receipts this week.",
    evidenceRef: "metrics-report:2026-06-08"
  },
  {
    validEvidenceRefs: ["pilot-disclosure:approved"]
  }
);

assert.equal(strictMetricClaim.valid, false);
assert.ok(strictMetricClaim.claimFlags.includes("invalid_usage_evidence_ref"));

const summary = summarizeLaunchPosts([
  {
    id: "p1",
    status: "draft_only",
    assetPath: "launch/allow-dashboard-rendered.png",
    text: "Every autonomous payment should leave a receipt."
  }
]);

assert.equal(summary.valid, true);
assert.equal(summary.readyDrafts, 1);

console.log("socialLaunch tests passed");
