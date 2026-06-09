import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { buildInterviewReviewBrief } from "../src/interviewReviewBrief.mjs";
import { buildInterviewWorkspaceReport } from "../src/interviewWorkspace.mjs";

const packet = {
  generatedAt: "2026-06-09T00:00:00.000Z",
  valid: true,
  status: "ready_for_human_review",
  prospectId: "agentic-research",
  prospectName: "Agentic Research API",
  candidateId: "research-api-founder",
  candidateName: "Research API founder",
  channel: "email",
  destination: "founder@example.com",
  relevantSurface: "paid research endpoint",
  publicEvidence: "Public docs describe a paid research API.",
  reasons: [],
  warnings: [],
  opening: "We are building Allow Protocol as no-custody spend controls for agent payments.",
  questions: [
    "Do agents call your API today?",
    "Do you price per request or per job?",
    "What metadata would be risky?",
    "Would spend caps help?",
    "Would denial receipts help support?",
    "Could you test one low-risk endpoint?"
  ],
  close: "This is product feedback only, not a token pitch.",
  intakeFieldsToFill: ["merchantId", "integration.testEndpoint"],
  humanApprovalChecklist: [
    "Account owner confirms destination and channel before outreach",
    "Message remains product-feedback-only"
  ],
  evidenceBoundary: {
    outreachSentByThisPacket: false,
    merchantApprovedByThisPacket: false,
    countsAsCompletedInterview: false
  },
  nextAction: "Review interview packet, then ask Research API founder for product feedback"
};

const workspaceReport = buildInterviewWorkspaceReport(
  {
    campaign: {
      status: "ready_for_human_review",
      valid: true,
      campaignTarget: {
        minimumCompleted: 5,
        recordedCompletedCount: 0,
        scheduledCount: 0,
        shortfall: 5,
        plannedActionCount: 1,
        shortfallAfterPlan: 4
      },
      plannedActions: [
        {
          actionId: "interview-review-research-api-founder",
          candidateId: "research-api-founder",
          candidateName: "Research API founder",
          prospectId: "agentic-research",
          prospectName: "Agentic Research API",
          channel: "email",
          destination: "founder@example.com",
          packet
        }
      ],
      blockedCandidates: [
        {
          candidateId: "blocked-candidate",
          status: "needs_contact_discovery",
          blockers: ["Candidate is not draft_ready"]
        }
      ],
      reasons: [],
      warnings: [],
      nextAction: "Review one interview packet"
    }
  },
  {
    generatedAt: "2026-06-09T00:00:00.000Z",
    outputDir: "work/interview-workspace"
  }
);

const workspace = await mkdtemp(join(tmpdir(), "allow-interview-review-brief-"));
await writeWorkspace(workspaceReport, workspace);

const brief = await buildInterviewReviewBrief(workspace, {
  generatedAt: "2026-06-09T01:00:00.000Z"
});

assert.equal(brief.valid, true);
assert.equal(brief.status, "ready_for_interview_review");
assert.equal(brief.counts.reviewActions, 1);
assert.equal(brief.counts.totalQuestions, 6);
assert.equal(brief.counts.blockedCandidates, 1);
assert.equal(brief.actions[0].candidateId, "research-api-founder");
assert.equal(brief.actions[0].packetAuditStatus, "verified");
assert.equal(brief.actions[0].recordTemplateAuditStatus, "verified");
assert.equal(brief.actions[0].intakeTemplateAuditStatus, "verified");
assert.equal(brief.actions[0].recordTemplate.approvalFlags.trueCount, 0);
assert.equal(brief.actions[0].recordTemplate.answeredCount, 0);
assert.equal(brief.actions[0].recordTemplate.pilotApproved, false);
assert.equal(brief.actions[0].intakeTemplate.canTestThisWeek, false);
assert.match(brief.markdown, /Allow Merchant Interview Review Brief/);
assert.match(brief.markdown, /Research API founder/);
assert.match(brief.markdown, /This is product feedback only, not a token pitch/);
assert.match(brief.markdown, /No outreach is sent/);
assert.match(brief.markdown, /Blocked Candidates/);
assert.equal(brief.evidenceBoundary.sendsOutreach, false);
assert.equal(brief.evidenceBoundary.countsAsCompletedInterview, false);

const tamperedWorkspace = await mkdtemp(join(tmpdir(), "allow-interview-review-brief-tampered-"));
await writeWorkspace(workspaceReport, tamperedWorkspace);
const recordPath = join(tamperedWorkspace, "records/01-research-api-founder.completed-interview.template.json");
const record = JSON.parse(await readFile(recordPath, "utf8"));
record.completedAt = "2026-06-09T01:30:00.000Z";
record.approvals.noTokenPitch = true;
record.answers[0].answer = "Yes";
await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`);
const tamperedBrief = await buildInterviewReviewBrief(tamperedWorkspace);
assert.equal(tamperedBrief.valid, false);
assert.equal(tamperedBrief.status, "needs_workspace_fixes");
assert.ok(tamperedBrief.reasons.some((reason) => reason.includes("record template completedAt must remain empty")));
assert.match(tamperedBrief.markdown, /Workspace Needs Fixes/);

const missingWorkspace = await mkdtemp(join(tmpdir(), "allow-interview-review-brief-missing-"));
await writeWorkspace(workspaceReport, missingWorkspace);
await rm(join(missingWorkspace, "manifest.json"));
const missingBrief = await buildInterviewReviewBrief(missingWorkspace);
assert.equal(missingBrief.valid, false);
assert.equal(missingBrief.status, "missing_manifest");
assert.match(missingBrief.markdown, /Workspace Needs Fixes/);

console.log("interviewReviewBrief tests passed");

async function writeWorkspace(report, dir) {
  for (const file of report.files) {
    const target = join(dir, file.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, file.content, "utf8");
  }
}
