import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  buildInterviewEvidenceReport,
  summarizeInterviewEvidence,
  validateInterviewRecord
} from "../src/interviewEvidence.mjs";

const prospects = [{ id: "p1", name: "Prospect One" }];
const contactCandidates = [{ id: "c1", prospectId: "p1", name: "Candidate One" }];
const completed = {
  id: "i1",
  prospectId: "p1",
  candidateId: "c1",
  status: "completed",
  completedAt: "2026-06-08",
  summary: "Merchant wants spend caps and metadata filters before testing one endpoint.",
  intakePath: "ops/intakes/research_api.json",
  answers: [
    "yes",
    "per request",
    "bad metadata",
    "spend caps",
    "receipts help",
    "server middleware"
  ],
  approvals: {
    productFeedbackOnly: true,
    noTokenPitch: true,
    noSecretsRequested: true,
    merchantUnderstandsPrototype: true
  }
};
const scheduled = {
  id: "i-scheduled",
  prospectId: "p1",
  candidateId: "c1",
  status: "scheduled",
  scheduledAt: "2026-06-10T15:00:00.000Z",
  scheduledBy: "account-owner",
  channel: "contact form",
  outreachEvidenceRef: "outreach-exec-001",
  approvals: {
    productFeedbackOnly: true,
    noTokenPitch: true,
    noSecretsRequested: true,
    merchantUnderstandsPrototype: true
  }
};
const scheduledOutreachEvidence = {
  "outreach-exec-001": {
    valid: true,
    reasons: [],
    warnings: [],
    outreachStatus: "scheduled",
    prospectId: "p1",
    candidateId: "c1",
    interviewId: "i-scheduled"
  }
};

assert.equal(
  validateInterviewRecord(completed, {
    prospects,
    contactCandidates,
    intakeReadiness: { valid: true, reasons: [], warnings: [] }
  }).valid,
  true
);

assert.equal(
  validateInterviewRecord(scheduled, {
    prospects,
    contactCandidates,
    outreachEvidenceById: scheduledOutreachEvidence
  }).valid,
  true
);

const unsourcedScheduled = validateInterviewRecord({
  ...scheduled,
  id: "missing-schedule-proof",
  scheduledAt: "",
  outreachEvidenceRef: "",
  approvals: {}
}, {
  prospects,
  contactCandidates,
  outreachEvidenceById: scheduledOutreachEvidence
});

assert.equal(unsourcedScheduled.valid, false);
assert.ok(unsourcedScheduled.reasons.includes("Missing scheduledAt"));
assert.ok(unsourcedScheduled.reasons.includes("Missing outreachEvidenceRef"));
assert.ok(unsourcedScheduled.reasons.includes("Scheduled interview must confirm noTokenPitch=true"));

const mismatchedScheduled = validateInterviewRecord(scheduled, {
  prospects,
  contactCandidates,
  outreachEvidenceById: {
    "outreach-exec-001": {
      ...scheduledOutreachEvidence["outreach-exec-001"],
      interviewId: "different-interview"
    }
  }
});

assert.equal(mismatchedScheduled.valid, false);
assert.ok(mismatchedScheduled.reasons.includes("Scheduled interview outreachEvidenceRef interviewId must match interview id"));

const incomplete = validateInterviewRecord({
  ...completed,
  id: "bad",
  answers: ["one"],
  approvals: {
    productFeedbackOnly: true
  }
}, {
  prospects,
  contactCandidates,
  intakeReadiness: { valid: true, reasons: [], warnings: [] }
});

assert.equal(incomplete.valid, false);
assert.ok(incomplete.reasons.includes("Completed interview must include at least five answered questions"));
assert.ok(incomplete.reasons.includes("Completed interview must confirm noTokenPitch=true"));

const summary = summarizeInterviewEvidence(
  [completed],
  {
    prospects,
    contactCandidates,
    intakeReadinessByPath: {
      "ops/intakes/research_api.json": { valid: true, reasons: [], warnings: [] }
    }
  },
  { minimumCompleted: 1 }
);

assert.equal(summary.valid, true);
assert.equal(summary.validCompletedCount, 1);

const scheduledSummary = summarizeInterviewEvidence(
  [scheduled],
  {
    prospects,
    contactCandidates,
    outreachEvidenceById: scheduledOutreachEvidence
  },
  { minimumCompleted: 1 }
);

assert.equal(scheduledSummary.valid, false);
assert.equal(scheduledSummary.validScheduledCount, 1);
assert.equal(scheduledSummary.invalidScheduledCount, 0);
assert.equal(scheduledSummary.validCompletedCount, 0);
assert.ok(scheduledSummary.reasons.includes("Only 0 of 1 required completed interviews are valid"));

const badScheduledSummary = summarizeInterviewEvidence(
  [{ ...scheduled, scheduledAt: "" }],
  {
    prospects,
    contactCandidates,
    outreachEvidenceById: scheduledOutreachEvidence
  },
  { minimumCompleted: 1 }
);

assert.equal(badScheduledSummary.invalidScheduledCount, 1);
assert.ok(badScheduledSummary.reasons.includes("1 scheduled interview record(s) need fixes before scheduling can be trusted"));

const root = await mkdtemp(join(tmpdir(), "allow-interviews-"));
await mkdir(join(root, "ops/intakes"), { recursive: true });
await writeFile(join(root, "ops/intakes/research_api.json"), JSON.stringify(validIntake()));

const report = await buildInterviewEvidenceReport(root, [completed], {
  prospects,
  contactCandidates
}, {
  minimumCompleted: 1
});

assert.equal(report.valid, true);
assert.equal(report.records[0].intake.valid, true);

const unsafePath = await buildInterviewEvidenceReport(root, [
  {
    ...completed,
    id: "outside-root",
    intakePath: "../outside.json"
  }
], {
  prospects,
  contactCandidates
}, {
  minimumCompleted: 1
});

assert.equal(unsafePath.valid, false);
assert.ok(unsafePath.records[0].reasons.some((reason) => reason.includes("Linked intake invalid")));

console.log("interviewEvidence tests passed");

function validIntake() {
  return {
    merchantId: "research_api",
    name: "Research API",
    website: "https://research.example",
    service: {
      category: "research",
      endpointType: "api",
      description: "Research endpoint",
      pricingModel: "per_request",
      examplePriceUsd: 0.25
    },
    agentPaymentFit: {
      expectsAgentUsers: true,
      currentX402Support: true,
      currentMcpSupport: false,
      needsSpendCaps: true,
      needsMetadataFilters: true,
      needsReplayProtection: true,
      needsReceipts: true
    },
    risk: {
      sensitiveMetadataClasses: ["query_text"],
      abuseModes: ["looped_agent_calls"],
      maxSafeTestSpendUsd: 2
    },
    integration: {
      preferredSurface: "server_middleware",
      canTestThisWeek: true,
      testEndpoint: "https://research.example/v1/search",
      successMetric: "public demo with one allowed receipt and one denied receipt"
    },
    notes: "Potential public case study."
  };
}
