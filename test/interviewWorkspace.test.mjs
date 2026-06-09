import assert from "node:assert/strict";
import { buildInterviewWorkspaceReport, publicInterviewWorkspaceReport } from "../src/interviewWorkspace.mjs";
import { validateInterviewRecord } from "../src/interviewEvidence.mjs";

const script = {
  opening: "Opening",
  questions: [
    "Do agents call your API?",
    "Do you price per request?",
    "What can go wrong?",
    "Do you need spend limits?",
    "Would receipts help?",
    "Where should Allow sit?",
    "What metadata is sensitive?",
    "Can you test this week?"
  ],
  close: "Close"
};

const prospect = {
  id: "p1",
  name: "High Fit API",
  evidence: "Public API evidence.",
  score: {
    existingEndpoint: 2,
    usageBasedPricing: 2,
    agentUsersLikely: 2,
    metadataOrAbuseRisk: 2,
    canTestWithinWeek: 2,
    publicProofPotential: 1
  }
};

function candidate(id, confidence = 0.8, status = "draft_ready") {
  return {
    id,
    prospectId: "p1",
    name: `Candidate ${id}`,
    relevantSurface: "paid search endpoint",
    contactPath: `https://example.com/${id}`,
    preferredChannel: "contact form",
    publicEvidence: "Public API docs.",
    confidence,
    status
  };
}

const report = buildInterviewWorkspaceReport(
  {
    prospects: [prospect],
    candidates: [
      candidate("a", 0.9),
      candidate("b", 0.7),
      candidate("blocked", 0.99, "needs_contact_discovery")
    ],
    interviews: [],
    script
  },
  {
    generatedAt: "2026-06-09T00:00:00.000Z",
    outputDir: "work/interview-workspace",
    minimumCompleted: 5,
    limit: 2
  }
);

assert.equal(report.valid, true);
assert.equal(report.status, "ready_for_review");
assert.equal(report.counts.plannedActions, 2);
assert.equal(report.counts.interviewPackets, 2);
assert.equal(report.counts.interviewRecordTemplates, 2);
assert.equal(report.counts.merchantIntakeTemplates, 2);
assert.equal(report.counts.blockedCandidates, 1);
assert.equal(report.files.length, 8);
assert.equal(report.files[0].path, "manifest.json");
assert.equal(report.files[1].path, "REVIEW_CHECKLIST.md");
assert.equal(report.manifest.artifact, "allow_interview_workspace");
assert.equal(report.evidenceBoundary.sendsOutreach, false);
assert.equal(report.evidenceBoundary.countsAsCompletedInterview, false);
assert.match(report.checklist, /Completion Steps/);
assert.match(report.files[2].sha256, /^0x[0-9a-f]{64}$/);

const recordTemplate = JSON.parse(report.files.find((file) => file.kind === "interview_record_template").content);
const recordValidation = validateInterviewRecord(recordTemplate, {
  prospects: [prospect],
  contactCandidates: [candidate("a")]
});
assert.equal(recordValidation.valid, false);
assert.ok(recordValidation.reasons.includes("Missing completedAt"));
assert.ok(recordValidation.reasons.includes("Completed interview must include at least five answered questions"));
assert.ok(recordValidation.reasons.includes("Completed interview must confirm noTokenPitch=true"));

const intakeTemplate = JSON.parse(report.files.find((file) => file.kind === "merchant_intake_template").content);
assert.equal(intakeTemplate.agentPaymentFit.needsSpendCaps, true);
assert.equal(intakeTemplate.integration.canTestThisWeek, false);

const publicReport = publicInterviewWorkspaceReport(report);
assert.equal(publicReport.files[0].content, undefined);
assert.equal(publicReport.manifest.interviewPackets.length, 2);

const complete = buildInterviewWorkspaceReport({
  prospects: [prospect],
  candidates: [candidate("later")],
  interviews: [1, 2, 3, 4, 5].map((id) => ({ id: `i${id}`, status: "completed" })),
  script
});

assert.equal(complete.valid, true);
assert.equal(complete.status, "complete");
assert.equal(complete.counts.plannedActions, 0);

const needsScript = buildInterviewWorkspaceReport({
  prospects: [prospect],
  candidates: [candidate("a")],
  interviews: [],
  script: { questions: ["q1"] }
});

assert.equal(needsScript.valid, false);
assert.equal(needsScript.status, "needs_script");
assert.ok(needsScript.reasons.includes("Interview script must include at least five questions"));

console.log("interviewWorkspace tests passed");
