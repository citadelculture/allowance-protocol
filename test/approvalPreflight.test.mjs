import assert from "node:assert/strict";
import {
  buildApprovalPreflight,
  publicApprovalPreflightReport
} from "../src/approvalPreflight.mjs";
import {
  APPROVAL_RUNBOOK_FLAGS,
  buildApprovalRunbook
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
        trueCount: 0,
        trueFlags: []
      }
    }
  ],
  reasons: [],
  warnings: [],
  evidenceBoundary: {
    writesFiles: false,
    postsContent: false,
    sendsOutreach: false,
    signsWalletPayloads: false,
    deploysContracts: false,
    startsPilotTraffic: false,
    promotesMerchant: false,
    movesFunds: false,
    storesSecrets: false,
    approvesExternalAction: false,
    requiresHumanApproval: true
  }
};

const launchSequence = {
  valid: true,
  status: "ready_for_external_action",
  currentStage: "public_build_post",
  stages: [
    {
      id: "public_build_post",
      title: "Post one build update",
      status: "ready_for_human_action",
      externalActionType: "x_post",
      nextAction: "Approve and post one draft manually"
    }
  ]
};

const launchHandoffBrief = {
  valid: true,
  status: "ready_for_human_handoff",
  currentStage: {
    id: "public_build_post",
    title: "Post one build update",
    status: "ready_for_human_action",
    externalActionType: "x_post",
    nextAction: "Approve and post one draft manually"
  }
};

const approvalRunbook = buildApprovalRunbook(
  {
    externalActionReviewBrief: reviewBrief,
    launchHandoffBrief,
    launchSequence
  },
  {
    generatedAt: "2026-06-09T09:30:00.000Z"
  }
);

const preflight = buildApprovalPreflight(
  {
    externalActionReviewBrief: reviewBrief,
    approvalRunbook,
    launchHandoffBrief,
    launchSequence
  },
  {
    generatedAt: "2026-06-09T09:31:00.000Z"
  }
);

assert.equal(preflight.valid, true);
assert.equal(preflight.ready, true);
assert.equal(preflight.status, "ready_for_action_time_approval");
assert.equal(preflight.action.approvalId, "x_post_day_one");
assert.equal(preflight.checks.reviewBriefValid, true);
assert.equal(preflight.checks.runbookValid, true);
assert.equal(preflight.checks.currentStageReady, true);
assert.equal(preflight.checks.postEvidencePathPresent, true);
assert.match(preflight.markdown, /Allow Approval Preflight/);
assert.match(preflight.markdown, /x-post-state -- ops\/x_post_execution_records\.json/);
assert.equal(preflight.evidenceBoundary.postsContent, false);
assert.equal(preflight.evidenceBoundary.updatesCanonicalState, false);
assert.equal(publicApprovalPreflightReport(preflight).markdown, undefined);

const outreachRunbook = buildApprovalRunbook({
  externalActionReviewBrief: reviewBrief,
  launchHandoffBrief: {
    currentStage: {
      id: "merchant_outreach",
      status: "ready_for_human_action",
      externalActionType: "merchant_outreach"
    }
  },
  launchSequence: {
    status: "ready_for_external_action",
    currentStage: "merchant_outreach"
  }
});
const outreachPreflight = buildApprovalPreflight({
  externalActionReviewBrief: reviewBrief,
  approvalRunbook: outreachRunbook,
  launchHandoffBrief: {
    currentStage: {
      id: "merchant_outreach",
      status: "ready_for_human_action",
      externalActionType: "merchant_outreach"
    }
  },
  launchSequence: {
    status: "ready_for_external_action",
    currentStage: "merchant_outreach"
  }
});
assert.equal(outreachPreflight.valid, true);
assert.equal(outreachPreflight.action.approvalId, "merchant_outreach_first");
assert.match(outreachPreflight.markdown, /outreach-state -- ops\/outreach_execution_records\.json/);

const missingPreviewRunbook = {
  ...approvalRunbook,
  actions: approvalRunbook.actions.map((action) => action.approvalId === "x_post_day_one"
    ? {
        ...action,
        evidence: action.evidence.filter((step) => !step.includes("canonical-update-set"))
      }
    : action)
};
const missingPreview = buildApprovalPreflight({
  externalActionReviewBrief: reviewBrief,
  approvalRunbook: missingPreviewRunbook,
  launchHandoffBrief,
  launchSequence
});
assert.equal(missingPreview.valid, false);
assert.equal(missingPreview.status, "needs_preflight_fixes");
assert.ok(missingPreview.reasons.some((reason) => reason.includes("canonical-update-set")));

const noExternalStage = buildApprovalPreflight({
  externalActionReviewBrief: reviewBrief,
  approvalRunbook,
  launchHandoffBrief: {
    currentStage: {
      id: "merchant_interviews",
      status: "ready_for_human_action",
      externalActionType: null
    }
  },
  launchSequence: {
    status: "ready_for_external_action",
    currentStage: "merchant_interviews"
  }
});
assert.equal(noExternalStage.valid, false);
assert.equal(noExternalStage.status, "no_external_action_ready");
assert.ok(noExternalStage.reasons.some((reason) => reason.includes("not an external-action stage")));

console.log("approvalPreflight tests passed");
