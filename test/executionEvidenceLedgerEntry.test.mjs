import assert from "node:assert/strict";
import { buildExecutionEvidenceLedgerEntry } from "../src/executionEvidenceLedgerEntry.mjs";
import { buildOutreachExternalActionPacket } from "../src/outreachActionPack.mjs";
import { buildXPostExternalActionPacket } from "../src/xPostActionPack.mjs";

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

const xPostApprovalPacket = {
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

const validXPostEvidence = {
  evidenceId: "x-post-exec-001",
  generatedAt: "2026-06-08T12:00:00.000Z",
  executionStatus: "posted",
  approvalRef: "external-action:x_post_day_one_thesis",
  approvalPacket: xPostApprovalPacket,
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

const xPostEntry = await buildExecutionEvidenceLedgerEntry({
  evidence: validXPostEvidence,
  existingLedger: {
    records: [],
    notes: ["keep me"]
  }
});
assert.equal(xPostEntry.valid, true);
assert.equal(xPostEntry.status, "ready_to_append");
assert.equal(xPostEntry.actionType, "x_post");
assert.equal(xPostEntry.targetLedgerPath, "ops/x_post_execution_records.json");
assert.equal(xPostEntry.record.evidenceId, "x-post-exec-001");
assert.equal(xPostEntry.appendPreview.records.length, 1);
assert.equal(xPostEntry.appendPreview.notes[0], "keep me");
assert.equal(xPostEntry.commands.validateStateAfterAppend, "npm run x-post-state -- ops/x_post_execution_records.json");
assert.equal(xPostEntry.evidenceBoundary.appendsCanonicalLedger, false);
assert.equal(xPostEntry.evidenceBoundary.postsContent, false);

const duplicate = await buildExecutionEvidenceLedgerEntry({
  evidence: validXPostEvidence,
  existingLedger: {
    records: [validXPostEvidence]
  }
});
assert.equal(duplicate.valid, false);
assert.equal(duplicate.status, "duplicate_evidence");
assert.equal(duplicate.record, null);
assert.ok(duplicate.reasons.includes("Evidence id already exists in target ledger: x-post-exec-001"));

const invalidEvidence = await buildExecutionEvidenceLedgerEntry({
  evidence: {
    ...validXPostEvidence,
    approvalPacket: {
      ...xPostApprovalPacket,
      status: "draft",
      approvals: {
        ...approvals,
        humanWillExecute: false
      }
    }
  },
  existingLedger: {
    records: []
  }
});
assert.equal(invalidEvidence.valid, false);
assert.equal(invalidEvidence.status, "needs_evidence_fixes");
assert.ok(invalidEvidence.reasons.includes("approvalPacket: External action must be approved before execution"));

const outreachDraft = {
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

const outreachApprovalPacket = {
  ...buildOutreachExternalActionPacket(outreachDraft, {
    requestedBy: "operator",
    requestedAt: "2026-06-08",
    approvalIdPrefix: "outreach"
  }),
  status: "approved",
  approvedBy: "account-owner",
  approvedAt: "2026-06-08",
  approvals
};

const validOutreachEvidence = {
  evidenceId: "outreach-exec-001",
  generatedAt: "2026-06-08T12:00:00.000Z",
  outreachStatus: "sent",
  approvalRef: "external-action:outreach_c1",
  candidateId: "c1",
  prospectId: "p1",
  approvalPacket: outreachApprovalPacket,
  sent: {
    sentAt: "2026-06-08T12:05:00.000Z",
    sentBy: "account-owner",
    channel: outreachDraft.channel,
    destination: outreachDraft.destination,
    subject: outreachDraft.subject,
    exactText: outreachDraft.message,
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

const outreachEntry = await buildExecutionEvidenceLedgerEntry({
  evidence: validOutreachEvidence,
  existingLedger: {
    records: []
  }
});
assert.equal(outreachEntry.valid, true);
assert.equal(outreachEntry.status, "ready_to_append");
assert.equal(outreachEntry.actionType, "merchant_outreach");
assert.equal(outreachEntry.targetLedgerPath, "ops/outreach_execution_records.json");
assert.equal(outreachEntry.appendPreview.records.length, 1);
assert.equal(outreachEntry.commands.validateStateAfterAppend, "npm run outreach-state -- ops/outreach_execution_records.json");
assert.equal(outreachEntry.evidenceBoundary.sendsOutreach, false);

const unsupported = await buildExecutionEvidenceLedgerEntry({
  evidence: {
    evidenceId: "controller-signing-evidence-001",
    approvalPacket: {
      actionType: "controller_policy_signature"
    }
  }
});
assert.equal(unsupported.valid, false);
assert.equal(unsupported.status, "unsupported_action_type");
assert.ok(unsupported.reasons.includes("Unsupported execution evidence action type: controller_policy_signature"));

console.log("executionEvidenceLedgerEntry tests passed");
