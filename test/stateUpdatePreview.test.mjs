import assert from "node:assert/strict";
import { buildExecutionEvidenceLedgerEntry } from "../src/executionEvidenceLedgerEntry.mjs";
import {
  buildStateUpdatePreview,
  publicStateUpdatePreviewReport
} from "../src/stateUpdatePreview.mjs";
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
    records: []
  }
});

const xPreview = await buildStateUpdatePreview({
  ledgerEntryReport: xPostEntry,
  launchPosts: [post]
});
assert.equal(xPreview.valid, true);
assert.equal(xPreview.status, "ready_to_apply");
assert.equal(xPreview.targetStatePath, "launch/x_posts.json");
assert.equal(xPreview.stateValidationCommand, "npm run x-post-state -- ops/x_post_execution_records.json");
assert.equal(xPreview.counts.changedItems, 1);
assert.deepEqual(xPreview.changes, [
  {
    type: "update",
    id: "day-one-thesis",
    fields: [{ field: "status", from: "draft_only", to: "posted" }]
  }
]);
assert.equal(xPreview.projectedState[0].status, "posted");
assert.equal(xPreview.evidenceBoundary.mutatesCanonicalState, false);
assert.equal(xPreview.evidenceBoundary.postsContent, false);
assert.equal(publicStateUpdatePreviewReport(xPreview).projectedState, undefined);

const alignedXPreview = await buildStateUpdatePreview({
  ledgerEntryReport: xPostEntry,
  launchPosts: [{ ...post, status: "posted" }]
});
assert.equal(alignedXPreview.valid, true);
assert.equal(alignedXPreview.status, "no_state_changes");
assert.equal(alignedXPreview.counts.changedItems, 0);

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

const outreachPreview = await buildStateUpdatePreview({
  ledgerEntryReport: outreachEntry,
  prospects: [
    {
      id: "p1",
      name: "Example API",
      contactStatus: "identified",
      outreachStatus: "not_started",
      interviewStatus: "not_started",
      integrationStatus: "not_started"
    }
  ],
  contactCandidates: [{ id: "c1", prospectId: "p1" }],
  interviews: []
});
assert.equal(outreachPreview.valid, true);
assert.equal(outreachPreview.status, "ready_to_apply");
assert.equal(outreachPreview.targetStatePath, "ops/prospects.json");
assert.deepEqual(outreachPreview.changes, [
  {
    type: "update",
    id: "p1",
    fields: [{ field: "outreachStatus", from: "not_started", to: "sent" }]
  }
]);
assert.equal(outreachPreview.projectedState[0].outreachStatus, "sent");
assert.equal(outreachPreview.evidenceBoundary.sendsOutreach, false);

const invalidPreview = await buildStateUpdatePreview({
  ledgerEntryReport: {
    valid: false,
    status: "needs_evidence_fixes",
    actionType: "x_post"
  },
  launchPosts: [post]
});
assert.equal(invalidPreview.valid, false);
assert.equal(invalidPreview.status, "needs_state_fixes");
assert.ok(invalidPreview.reasons.includes("Ledger entry preview is not valid: needs_evidence_fixes"));

const unsupportedPreview = await buildStateUpdatePreview({
  actionType: "controller_policy_signature",
  executionLedger: { records: [] }
});
assert.equal(unsupportedPreview.valid, false);
assert.equal(unsupportedPreview.status, "unsupported_action_type");
assert.ok(unsupportedPreview.reasons.includes("Unsupported state update action type: controller_policy_signature"));

console.log("stateUpdatePreview tests passed");
