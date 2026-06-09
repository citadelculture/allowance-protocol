import assert from "node:assert/strict";
import { buildOutreachExternalActionPacket } from "../src/outreachActionPack.mjs";
import { buildOutreachStateReport } from "../src/outreachState.mjs";

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

const prospect = {
  id: "p1",
  name: "High Fit API",
  segment: "x402 sellers",
  contactStatus: "identified",
  outreachStatus: "not_started",
  interviewStatus: "not_started",
  integrationStatus: "not_started",
  score: {
    existingEndpoint: 2,
    usageBasedPricing: 2,
    agentUsersLikely: 2,
    metadataOrAbuseRisk: 2,
    canTestWithinWeek: 2,
    publicProofPotential: 1
  }
};

const candidate = {
  id: "c1",
  prospectId: "p1",
  name: "High Fit API contact"
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

function evidence(overrides = {}) {
  return {
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
    },
    ...overrides
  };
}

const empty = await buildOutreachStateReport({
  prospects: [prospect],
  contactCandidates: [candidate],
  evidenceRecords: []
});
assert.equal(empty.valid, true);
assert.equal(empty.status, "no_outreach_evidence_yet");
assert.equal(empty.counts.completedInterviewsFromOutreachEvidence, 0);
assert.equal(empty.prospects[0].projected.outreachStatus, "not_started");

const unsupportedManualAdvance = await buildOutreachStateReport({
  prospects: [{ ...prospect, outreachStatus: "sent" }],
  contactCandidates: [candidate],
  evidenceRecords: []
});
assert.equal(unsupportedManualAdvance.valid, false);
assert.ok(unsupportedManualAdvance.reasons.includes("p1: outreachStatus=sent has no valid outreach execution evidence"));

const sent = await buildOutreachStateReport({
  prospects: [prospect],
  contactCandidates: [candidate],
  evidenceRecords: [evidence()]
});
assert.equal(sent.valid, true);
assert.equal(sent.status, "evidence_backed_outreach");
assert.equal(sent.counts.validEvidenceRecords, 1);
assert.equal(sent.byOutreachStatus.sent, 1);
assert.equal(sent.projectedProspects[0].outreachStatus, "sent");
assert.equal(sent.counts.completedInterviewsFromOutreachEvidence, 0);

const scheduled = await buildOutreachStateReport({
  prospects: [prospect],
  contactCandidates: [candidate],
  evidenceRecords: [
    evidence({
      outreachStatus: "scheduled",
      response: {
        status: "scheduled",
        receivedAt: "2026-06-08T12:20:00.000Z",
        summary: "Merchant agreed to an interview.",
        scheduledAt: "2026-06-10T15:00:00.000Z",
        interviewId: "interview-p1-001"
      }
    })
  ]
});
assert.equal(scheduled.valid, true);
assert.equal(scheduled.status, "has_scheduled_response");
assert.equal(scheduled.projectedProspects[0].interviewStatus, "scheduled");
assert.equal(scheduled.counts.completedInterviewsFromOutreachEvidence, 0);

const invalidRecord = await buildOutreachStateReport({
  prospects: [prospect],
  contactCandidates: [candidate],
  evidenceRecords: [
    evidence({
      sent: {
        ...evidence().sent,
        automationUsed: true
      }
    })
  ]
});
assert.equal(invalidRecord.valid, false);
assert.ok(invalidRecord.reasons.some((reason) => reason.includes("sent.automationUsed must be false")));
assert.equal(invalidRecord.projectedProspects[0].outreachStatus, "not_started");

const unknownCandidate = await buildOutreachStateReport({
  prospects: [prospect],
  contactCandidates: [candidate],
  evidenceRecords: [
    evidence({
      candidateId: "missing-candidate"
    })
  ]
});
assert.equal(unknownCandidate.valid, false);
assert.ok(unknownCandidate.reasons.includes("outreach-exec-001: Unknown candidateId: missing-candidate"));

console.log("outreachState tests passed");
