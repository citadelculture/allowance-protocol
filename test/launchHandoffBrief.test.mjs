import assert from "node:assert/strict";
import { buildLaunchHandoffBrief } from "../src/launchHandoffBrief.mjs";

const launchSequence = {
  valid: true,
  status: "ready_for_external_action",
  readinessStatus: "needs_external_action",
  currentStage: "public_build_post",
  stages: [
    {
      id: "public_build_post",
      title: "Post one build update",
      status: "ready_for_human_action",
      externalActionType: "x_post",
      commands: [
        "npm run x-post-action-pack",
        "npm run external-action-approval -- <approved-x-post-packet.json>"
      ],
      evidenceRequired: ["account-owner approval for exact text", "public post URL"],
      openGates: [],
      blockers: [],
      nextAction: "Approve and post one draft manually"
    },
    {
      id: "live_pilot_traffic",
      title: "Run merchant-approved live pilot",
      status: "blocked",
      externalActionType: "live_pilot",
      commands: ["npm run live-pilot-preflight -- <binding> <policy> <gateway> <dispute>"],
      evidenceRequired: ["merchant-approved pilot scope"],
      openGates: [],
      blockers: ["five valid merchant interviews are not complete"],
      nextAction: "Do not run live traffic until interviews and signed policy are complete"
    }
  ]
};

const externalActionReviewBrief = {
  valid: true,
  status: "ready_for_packet_review",
  actions: [
    {
      approvalId: "x_post_day_one",
      actionType: "x_post",
      title: "Post one build update",
      destination: "@allow_protocol",
      channel: "x",
      approvalCommand: "npm run external-action-approval -- work/external-action-workspace/packets/x-post-day-one.draft.json",
      approvalFlags: {
        trueCount: 0,
        required: 9
      }
    }
  ]
};

const interviewReviewBrief = {
  valid: true,
  status: "ready_for_interview_review",
  counts: {
    reviewActions: 5,
    totalQuestions: 45,
    blockedCandidates: 1,
    shortfall: 5,
    shortfallAfterPlan: 0
  },
  actions: [
    {
      candidateName: "BlockRun Labs"
    }
  ],
  nextAction: "Use the review brief to inspect interview prep"
};

const brief = buildLaunchHandoffBrief(
  {
    readiness: {
      status: "needs_external_action",
      gates: [
        { id: "growth.interviews", status: "action_required", message: "Five interviews missing" },
        { id: "token.gate", status: "action_required", message: "Token remains locked" }
      ]
    },
    launchSequence,
    externalActionReviewBrief,
    interviewReviewBrief
  },
  {
    generatedAt: "2026-06-09T06:30:00.000Z"
  }
);

assert.equal(brief.valid, true);
assert.equal(brief.status, "ready_for_human_handoff");
assert.equal(brief.currentStage.id, "public_build_post");
assert.equal(brief.readyExternalActions.length, 1);
assert.equal(brief.interviewPrep.reviewActions, 5);
assert.equal(brief.counts.openReadinessGates, 2);
assert.match(brief.markdown, /Allow Launch Handoff Brief/);
assert.match(brief.markdown, /Approve and post one draft manually/);
assert.match(brief.markdown, /x_post_day_one/);
assert.match(brief.markdown, /BlockRun Labs/);
assert.match(brief.markdown, /does not post to X, send outreach/);
assert.equal(brief.evidenceBoundary.approvesExternalAction, false);

const invalid = buildLaunchHandoffBrief({
  launchSequence,
  externalActionReviewBrief: {
    valid: false,
    reasons: ["draft packet was edited into approved status"]
  },
  interviewReviewBrief
});

assert.equal(invalid.valid, false);
assert.equal(invalid.status, "needs_launch_fixes");
assert.ok(invalid.reasons.some((reason) => reason.includes("external action review brief")));
assert.match(invalid.markdown, /Handoff Needs Fixes/);

console.log("launchHandoffBrief tests passed");
