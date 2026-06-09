import assert from "node:assert/strict";
import { LAUNCH_SEQUENCE_STAGE_IDS, buildLaunchSequenceReport } from "../src/launchSequencer.mjs";

const pass = (id) => ({ id, status: "pass", message: `${id} passed` });
const action = (id) => ({ id, status: "action_required", message: `${id} needs action` });
const fail = (id) => ({ id, status: "fail", message: `${id} failed` });

const baseReadiness = {
  status: "needs_external_action",
  gates: [
    "distribution.launch_pack",
    "security.secret_exposure_response",
    "distribution.x_post_action_pack",
    "distribution.x_post_execution_evidence",
    "distribution.x_post_state",
    "operations.execution_evidence_ledger_entry",
    "operations.state_update_preview",
    "operations.canonical_update_set",
    "operations.approval_preflight",
    "operations.approval_request",
    "operations.approval_decision_template",
    "operations.approval_decision_validator",
    "operations.approval_packet_preview",
    "operations.external_action_approval",
    "growth.prospects",
    "distribution.outreach_approval",
    "distribution.outreach_action_pack",
    "distribution.outreach_execution_evidence",
    "distribution.outreach_state",
    "operations.execution_evidence_ledger_entry",
    "operations.state_update_preview",
    "operations.canonical_update_set",
    "operations.approval_preflight",
    "operations.approval_request",
    "operations.approval_decision_template",
    "operations.approval_decision_validator",
    "operations.approval_packet_preview",
    "growth.interview_campaign",
    "growth.interview_packets",
    "growth.interview_workspace",
    "growth.interview_workspace_audit",
    "growth.interview_review_brief",
    "growth.interview_completion_handoff",
    "security.signing_ceremony",
    "security.controller_signing_action_pack",
    "security.controller_signing_execution_evidence",
    "operations.approval_preflight",
    "operations.approval_request",
    "operations.approval_decision_template",
    "operations.approval_decision_validator",
    "operations.approval_packet_preview",
    "security.contract_review",
    "security.deployment_check_evidence",
    "security.independent_contract_review_evidence",
    "security.deployment_manifest",
    "product.pilot",
    "operations.dispute_process",
    "security.pilot_agent_binding",
    "security.production_runtime_guard",
    "security.settlement_proofs",
    "security.x402_facilitator",
    "operations.approval_preflight",
    "operations.approval_request",
    "operations.approval_decision_template",
    "operations.approval_decision_validator",
    "operations.approval_packet_preview",
    "distribution.merchant_directory",
    "distribution.pilot_disclosure_tooling",
    "distribution.merchant_promotion_tooling",
    "operations.evidence_bundle",
    "legal.docs",
    "token.governance_tooling"
  ].map(pass).concat([
    action("growth.interviews"),
    action("security.production_policy"),
    action("pilot.evidence"),
    action("token.gate")
  ])
};

const current = buildLaunchSequenceReport({
  readiness: baseReadiness,
  xPostState: { counts: { postsWithValidatedExecution: 0 } },
  outreachState: { counts: { validEvidenceRecords: 0 } },
  deploymentCheckEvidence: { valid: false },
  independentContractReview: { valid: false },
  deploymentManifest: { valid: false },
  pilotIntegrationState: { merchants: [] }
}, { generatedAt: "2026-06-09T00:00:00.000Z" });

