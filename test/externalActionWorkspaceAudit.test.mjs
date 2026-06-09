import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { buildExternalActionWorkspaceReport } from "../src/externalActionWorkspace.mjs";
import { buildExternalActionWorkspaceAuditReport } from "../src/externalActionWorkspaceAudit.mjs";

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
    exactText: "Safe draft text",
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
          message: "Safe draft text"
        }
      }
    : {
        post: {
          id: "post-one",
          status: "draft_only",
          text: "Safe draft text"
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
    }
  ]
};

const report = buildExternalActionWorkspaceReport(
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

const workspace = await mkdtemp(join(tmpdir(), "allow-workspace-audit-"));
await writeWorkspace(report, workspace);

const audit = await buildExternalActionWorkspaceAuditReport(workspace);
assert.equal(audit.valid, true);
assert.equal(audit.status, "verified_review_workspace");
assert.equal(audit.counts.checkedFiles, 4);
assert.equal(audit.counts.draftPackets, 2);
assert.equal(audit.counts.evidenceTemplates, 2);
assert.equal(audit.counts.hashMismatches, 0);
assert.equal(audit.evidenceBoundary.approvesExternalAction, false);

const extraWorkspace = await mkdtemp(join(tmpdir(), "allow-workspace-audit-extra-"));
await writeWorkspace(report, extraWorkspace);
await writeFile(join(extraWorkspace, "notes.txt"), "operator note\n");
const extraAudit = await buildExternalActionWorkspaceAuditReport(extraWorkspace);
assert.equal(extraAudit.valid, true);
assert.equal(extraAudit.counts.extraFiles, 1);
assert.ok(extraAudit.warnings.some((warning) => warning.includes("untracked files")));

const tamperedWorkspace = await mkdtemp(join(tmpdir(), "allow-workspace-audit-tampered-"));
await writeWorkspace(report, tamperedWorkspace);
const packetPath = join(tamperedWorkspace, "packets/01-x-post-day-one.draft.json");
const packet = JSON.parse(await readFile(packetPath, "utf8"));
packet.status = "approved";
packet.approvedBy = "operator";
packet.approvals.humanWillExecute = true;
await writeFile(packetPath, `${JSON.stringify(packet, null, 2)}\n`);
const tamperedAudit = await buildExternalActionWorkspaceAuditReport(tamperedWorkspace);
assert.equal(tamperedAudit.valid, false);
assert.equal(tamperedAudit.counts.hashMismatches, 1);
assert.ok(tamperedAudit.reasons.some((reason) => reason.includes("draft packet status must remain draft")));
assert.ok(tamperedAudit.reasons.some((reason) => reason.includes("approvals.humanWillExecute must remain false")));

const missingWorkspace = await mkdtemp(join(tmpdir(), "allow-workspace-audit-missing-"));
await writeWorkspace(report, missingWorkspace);
await rm(join(missingWorkspace, "evidence/02-merchant-outreach-first.outreach-execution.template.json"));
const missingAudit = await buildExternalActionWorkspaceAuditReport(missingWorkspace);
assert.equal(missingAudit.valid, false);
assert.equal(missingAudit.counts.missingFiles, 1);
assert.ok(missingAudit.reasons.some((reason) => reason.includes("Unable to read file")));

console.log("externalActionWorkspaceAudit tests passed");

async function writeWorkspace(workspaceReport, dir) {
  for (const file of workspaceReport.files) {
    const target = join(dir, file.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, file.content, "utf8");
  }
}
