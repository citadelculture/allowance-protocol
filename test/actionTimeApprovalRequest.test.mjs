import assert from "node:assert/strict";
import { buildActionTimeApprovalRequest } from "../src/actionTimeApprovalRequest.mjs";

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

const approvalPreflight = {
  valid: true,
  ready: true,
  status: "ready_for_action_time_approval",
  action: {
    approvalId: "x_post_day_one",
    stageId: "public_build_post",
    actionType: "x_post",
    title: "Human posts Allow launch draft",
    destination: "@allow_protocol",
    channel: "x",
    packetPath: "packets/01-x-post-day-one.draft.json",
    evidenceTemplatePath: "evidence/01-x-post-day-one.x-post-execution.template.json",
    approvalCommand: "npm run external-action-approval -- work/external-action-workspace/packets/01-x-post-day-one.draft.json",
    evidenceValidationCommand: "npm run x-post-execution-evidence -- work/external-action-workspace/evidence/01-x-post-day-one.x-post-execution.template.json"
  },
  reasons: [],
  warnings: []
};

const draftPacket = {
  approvalId: "x_post_day_one",
  actionType: "x_post",
  status: "draft",
  requestedBy: "allow-operator",
  requestedAt: "2026-06-09",
  approvedBy: "",
  approvedAt: "",
  action: {
    summary: "Human posts Allow launch draft",
    channel: "x",
    destination: "@allow_protocol",
    exactText: "AI agents should not get blank-check wallets.",
    executionMode: "human_only",
    automated: false
  },
  approvals: { ...approvalFlags },
  payload: {
    post: {
      id: "day-one",
      status: "draft_only",
      text: "AI agents should not get blank-check wallets."
    }
  }
};

const request = buildActionTimeApprovalRequest(
  {
    approvalPreflight,
    draftPacket
  },
  {
    generatedAt: "2026-06-09T10:00:00.000Z"
  }
);

assert.equal(request.valid, true);
assert.equal(request.ready, true);
assert.equal(request.status, "ready_for_human_decision");
assert.equal(request.approvalId, "x_post_day_one");
assert.equal(request.actionType, "x_post");
assert.equal(request.exactTextChars, 45);
assert.ok(request.commands.includes("npm run canonical-update-set -- work/execution-evidence-ledger-entry.json work/state-update-preview.json"));
assert.ok(request.commands.includes("npm run x-post-state -- ops/x_post_execution_records.json"));
assert.match(request.markdown, /Allow Action-Time Approval Request/);
assert.match(request.markdown, /AI agents should not get blank-check wallets/);
assert.match(request.markdown, /Set every approval flag to `true` only after review/);
assert.equal(request.evidenceBoundary.approvesExternalAction, false);
assert.equal(request.evidenceBoundary.postsContent, false);

const alreadyApproved = buildActionTimeApprovalRequest({
  approvalPreflight,
  draftPacket: {
    ...draftPacket,
    status: "approved",
    approvedBy: "operator",
    approvedAt: "2026-06-09",
    approvals: {
      ...approvalFlags,
      humanWillExecute: true
    }
  }
});

assert.equal(alreadyApproved.valid, false);
assert.equal(alreadyApproved.status, "needs_packet_fixes");
assert.ok(alreadyApproved.reasons.some((reason) => reason.includes("status=draft")));
assert.ok(alreadyApproved.reasons.some((reason) => reason.includes("must not prefill approval flags")));

const invalidPreflight = buildActionTimeApprovalRequest({
  approvalPreflight: {
    ...approvalPreflight,
    valid: false,
    ready: false,
    status: "needs_preflight_fixes",
    reasons: ["Primary action evidence steps must include canonical-update-set"]
  },
  draftPacket
});

assert.equal(invalidPreflight.valid, false);
assert.equal(invalidPreflight.status, "needs_preflight_fixes");
assert.ok(invalidPreflight.reasons.some((reason) => reason.includes("canonical-update-set")));

const mismatchedPacket = buildActionTimeApprovalRequest({
  approvalPreflight,
  draftPacket: {
    ...draftPacket,
    approvalId: "different"
  }
});

assert.equal(mismatchedPacket.valid, false);
assert.ok(mismatchedPacket.reasons.includes("Draft packet approvalId does not match preflight action"));

console.log("actionTimeApprovalRequest tests passed");
