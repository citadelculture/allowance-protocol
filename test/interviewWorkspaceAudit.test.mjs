import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { buildInterviewWorkspaceAuditReport } from "../src/interviewWorkspaceAudit.mjs";
import { buildInterviewWorkspaceReport } from "../src/interviewWorkspace.mjs";

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
    candidates: [candidate("a", 0.9), candidate("b", 0.7)],
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

const workspace = await mkdtemp(join(tmpdir(), "allow-interview-workspace-audit-"));
await writeWorkspace(report, workspace);

const audit = await buildInterviewWorkspaceAuditReport(workspace);
assert.equal(audit.valid, true);
assert.equal(audit.status, "verified_interview_workspace");
assert.equal(audit.counts.checkedFiles, 6);
assert.equal(audit.counts.interviewPackets, 2);
assert.equal(audit.counts.interviewRecordTemplates, 2);
assert.equal(audit.counts.merchantIntakeTemplates, 2);
assert.equal(audit.counts.hashMismatches, 0);
assert.equal(audit.counts.unsafeFiles, 0);
assert.equal(audit.evidenceBoundary.countsAsCompletedInterview, false);

const extraWorkspace = await mkdtemp(join(tmpdir(), "allow-interview-workspace-audit-extra-"));
await writeWorkspace(report, extraWorkspace);
await writeFile(join(extraWorkspace, "notes.txt"), "operator note\n");
const extraAudit = await buildInterviewWorkspaceAuditReport(extraWorkspace);
assert.equal(extraAudit.valid, true);
assert.equal(extraAudit.counts.extraFiles, 1);
assert.ok(extraAudit.warnings.some((warning) => warning.includes("untracked files")));

const tamperedWorkspace = await mkdtemp(join(tmpdir(), "allow-interview-workspace-audit-tampered-"));
await writeWorkspace(report, tamperedWorkspace);
const recordPath = join(tamperedWorkspace, "records/01-a.completed-interview.template.json");
const record = JSON.parse(await readFile(recordPath, "utf8"));
record.completedAt = "2026-06-09T05:00:00.000Z";
record.completedBy = "operator";
record.summary = "This was a real interview.";
record.answers[0].answer = "yes";
record.approvals.noTokenPitch = true;
await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`);
const tamperedAudit = await buildInterviewWorkspaceAuditReport(tamperedWorkspace);
assert.equal(tamperedAudit.valid, false);
assert.equal(tamperedAudit.counts.hashMismatches, 1);
assert.ok(tamperedAudit.reasons.some((reason) => reason.includes("completedAt must remain empty")));
assert.ok(tamperedAudit.reasons.some((reason) => reason.includes("approvals.noTokenPitch must remain false")));
assert.ok(tamperedAudit.reasons.some((reason) => reason.includes("answers must remain blank")));

const missingWorkspace = await mkdtemp(join(tmpdir(), "allow-interview-workspace-audit-missing-"));
await writeWorkspace(report, missingWorkspace);
await rm(join(missingWorkspace, "intakes/02-b.merchant-intake.template.json"));
const missingAudit = await buildInterviewWorkspaceAuditReport(missingWorkspace);
assert.equal(missingAudit.valid, false);
assert.equal(missingAudit.counts.missingFiles, 1);
assert.ok(missingAudit.reasons.some((reason) => reason.includes("Unable to read file")));

console.log("interviewWorkspaceAudit tests passed");

async function writeWorkspace(workspaceReport, dir) {
  for (const file of workspaceReport.files) {
    const target = join(dir, file.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, file.content, "utf8");
  }
}
