import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { buildExternalActionReviewBrief } from "../src/externalActionReviewBrief.mjs";
import { buildExternalActionWorkspaceReport } from "../src/externalActionWorkspace.mjs";

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
    subject: actionType === "merchant_outreach" ? "Allow Protocol feedback request" : undefined,
    exactText: actionType === "x_post" ? "Safe public build update" : "Safe merchant outreach note",
    executionMode: "human_only",
    automated: false
  },
  approvals: { ...approvalFlags },
  payload: actionType === "merchant_outreach"
    ? {
        outreachDraft: {
          candidateId: "candidate-one",
          prospectId: "prospect-one",
          channel: "email",
          destination: "builder@example.com",
          subject: "Allow Protocol feedback request",
          message: "Safe merchant outreach note"
        }
      }
    : {
        post: {
          id: "post-one",
          status: "draft_only",
          text: "Safe public build update"
        }
      }
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
      id: "live_pilot_traffic",
      title: "Run live pilot",
      status: "blocked",
      externalActionType: "live_pilot",
      openGates: [],
      blockers: ["production signed policy is not configured"]
    }
  ]
};

const workspaceReport = buildExternalActionWorkspaceReport(
  {
    launchSequence,
    actionPacks: [
      {
        stageId: "public_build_post",
        actionType: "x_post",
        report: {
          valid: true,
          packets: [draftPacket("x_post_day_one")]
        }
      },
      {
        stageId: "merchant_outreach",
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

const workspace = await mkdtemp(join(tmpdir(), "allow-review-brief-"));
await writeWorkspace(workspaceReport, workspace);

const brief = await buildExternalActionReviewBrief(workspace, {
  generatedAt: "2026-06-09T01:00:00.000Z"
});

assert.equal(brief.valid, true);
assert.equal(brief.status, "ready_for_packet_review");
assert.equal(brief.counts.reviewActions, 2);
assert.equal(brief.counts.xPosts, 1);
assert.equal(brief.counts.merchantOutreach, 1);
assert.equal(brief.counts.blocked, 1);
assert.equal(brief.actions[0].approvalId, "x_post_day_one");
assert.equal(brief.actions[0].approvalFlags.trueCount, 0);
assert.equal(brief.actions[0].packetAuditStatus, "verified");
assert.equal(brief.actions[1].evidenceTemplateAuditStatus, "verified");
assert.match(brief.markdown, /Allow External Action Review Brief/);
assert.match(brief.markdown, /Safe public build update/);
assert.match(brief.markdown, /Safe merchant outreach note/);
assert.match(brief.markdown, /No packet is approved by this brief/);
assert.match(brief.markdown, /Blocked Future Actions/);
assert.equal(brief.evidenceBoundary.postsContent, false);
assert.equal(brief.evidenceBoundary.approvesExternalAction, false);

const tamperedWorkspace = await mkdtemp(join(tmpdir(), "allow-review-brief-tampered-"));
await writeWorkspace(workspaceReport, tamperedWorkspace);
const packetPath = join(tamperedWorkspace, "packets/01-x-post-day-one.draft.json");
const packet = JSON.parse(await readFile(packetPath, "utf8"));
packet.status = "approved";
packet.approvals.humanWillExecute = true;
await writeFile(packetPath, `${JSON.stringify(packet, null, 2)}\n`);
const tamperedBrief = await buildExternalActionReviewBrief(tamperedWorkspace);
assert.equal(tamperedBrief.valid, false);
assert.equal(tamperedBrief.status, "needs_workspace_fixes");
assert.ok(tamperedBrief.reasons.some((reason) => reason.includes("draft packet status must remain draft")));
assert.match(tamperedBrief.markdown, /Workspace Needs Fixes/);

const missingWorkspace = await mkdtemp(join(tmpdir(), "allow-review-brief-missing-"));
await writeWorkspace(workspaceReport, missingWorkspace);
await rm(join(missingWorkspace, "manifest.json"));
const missingBrief = await buildExternalActionReviewBrief(missingWorkspace);
assert.equal(missingBrief.valid, false);
assert.equal(missingBrief.status, "missing_manifest");
assert.match(missingBrief.markdown, /Workspace Needs Fixes/);

console.log("externalActionReviewBrief tests passed");

async function writeWorkspace(report, dir) {
  for (const file of report.files) {
    const target = join(dir, file.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, file.content, "utf8");
  }
}
