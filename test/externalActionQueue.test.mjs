import assert from "node:assert/strict";
import { buildExternalActionQueueReport } from "../src/externalActionQueue.mjs";

const draftPacket = (approvalId, actionType = "x_post") => ({
  approvalId,
  actionType,
  status: "draft",
  action: {
    summary: `Approve ${approvalId}`,
    channel: actionType === "x_post" ? "x" : "email",
    destination: actionType === "x_post" ? "@allow_protocol" : "builder@example.com",
    executionMode: "human_only",
    automated: false
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
      blockers: [],
      commands: ["npm run x-post-action-pack"]
    },
    {
      id: "merchant_outreach",
      title: "Send first merchant outreach",
      status: "ready_for_human_action",
      externalActionType: "merchant_outreach",
      openGates: [],
      blockers: [],
      commands: ["npm run outreach-action-pack"]
    },
    {
      id: "controller_policy_signature",
      title: "Sign production policy",
      status: "ready_for_human_action",
      externalActionType: "controller_policy_signature",
      openGates: [],
      blockers: [],
      commands: ["npm run controller-signing-action-pack"]
    },
    {
      id: "deployment_review_package",
      title: "Prepare deployment evidence",
      status: "waiting_for_evidence",
      externalActionType: "contract_deployment",
      openGates: [],
      blockers: ["deployment evidence has not passed"],
      commands: ["npm run validate-deployment"],
      nextAction: "Fill deployment evidence"
    }
  ]
};

const report = buildExternalActionQueueReport({
  launchSequence,
  actionPacks: [
    {
      stageId: "public_build_post",
      source: "x_post_action_pack",
      actionType: "x_post",
      sourceCommand: "npm run x-post-action-pack",
      report: {
        valid: true,
        packets: [draftPacket("x_post_day_one")]
      }
    },
    {
      stageId: "merchant_outreach",
      source: "outreach_action_pack",
      actionType: "merchant_outreach",
      sourceCommand: "npm run outreach-action-pack",
      report: {
        valid: true,
        packets: [draftPacket("merchant_outreach_first", "merchant_outreach")]
      }
    },
    {
      stageId: "controller_policy_signature",
      source: "controller_signing_action_pack",
      actionType: "controller_policy_signature",
      sourceCommand: "npm run controller-signing-action-pack",
      report: {
        valid: false,
        reasons: ["Production policy controller must be a 20-byte EVM address"],
        packets: [draftPacket("controller_policy_signature_demo", "controller_policy_signature")]
      }
    }
  ]
}, { generatedAt: "2026-06-09T00:00:00.000Z" });

assert.equal(report.valid, true);
assert.equal(report.status, "has_ready_actions");
assert.equal(report.currentStage, "public_build_post");
assert.equal(report.primaryAction.approvalId, "x_post_day_one");
assert.equal(report.counts.readyForApproval, 2);
assert.equal(report.counts.needsPacketFixes, 1);
assert.equal(report.counts.blocked, 1);
assert.equal(report.items.find((item) => item.approvalId === "controller_policy_signature_demo").status, "needs_packet_fixes");
assert.equal(report.items.find((item) => item.stageId === "deployment_review_package").status, "blocked");
assert.equal(report.evidenceBoundary.postsContent, false);
assert.equal(report.evidenceBoundary.requiresHumanApproval, true);

const blockedReport = buildExternalActionQueueReport({
  launchSequence: {
    currentStage: "public_build_post",
    stages: [
      {
        id: "public_build_post",
        title: "Post one build update",
        status: "blocked",
        externalActionType: "x_post",
        blockers: ["post execution evidence is missing"]
      }
    ]
  },
  actionPacks: [
    {
      stageId: "public_build_post",
      actionType: "x_post",
      report: {
        valid: true,
        packets: [draftPacket("x_post_blocked")]
      }
    }
  ]
});

assert.equal(blockedReport.status, "blocked_by_evidence");
assert.equal(blockedReport.items[0].status, "blocked");
assert.ok(blockedReport.items[0].reasons.includes("post execution evidence is missing"));

const duplicateReport = buildExternalActionQueueReport({
  launchSequence,
  actionPacks: [
    {
      stageId: "public_build_post",
      actionType: "x_post",
      report: {
        valid: true,
        packets: [draftPacket("duplicate_id")]
      }
    },
    {
      stageId: "merchant_outreach",
      actionType: "merchant_outreach",
      report: {
        valid: true,
        packets: [draftPacket("duplicate_id", "merchant_outreach")]
      }
    }
  ]
});

assert.equal(duplicateReport.valid, false);
assert.equal(duplicateReport.status, "not_ready");
assert.equal(duplicateReport.counts.notReady, 2);
assert.ok(duplicateReport.reasons.some((reason) => reason.includes("Duplicate approvalId duplicate_id")));

console.log("externalActionQueue tests passed");
