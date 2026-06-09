import assert from "node:assert/strict";
import {
  buildInterviewCompletionHandoff,
  publicInterviewCompletionHandoffReport
} from "../src/interviewCompletionHandoff.mjs";

const reviewBrief = {
  valid: true,
  status: "ready_for_interview_review",
  counts: {
    reviewActions: 1,
    shortfall: 5,
    shortfallAfterPlan: 4
  },
  actions: [
    {
      index: 1,
      actionId: "interview-review-research-api-founder",
      candidateId: "research-api-founder",
      candidateName: "Research API founder",
      prospectId: "agentic-research",
      prospectName: "Agentic Research API",
      packetPath: "packets/01-research-api-founder.interview-packet.json",
      recordTemplatePath: "records/01-research-api-founder.completed-interview.template.json",
      intakeTemplatePath: "intakes/01-research-api-founder.merchant-intake.template.json",
      questions: {
        count: 6
      },
      recordTemplate: {
        suggestedIntakePath: "ops/intakes/research_api.json",
        answeredCount: 0,
        approvalFlags: {
          trueCount: 0,
          required: 4
        }
      },
      commands: {
        validateIntake: "npm run validate-merchant -- ops/intakes/research_api.json"
      }
    }
  ],
  reasons: [],
  warnings: []
};

const evidenceReport = {
  valid: false,
  minimumCompleted: 5,
  completedCount: 0,
  validCompletedCount: 0,
  invalidCompletedCount: 0,
  scheduledCount: 0,
  validScheduledCount: 0,
  invalidScheduledCount: 0,
  reasons: ["Only 0 of 5 required completed interviews are valid"],
  warnings: [],
  records: []
};

const ready = buildInterviewCompletionHandoff(
  {
    reviewBrief,
    interviewEvidenceReport: evidenceReport,
    paths: {
      interviews: "ops/interviews.json"
    }
  },
  {
    generatedAt: "2026-06-09T18:20:00.000Z"
  }
);

assert.equal(ready.valid, true);
assert.equal(ready.status, "ready_for_interview_execution");
assert.equal(ready.reviewBrief.reviewActions, 1);
assert.equal(ready.interviewEvidence.validCompletedCount, 0);
assert.equal(ready.blockers.length, 0);
assert.ok(ready.evidenceGaps.includes("interview evidence: Only 0 of 5 required completed interviews are valid"));
assert.equal(ready.actions[0].candidateId, "research-api-founder");
assert.equal(ready.actions[0].questionCount, 6);
assert.equal(ready.actions[0].approvalTrueCount, 0);
assert.ok(ready.commands.countInterviews.includes("npm run interview-report"));
assert.match(ready.markdown, /Interview Completion Queue/);
assert.match(ready.markdown, /Research API founder/);
assert.equal(ready.evidenceBoundary.sendsOutreach, false);
assert.equal(ready.evidenceBoundary.countsInterviews, false);
assert.equal(ready.evidenceBoundary.tokenPitch, false);

const complete = buildInterviewCompletionHandoff({
  reviewBrief,
  interviewEvidenceReport: {
    ...evidenceReport,
    valid: true,
    completedCount: 5,
    validCompletedCount: 5,
    reasons: []
  }
});

assert.equal(complete.status, "interviews_complete");
assert.equal(complete.evidenceGaps.length, 0);
assert.ok(complete.nextAction.includes("pilot authorization"));

const blocked = buildInterviewCompletionHandoff({
  reviewBrief: {
    valid: false,
    status: "needs_workspace_fixes",
    reasons: ["workspace hash mismatch"],
    warnings: []
  },
  interviewEvidenceReport: evidenceReport
});

assert.equal(blocked.status, "blocked_by_prep");
assert.ok(blocked.blockers.includes("interview review brief: workspace hash mismatch"));
assert.ok(blocked.nextAction.includes("Regenerate"));

const invalidRecord = buildInterviewCompletionHandoff({
  reviewBrief,
  interviewEvidenceReport: {
    ...evidenceReport,
    completedCount: 1,
    invalidCompletedCount: 1,
    records: [
      {
        id: "interview-bad",
        status: "completed",
        valid: false,
        reasons: ["Completed interview must include at least five answered questions"]
      }
    ]
  }
});

assert.ok(invalidRecord.evidenceGaps.includes("interview interview-bad: Completed interview must include at least five answered questions"));

const publicReport = publicInterviewCompletionHandoffReport(ready);
assert.equal(publicReport.markdown, undefined);
assert.equal(publicReport.status, "ready_for_interview_execution");

console.log("interviewCompletionHandoff tests passed");
