import assert from "node:assert/strict";
import { buildCanonicalUpdateSet, publicCanonicalUpdateSetReport } from "../src/canonicalUpdateSet.mjs";
import { buildExecutionEvidenceLedgerEntry } from "../src/executionEvidenceLedgerEntry.mjs";
import { buildStateUpdatePreview, publicStateUpdatePreviewReport } from "../src/stateUpdatePreview.mjs";
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

const currentXLedger = {
  records: [],
  notes: ["keep me"]
};
const xPostEntry = await buildExecutionEvidenceLedgerEntry({
  evidence: validXPostEvidence,
  existingLedger: currentXLedger
});
const xStatePreview = await buildStateUpdatePreview({
  ledgerEntryReport: xPostEntry,
  launchPosts: [post]
});
const xUpdateSet = buildCanonicalUpdateSet({
  ledgerEntryReport: xPostEntry,
  stateUpdatePreview: xStatePreview,
  currentLedger: currentXLedger,
  currentState: [post]
});
assert.equal(xUpdateSet.valid, true);
assert.equal(xUpdateSet.status, "ready_to_review");
assert.equal(xUpdateSet.actionType, "x_post");
assert.equal(xUpdateSet.targetLedgerPath, "ops/x_post_execution_records.json");
assert.equal(xUpdateSet.targetStatePath, "launch/x_posts.json");
assert.equal(xUpdateSet.counts.changedFiles, 2);
assert.equal(xUpdateSet.files[0].role, "execution_ledger");
assert.equal(xUpdateSet.files[0].changed, true);
assert.ok(xUpdateSet.files[0].currentSha256.startsWith("sha256:"));
assert.ok(xUpdateSet.files[0].proposedJson.includes("x-post-exec-001"));
assert.equal(xUpdateSet.files[1].role, "canonical_state");
assert.deepEqual(xUpdateSet.files[1].changes, [
  {
    type: "update",
    id: "day-one-thesis",
    fields: [{ field: "status", from: "draft_only", to: "posted" }]
  }
]);
assert.ok(xUpdateSet.files[1].proposedJson.includes('"status": "posted"'));
assert.equal(xUpdateSet.evidenceBoundary.mutatesCanonicalState, false);
assert.equal(xUpdateSet.evidenceBoundary.appendsCanonicalLedger, false);

const publicReport = publicCanonicalUpdateSetReport(xUpdateSet);
assert.equal(publicReport.files[0].currentJson, undefined);
assert.equal(publicReport.files[0].proposedJson, undefined);

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

const currentOutreachLedger = {
  records: [],
  notes: ["outreach notes"]
};
const currentProspects = [
  {
    id: "p1",
    name: "Example API",
    contactStatus: "identified",
    outreachStatus: "not_started",
    interviewStatus: "not_started",
    integrationStatus: "not_started"
  }
];
const outreachEntry = await buildExecutionEvidenceLedgerEntry({
  evidence: validOutreachEvidence,
  existingLedger: currentOutreachLedger
});
const outreachPreview = await buildStateUpdatePreview({
  ledgerEntryReport: outreachEntry,
  prospects: currentProspects,
  contactCandidates: [{ id: "c1", prospectId: "p1" }],
  interviews: []
});
const outreachUpdateSet = buildCanonicalUpdateSet({
  ledgerEntryReport: outreachEntry,
  stateUpdatePreview: outreachPreview,
  currentLedger: currentOutreachLedger,
  currentState: currentProspects
});
assert.equal(outreachUpdateSet.valid, true);
assert.equal(outreachUpdateSet.targetLedgerPath, "ops/outreach_execution_records.json");
assert.equal(outreachUpdateSet.targetStatePath, "ops/prospects.json");
assert.equal(outreachUpdateSet.files[1].changes[0].fields[0].to, "sent");

const missingProjectedState = buildCanonicalUpdateSet({
  ledgerEntryReport: xPostEntry,
  stateUpdatePreview: publicStateUpdatePreviewReport(xStatePreview),
  currentLedger: currentXLedger,
  currentState: [post]
});
assert.equal(missingProjectedState.valid, false);
assert.equal(missingProjectedState.status, "needs_update_fixes");
assert.ok(missingProjectedState.reasons.includes("State update preview is missing projectedState; use the full local preview JSON"));

const staleLedger = buildCanonicalUpdateSet({
  ledgerEntryReport: xPostEntry,
  stateUpdatePreview: xStatePreview,
  currentLedger: {
    records: [{ evidenceId: "already-there" }],
    notes: ["keep me"]
  },
  currentState: [post]
});
assert.equal(staleLedger.valid, false);
assert.ok(staleLedger.reasons.includes("Current canonical ledger no longer matches the base used by the append preview"));

const staleState = buildCanonicalUpdateSet({
  ledgerEntryReport: xPostEntry,
  stateUpdatePreview: xStatePreview,
  currentLedger: currentXLedger,
  currentState: [{ ...post, status: "posted" }]
});
assert.equal(staleState.valid, false);
assert.ok(staleState.reasons.includes("day-one-thesis: current status no longer matches preview base value"));

const unsupported = buildCanonicalUpdateSet({
  actionType: "controller_policy_signature",
  ledgerEntryReport: { valid: true, appendPreview: { records: [{}] } },
  stateUpdatePreview: { valid: true, projectedState: [] },
  currentLedger: { records: [] },
  currentState: []
});
assert.equal(unsupported.valid, false);
assert.equal(unsupported.status, "unsupported_action_type");

console.log("canonicalUpdateSet tests passed");
