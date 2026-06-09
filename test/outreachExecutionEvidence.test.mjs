import assert from "node:assert/strict";
import { buildOutreachExternalActionPacket } from "../src/outreachActionPack.mjs";
import { buildOutreachExecutionEvidenceReport } from "../src/outreachExecutionEvidence.mjs";

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

const approvalPacket = {
  ...buildOutreachExternalActionPacket(draft, {
    requestedBy: "operator",
    requestedAt: "2026-06-08",
    approvalIdPrefix: "outreach"
  }),
  status: "approved",
  approvedBy: "account-owner",
  approvedAt: "2026-06-08",
  approvals
};

const validEvidence = {
  evidenceId: "outreach-exec-001",
  generatedAt: "2026-06-08T12:00:00.000Z",
  outreachStatus: "sent",
  approvalRef: "external-action:outreach_c1",
  candidateId: "c1",
  prospectId: "p1",
  approvalPacket,
  sent: {
    sentAt: "2026-06-08T12:05:00.000Z",
    sentBy: "account-owner",
    channel: draft.channel,
    destination: draft.destination,
    subject: draft.subject,
    exactText: draft.message,
    humanExecuted: true,
    accountOwnerApproved: true,
    automationUsed: false
  },
  proof: {
    type: "form_receipt",
    ref: "ops/evidence/redacted-contact-form-receipt.png",
    capturedAt: "2026-06-08T12:06:00.000Z",
    redacted: true
  },
  response: {
    status: "none"
  }
};

const valid = await buildOutreachExecutionEvidenceReport(validEvidence);
assert.equal(valid.valid, true);
assert.equal(valid.status, "verified_outreach_execution");
assert.equal(valid.approvalReport.valid, true);
assert.equal(valid.draftReport.valid, true);
assert.equal(valid.evidenceBoundary.sendsOutreach, false);
assert.equal(valid.evidenceBoundary.countsAsCompletedInterview, false);
assert.equal(valid.evidenceBoundary.marksTokenReady, false);

const unapproved = await buildOutreachExecutionEvidenceReport({
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

const automated = await buildOutreachExecutionEvidenceReport({
  ...validEvidence,
  sent: {
    ...validEvidence.sent,
    automationUsed: true
  }
});
assert.equal(automated.valid, false);
assert.ok(automated.reasons.includes("sent.automationUsed must be false"));

const mismatch = await buildOutreachExecutionEvidenceReport({
  ...validEvidence,
  sent: {
    ...validEvidence.sent,
    exactText: `${draft.message}\nDifferent trailing line.`
  }
});
assert.equal(mismatch.valid, false);
assert.ok(mismatch.reasons.includes("sent.exactText must match approvalPacket.action.exactText"));

const scheduled = await buildOutreachExecutionEvidenceReport({
  ...validEvidence,
  outreachStatus: "scheduled",
  response: {
    status: "scheduled",
    receivedAt: "2026-06-08T12:20:00.000Z",
    summary: "Merchant agreed to a product interview.",
    scheduledAt: "2026-06-10T15:00:00.000Z",
    interviewId: "interview-c1-001"
  }
});
assert.equal(scheduled.valid, true);
assert.equal(scheduled.response.interviewId, "interview-c1-001");
assert.equal(scheduled.evidenceBoundary.countsAsCompletedInterview, false);

const scheduledWithoutInterviewId = await buildOutreachExecutionEvidenceReport({
  ...validEvidence,
  outreachStatus: "scheduled",
  response: {
    status: "scheduled",
    receivedAt: "2026-06-08T12:20:00.000Z",
    summary: "Merchant agreed to a product interview.",
    scheduledAt: "2026-06-10T15:00:00.000Z"
  }
});
assert.equal(scheduledWithoutInterviewId.valid, false);
assert.ok(scheduledWithoutInterviewId.reasons.includes("Missing response.interviewId"));

const secret = await buildOutreachExecutionEvidenceReport({
  ...validEvidence,
  sent: {
    ...validEvidence.sent,
    exactText: `${draft.message}\napi_key=abc123`
  }
});
assert.equal(secret.valid, false);
assert.ok(secret.reasons.includes("Outreach execution evidence must not include API keys, secrets, or passwords"));

const tokenHype = await buildOutreachExecutionEvidenceReport({
  ...validEvidence,
  sent: {
    ...validEvidence.sent,
    exactText: `${draft.message}\nThis will be a 100x token launch.`
  }
});
assert.equal(tokenHype.valid, false);
assert.ok(tokenHype.reasons.includes("Do not use price-hype or pump language"));
assert.ok(tokenHype.reasons.includes("Do not promote a token, airdrop, presale, or whitelist"));

console.log("outreachExecutionEvidence tests passed");
