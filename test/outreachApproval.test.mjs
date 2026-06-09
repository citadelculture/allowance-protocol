import assert from "node:assert/strict";
import {
  buildOutreachApprovalReport,
  validateOutreachDraft,
  validateOutreachDrafts
} from "../src/outreachApproval.mjs";

const validDraft = {
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

const valid = validateOutreachDraft(validDraft);
assert.equal(valid.valid, true);
assert.deepEqual(valid.reasons, []);

const hype = validateOutreachDraft({
  ...validDraft,
  message: `${validDraft.message}\nThis can be a 100x token launch.`
});
assert.equal(hype.valid, false);
assert.ok(hype.reasons.includes("Do not use price-hype or pump language"));
assert.ok(hype.reasons.includes("Do not promote a token, airdrop, presale, or whitelist"));

const sent = validateOutreachDraft({
  ...validDraft,
  status: "sent"
});
assert.equal(sent.valid, false);
assert.ok(sent.reasons.includes("Outreach must remain draft_only until explicitly approved and sent by a human"));

const secret = validateOutreachDraft({
  ...validDraft,
  message: `${validDraft.message}\napi_key=abc123secret`
});
assert.equal(secret.valid, false);
assert.ok(secret.reasons.includes("Outreach text must not include API keys, secrets, or passwords"));

const batch = validateOutreachDrafts([validDraft, sent]);
assert.equal(batch.valid, false);
assert.equal(batch.validCount, 1);

const report = buildOutreachApprovalReport(
  [
    {
      id: "c1",
      prospectId: "p1",
      name: "Example API",
      relevantSurface: "paid search endpoint",
      contactPath: "https://example.com/contact",
      preferredChannel: "contact form",
      status: "draft_ready",
      confidence: 0.8
    }
  ],
  [{ id: "p1", name: "Example prospect" }]
);
assert.equal(report.valid, true);
assert.equal(report.count, 1);

console.log("outreachApproval tests passed");
