import assert from "node:assert/strict";
import {
  buildExternalActionWorkspaceReport,
  publicExternalActionWorkspaceReport
} from "../src/externalActionWorkspace.mjs";
import { buildOutreachExecutionEvidenceReport } from "../src/outreachExecutionEvidence.mjs";
import { buildXPostExecutionEvidenceReport } from "../src/xPostExecutionEvidence.mjs";

const approvalFlags = {
  humanWillExecute: false,
  automationDisabled: false,
  exactActionReviewed: false,
  externalSideEffectAcknowledged: false,
  noPrivateKeys: false,
  noCustodyOrEscrow: false,
  noTokenPitch: false,
  noMarketManipulation: false,
  legalEthicsReviewed: false
};

const draftPacket = (approvalId, actionType = "x_post") => ({
  approvalId,
  actionType,
  status: "draft",
  requestedBy: "allow-operator",
  requestedAt: "2026-06-09",
  approvedBy: "",
  approvedAt: "",
  action: {
    summary: `Approve ${approvalId}`,
    channel: actionType === "x_post" ? "x" : "email",
    destination: actionType === "x_post" ? "@allow_protocol" : "builder@example.com",
    exactText: "Safe draft text",
    executionMode: "human_only",
    automated: false
  },
  approvals: { ...approvalFlags },
  payload: {}
});

const launchSequence = {
  status: "ready_for_external_action",
  currentStage: "public_build_post",
  stages: [
    {
      id: "public_build_post",
      title: "Post one build update",
      status: "ready_for_human_action",
      externalActionType: "x_post",
      openGates: [],
      blockers: []
    },
    {
      id: "merchant_outreach",
      title: "Send first merchant outreach",
      status: "ready_for_human_action",
      externalActionType: "merchant_outreach",
      openGates: [],
      blockers: []
    },
    {
      id: "deployment_review_package",
      title: "Prepare deployment evidence",
      status: "waiting_for_evidence",
      externalActionType: "contract_deployment",
      openGates: [],
      blockers: ["deployment evidence has not passed"],
      nextAction: "Fill deployment evidence"
    }
  ]
};

const report = buildExternalActionWorkspaceReport(
  {
    launchSequence,
    actionPacks: [
      {
        stageId: "public_build_post",
        source: "x_post_action_pack",
        actionType: "x_post",
        report: {
          valid: true,
          packets: [draftPacket("x_post_day_one")]
        }
      },
      {
        stageId: "merchant_outreach",
        source: "outreach_action_pack",
        actionType: "merchant_outreach",
        report: {
          valid: true,
          packets: [draftPacket("merchant_outreach_first", "merchant_outreach")]
        }
      }
    ]
  },
  {
    generatedAt: "2026-06-09T00:00:00.000Z",
    outputDir: "work/external-action-workspace"
  }
);

assert.equal(report.valid, true);
assert.equal(report.status, "ready_for_review");
assert.equal(report.counts.draftPackets, 2);
assert.equal(report.counts.evidenceTemplates, 2);
assert.equal(report.counts.blocked, 1);
assert.equal(report.files.length, 6);
assert.equal(report.files[0].path, "manifest.json");
assert.equal(report.files[1].path, "REVIEW_CHECKLIST.md");
assert.equal(report.files[2].path, "packets/01-x-post-day-one.draft.json");
assert.equal(report.files[3].path, "packets/02-merchant-outreach-first.draft.json");
assert.equal(report.files[4].path, "evidence/01-x-post-day-one.x-post-execution.template.json");
assert.equal(report.files[5].path, "evidence/02-merchant-outreach-first.outreach-execution.template.json");
assert.match(report.files[2].content, /"status": "draft"/);
assert.match(report.files[4].content, /"executionStatus": "posted"/);
assert.match(report.files[4].content, /"accountOwnerApproved": false/);
assert.match(report.files[5].content, /"outreachStatus": "sent"/);
assert.match(report.files[5].content, /"humanExecuted": false/);
assert.equal(
  report.files[4].validationCommand,
  "npm run x-post-execution-evidence -- work/external-action-workspace/evidence/01-x-post-day-one.x-post-execution.template.json"
);
assert.match(report.files[2].sha256, /^0x[0-9a-f]{64}$/);
assert.equal(report.manifest.draftPackets[0].approvalId, "x_post_day_one");
assert.equal(report.manifest.executionEvidenceTemplates[0].approvalId, "x_post_day_one");
assert.equal(report.manifest.blocked[0].stageId, "deployment_review_package");
assert.match(report.checklist, /Before Any External Action/);
assert.match(report.checklist, /Evidence Templates/);
assert.equal(report.evidenceBoundary.postsContent, false);
assert.equal(report.evidenceBoundary.approvesExternalAction, false);
assert.equal(report.evidenceBoundary.writesLocalEvidenceTemplates, true);

const xPostEvidenceReport = await buildXPostExecutionEvidenceReport(JSON.parse(report.files[4].content));
assert.equal(xPostEvidenceReport.valid, false);
assert.ok(xPostEvidenceReport.reasons.includes("approvalPacket: External action must be approved before execution"));
assert.ok(xPostEvidenceReport.reasons.includes("posted.humanExecuted must be true"));

const outreachEvidenceReport = await buildOutreachExecutionEvidenceReport(JSON.parse(report.files[5].content));
assert.equal(outreachEvidenceReport.valid, false);
assert.ok(outreachEvidenceReport.reasons.includes("approvalPacket: External action must be approved before execution"));
assert.ok(outreachEvidenceReport.reasons.includes("sent.humanExecuted must be true"));

const publicReport = publicExternalActionWorkspaceReport(report);
assert.equal(publicReport.files[0].content, undefined);
assert.equal(publicReport.manifest.draftPackets.length, 2);

const prefilledApprovalReport = buildExternalActionWorkspaceReport({
  launchSequence,
  actionPacks: [
    {
      stageId: "public_build_post",
      actionType: "x_post",
      report: {
        valid: true,
        packets: [
          {
            ...draftPacket("x_post_prefilled"),
            approvals: {
              ...approvalFlags,
              humanWillExecute: true
            }
          }
        ]
      }
    }
  ]
});

assert.equal(prefilledApprovalReport.valid, false);
assert.ok(prefilledApprovalReport.reasons.some((reason) => reason.includes("must not prefill approval flags")));

console.log("externalActionWorkspace tests passed");
