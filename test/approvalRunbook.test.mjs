import assert from "node:assert/strict";
import {
  APPROVAL_RUNBOOK_FLAGS,
  buildApprovalRunbook,
  publicApprovalRunbookReport
} from "../src/approvalRunbook.mjs";

const reviewBrief = {
  valid: true,
  status: "ready_for_packet_review",
  actions: [
    {
      approvalId: "x_post_day_one",
      stageId: "public_build_post",
      actionType: "x_post",
      title: "Human posts Allow launch draft",
      destination: "@allow_protocol",
      channel: "x",
      packetPath: "packets/01-x-post-day-one.draft.json",
      evidenceTemplatePath: "evidence/01-x-post-day-one.x-post-execution.template.json",
      approvalCommand: "npm run external-action-approval -- work/external-action-workspace/packets/01-x-post-day-one.draft.json",
      evidenceValidationCommand: "npm run x-post-execution-evidence -- work/external-action-workspace/evidence/01-x-post-day-one.x-post-execution.template.json",
      exactText: "Safe public build update",
      exactTextChars: 24,
      approvalFlags: {
        required: APPROVAL_RUNBOOK_FLAGS.length,
        trueCount: 0,
        trueFlags: []
      }
    },
    {
      approvalId: "merchant_outreach_first",
      stageId: "merchant_outreach",
      actionType: "merchant_outreach",
      title: "Human sends feedback ask",
      destination: "builder@example.com",
      channel: "email",
      packetPath: "packets/02-merchant-outreach-first.draft.json",
      evidenceTemplatePath: "evidence/02-merchant-outreach-first.outreach-execution.template.json",
      approvalCommand: "npm run external-action-approval -- work/external-action-workspace/packets/02-merchant-outreach-first.draft.json",
      evidenceValidationCommand: "npm run outreach-execution-evidence -- work/external-action-workspace/evidence/02-merchant-outreach-first.outreach-execution.template.json",
      exactText: "Safe merchant outreach note",
      exactTextChars: 27,
      approvalFlags: {
        required: APPROVAL_RUNBOOK_FLAGS.length,
        trueCount: 2,
        trueFlags: ["humanWillExecute", "automationDisabled"]
      }
    }
  ],
  reasons: [],
  warnings: []
};

const runbook = buildApprovalRunbook(
  {
    externalActionReviewBrief: reviewBrief,
    launchHandoffBrief: {
      currentStage: {
        id: "merchant_outreach"
      }
    }
  },
  {
    generatedAt: "2026-06-09T07:00:00.000Z"
  }
);

assert.equal(runbook.valid, true);
assert.equal(runbook.status, "ready_for_operator_review");
assert.equal(runbook.counts.actions, 2);
assert.equal(runbook.counts.xPosts, 1);
assert.equal(runbook.counts.merchantOutreach, 1);
assert.equal(runbook.counts.missingApprovalFlags, 16);
assert.equal(runbook.primaryAction.approvalId, "merchant_outreach_first");
assert.equal(runbook.actions[1].isCurrentStage, true);
assert.equal(runbook.actions[0].approval.missingFlags.length, APPROVAL_RUNBOOK_FLAGS.length);
assert.match(runbook.markdown, /Allow Approval Runbook/);
assert.match(runbook.markdown, /Before Approval/);
assert.match(runbook.markdown, /Human Execution/);
assert.match(runbook.markdown, /Evidence After Execution/);
assert.match(runbook.markdown, /Safe merchant outreach note/);
assert.match(runbook.markdown, /npm run execution-evidence-ledger-entry -- work\/external-action-workspace\/evidence\/02-merchant-outreach-first\.outreach-execution\.template\.json/);
assert.match(runbook.markdown, /npm run state-update-preview -- work\/execution-evidence-ledger-entry\.json/);
assert.match(runbook.markdown, /npm run canonical-update-set -- work\/execution-evidence-ledger-entry\.json work\/state-update-preview\.json/);
assert.match(runbook.markdown, /npm run outreach-state -- ops\/outreach_execution_records\.json/);
const xPostAction = runbook.actions.find((action) => action.actionType === "x_post");
assert.ok(xPostAction.evidence.some((step) => step.includes("npm run canonical-update-set")));
assert.ok(xPostAction.evidence.some((step) => step.includes("npm run x-post-state -- ops/x_post_execution_records.json")));
assert.match(runbook.markdown, /does not approve packets/);
assert.equal(runbook.evidenceBoundary.postsContent, false);
assert.equal(runbook.evidenceBoundary.approvesExternalAction, false);
assert.equal(runbook.evidenceBoundary.postExecutionEvidenceRequired, true);
assert.equal(publicApprovalRunbookReport(runbook).markdown, undefined);

const noActions = buildApprovalRunbook({
  externalActionReviewBrief: {
    valid: true,
    status: "no_ready_packets",
    actions: []
  }
});
assert.equal(noActions.valid, true);
assert.equal(noActions.status, "no_actions_ready");
assert.equal(noActions.primaryAction, null);

const invalid = buildApprovalRunbook({
  externalActionReviewBrief: {
    valid: false,
    status: "needs_workspace_fixes",
    actions: reviewBrief.actions,
    reasons: ["workspace hash mismatch"],
    warnings: ["regenerate workspace"]
  }
});
assert.equal(invalid.valid, false);
assert.equal(invalid.status, "needs_review_workspace_fixes");
assert.ok(invalid.reasons.includes("workspace hash mismatch"));
assert.match(invalid.markdown, /Runbook Needs Fixes/);

console.log("approvalRunbook tests passed");