assert.equal(current.valid, true);
assert.equal(current.status, "ready_for_external_action");
assert.equal(current.currentStage, "public_build_post");
assert.deepEqual(current.stages.map((stage) => stage.id), LAUNCH_SEQUENCE_STAGE_IDS);
const publicPostStage = current.stages.find((stage) => stage.id === "public_build_post");
assert.ok(publicPostStage.requiredGates.some((gate) => gate.id === "security.secret_exposure_response"));
assert.ok(publicPostStage.requiredGates.some((gate) => gate.id === "operations.canonical_update_set"));
assert.ok(publicPostStage.requiredGates.some((gate) => gate.id === "operations.approval_preflight"));
assert.ok(publicPostStage.requiredGates.some((gate) => gate.id === "operations.approval_request"));
assert.ok(publicPostStage.requiredGates.some((gate) => gate.id === "operations.approval_decision_template"));
assert.ok(publicPostStage.requiredGates.some((gate) => gate.id === "operations.approval_decision_validator"));
assert.ok(publicPostStage.requiredGates.some((gate) => gate.id === "operations.approval_packet_preview"));
assert.ok(publicPostStage.commands.includes("npm run approval-preflight"));
assert.ok(publicPostStage.commands.includes("npm run approval-request"));
assert.ok(publicPostStage.commands.includes("npm run approval-decision-template"));
assert.ok(publicPostStage.commands.includes("npm run approval-decision -- <approved-decision.json> --require-approved"));
assert.ok(publicPostStage.commands.includes("npm run approval-packet-preview -- <approved-decision.json> <approved-x-post-packet.json>"));
assert.ok(publicPostStage.commands.includes("npm run canonical-update-set -- work/execution-evidence-ledger-entry.json work/state-update-preview.json"));
const outreachStage = current.stages.find((stage) => stage.id === "merchant_outreach");
assert.ok(outreachStage.requiredGates.some((gate) => gate.id === "security.secret_exposure_response"));
assert.ok(outreachStage.requiredGates.some((gate) => gate.id === "operations.canonical_update_set"));
assert.ok(outreachStage.requiredGates.some((gate) => gate.id === "operations.approval_preflight"));
assert.ok(outreachStage.requiredGates.some((gate) => gate.id === "operations.approval_request"));
assert.ok(outreachStage.requiredGates.some((gate) => gate.id === "operations.approval_decision_template"));
assert.ok(outreachStage.requiredGates.some((gate) => gate.id === "operations.approval_decision_validator"));
assert.ok(outreachStage.requiredGates.some((gate) => gate.id === "operations.approval_packet_preview"));
assert.ok(outreachStage.commands.includes("npm run approval-preflight"));
assert.ok(outreachStage.commands.includes("npm run approval-request"));
assert.ok(outreachStage.commands.includes("npm run approval-decision-template"));
assert.ok(outreachStage.commands.includes("npm run approval-decision -- <approved-decision.json> --require-approved"));
assert.ok(outreachStage.commands.includes("npm run approval-packet-preview -- <approved-decision.json> <approved-outreach-packet.json>"));
assert.ok(outreachStage.commands.includes("npm run canonical-update-set -- work/execution-evidence-ledger-entry.json work/state-update-preview.json"));
const interviewStage = current.stages.find((stage) => stage.id === "merchant_interviews");
assert.ok(interviewStage.requiredGates.some((gate) => gate.id === "growth.interview_workspace_audit"));
assert.ok(interviewStage.requiredGates.some((gate) => gate.id === "growth.interview_review_brief"));
assert.ok(interviewStage.requiredGates.some((gate) => gate.id === "growth.interview_completion_handoff"));
assert.ok(interviewStage.commands.includes("npm run interview-review-brief"));
assert.ok(interviewStage.commands.includes("npm run interview-completion-handoff"));
assert.ok(interviewStage.evidenceRequired.includes("audited local prep workspace, review brief, and completion handoff"));
assert.equal(current.stages.find((stage) => stage.id === "deployment_review_package").status, "waiting_for_evidence");
assert.equal(current.stages.find((stage) => stage.id === "live_pilot_traffic").status, "blocked");
assert.ok(current.stages.find((stage) => stage.id === "live_pilot_traffic").blockers.includes("five valid merchant interviews are not complete"));
assert.equal(current.evidenceBoundary.postsContent, false);
assert.equal(current.evidenceBoundary.requiresHumanApproval, true);

const unresolvedSecretExposure = buildLaunchSequenceReport({
  readiness: {
    ...baseReadiness,
    gates: baseReadiness.gates.map((gate) =>
      gate.id === "security.secret_exposure_response" ? action(gate.id) : gate
    )
  },
  xPostState: { counts: { postsWithValidatedExecution: 0 } },
  outreachState: { counts: { validEvidenceRecords: 0 } },
  deploymentCheckEvidence: { valid: false },
  independentContractReview: { valid: false },
  deploymentManifest: { valid: false },
  pilotIntegrationState: { merchants: [] }
}, { generatedAt: "2026-06-09T00:00:00.000Z" });

assert.equal(unresolvedSecretExposure.status, "waiting_for_evidence");
assert.equal(unresolvedSecretExposure.currentStage, "public_build_post");
assert.equal(unresolvedSecretExposure.stages.find((stage) => stage.id === "public_build_post").status, "waiting_for_evidence");
assert.ok(unresolvedSecretExposure.stages.find((stage) => stage.id === "public_build_post").openGates.includes("security.secret_exposure_response"));

const notReady = buildLaunchSequenceReport({
  readiness: {
    status: "not_ready",
    gates: baseReadiness.gates.map((gate) => gate.id === "distribution.launch_pack" ? fail(gate.id) : gate)
  }
});

assert.equal(notReady.valid, false);
assert.equal(notReady.status, "not_ready");
assert.equal(notReady.currentStage, "public_build_post");
assert.ok(notReady.stages[0].openGates.includes("distribution.launch_pack"));

const completeReadiness = {
  status: "ready_for_next_launch_step",
  gates: baseReadiness.gates.map((gate) => pass(gate.id))
};
const complete = buildLaunchSequenceReport({
  readiness: completeReadiness,
  xPostState: { counts: { postsWithValidatedExecution: 1 } },
  outreachState: { counts: { validEvidenceRecords: 1 } },
  deploymentCheckEvidence: { valid: true },
  independentContractReview: { valid: true },
  deploymentManifest: { valid: true },
  pilotIntegrationState: {
    merchants: [
      {
        current: { status: "live" }
      }
    ]
  }
});

assert.equal(complete.status, "complete");
assert.equal(complete.currentStage, "launch_sequence_complete");
assert.equal(complete.completedStages, LAUNCH_SEQUENCE_STAGE_IDS.length);

console.log("launchSequencer tests passed");
