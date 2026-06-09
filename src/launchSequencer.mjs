export const LAUNCH_SEQUENCE_STATUSES = [
  "complete",
  "ready_for_human_action",
  "waiting_for_evidence",
  "blocked",
  "not_ready"
];

export const LAUNCH_SEQUENCE_STAGE_IDS = [
  "public_build_post",
  "merchant_outreach",
  "merchant_interviews",
  "controller_policy_signature",
  "deployment_review_package",
  "live_pilot_traffic",
  "live_directory_claims",
  "token_legal_review"
];

const LIVE_ACTION_SAFETY_GATES = [
  "security.secret_exposure_response"
];

export function buildLaunchSequenceReport(input = {}, options = {}) {
  const readiness = input.readiness || {};
  const gateMap = new Map((readiness.gates || []).map((gate) => [gate.id, gate]));
  const context = {
    gateMap,
    signals: signalsFromInput(input)
  };

  const stages = stageDefinitions().map((definition) => buildStage(definition, context));
  const currentStage = stages.find((stage) => stage.status !== "complete") || null;
  const notReadyStages = stages.filter((stage) => stage.status === "not_ready");

  return {
    generatedAt: options.generatedAt || new Date().toISOString(),
    valid: readiness.status !== "not_ready" && notReadyStages.length === 0,
    status: reportStatus(currentStage, notReadyStages, stages),
    readinessStatus: readiness.status || null,
    currentStage: currentStage?.id || "launch_sequence_complete",
    completedStages: stages.filter((stage) => stage.status === "complete").length,
    totalStages: stages.length,
    stages,
    nextAction: currentStage?.nextAction || "Keep the operating loop running and keep token launch disabled until the usage gate passes",
    evidenceBoundary: {
      postsContent: false,
      sendsOutreach: false,
      signsWalletPayloads: false,
      deploysContracts: false,
      startsPilotTraffic: false,
      marksMerchantLive: false,
      enablesToken: false,
      movesFunds: false,
      storesSecrets: false,
      requiresHumanApproval: true
    }
  };
}

function buildStage(definition, context) {
  const requiredGateReports = definition.requiredGates.map((id) => gateReport(id, context.gateMap));
  const failedGates = requiredGateReports.filter((gate) => gate.status === "fail" || gate.status === "missing");
  const incompleteGates = requiredGateReports.filter((gate) => gate.status !== "pass");
  const blockers = definition.blockers ? definition.blockers(context) : [];
  const complete = definition.completeWhen ? definition.completeWhen(context) : incompleteGates.length === 0;

  let status = "ready_for_human_action";
  if (failedGates.length > 0) status = "not_ready";
  else if (complete) status = "complete";
  else if (blockers.length > 0) status = definition.blockedStatus || "blocked";
  else if (incompleteGates.length > 0) status = "waiting_for_evidence";

  return {
    id: definition.id,
    title: definition.title,
    status,
    requiredGates: requiredGateReports,
    openGates: incompleteGates.map((gate) => gate.id),
    blockers,
    externalActionType: definition.externalActionType || null,
    commands: definition.commands,
    evidenceRequired: definition.evidenceRequired,
    nextAction: nextActionForStage(definition, status, blockers, incompleteGates),
    evidenceBoundary: {
      performsExternalAction: false,
      requiresExternalActionApproval: Boolean(definition.externalActionType),
      countsUsageOrClaims: false
    }
  };
}

function stageDefinitions() {
  return [
    {
      id: "public_build_post",
      title: "Post one build update",
      requiredGates: [
        ...LIVE_ACTION_SAFETY_GATES,
        "distribution.launch_pack",
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
        "operations.external_action_approval"
      ],
      externalActionType: "x_post",
      completeWhen: ({ signals }) => signals.validatedXPosts > 0,
      commands: [
        "npm run x-post-action-pack",
        "npm run approval-preflight",
        "npm run approval-request",
        "npm run approval-decision-template",
        "npm run approval-decision -- <approved-decision.json> --require-approved",
        "npm run approval-packet-preview -- <approved-decision.json> <approved-x-post-packet.json>",
        "npm run external-action-approval -- <approved-x-post-packet.json>",
        "npm run x-post-execution-evidence -- <x-post-evidence.json>",
        "npm run execution-evidence-ledger-entry -- <x-post-evidence.json>",
        "npm run state-update-preview -- work/execution-evidence-ledger-entry.json",
        "npm run canonical-update-set -- work/execution-evidence-ledger-entry.json work/state-update-preview.json",
        "npm run x-post-state -- ops/x_post_execution_records.json"
      ],
      evidenceRequired: [
        "account-owner approval for exact text",
        "public post URL",
        "redacted post proof",
        "validated X execution record"
      ],
      nextAction: "Approve and post one draft manually, then validate the posted URL with X execution evidence"
    },
    {
      id: "merchant_outreach",
      title: "Send first merchant outreach",
      requiredGates: [
        ...LIVE_ACTION_SAFETY_GATES,
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
        "operations.external_action_approval"
      ],
      externalActionType: "merchant_outreach",
      completeWhen: ({ signals }) => signals.validatedOutreachRecords > 0,
      commands: [
        "npm run outreach-approval",
        "npm run outreach-action-pack",
        "npm run approval-preflight",
        "npm run approval-request",
        "npm run approval-decision-template",
        "npm run approval-decision -- <approved-decision.json> --require-approved",
        "npm run approval-packet-preview -- <approved-decision.json> <approved-outreach-packet.json>",
        "npm run external-action-approval -- <approved-outreach-packet.json>",
        "npm run outreach-execution-evidence -- <outreach-evidence.json>",
        "npm run execution-evidence-ledger-entry -- <outreach-evidence.json>",
        "npm run state-update-preview -- work/execution-evidence-ledger-entry.json",
        "npm run canonical-update-set -- work/execution-evidence-ledger-entry.json work/state-update-preview.json",
        "npm run outreach-state -- ops/outreach_execution_records.json"
      ],
      evidenceRequired: [
        "recipient and channel approval",
        "exact sent text",
        "redacted send proof",
        "validated outreach execution record"
      ],
      nextAction: "Approve and send the first merchant outreach manually, then add post-send execution evidence"
    },
    {
      id: "merchant_interviews",
      title: "Complete five merchant interviews",
      requiredGates: [
        "growth.interview_campaign",
        "growth.interview_packets",
        "growth.interview_workspace",
        "growth.interview_workspace_audit",
        "growth.interview_review_brief",
        "growth.interview_completion_handoff"
      ],
      completeWhen: ({ gateMap }) => gateStatus(gateMap, "growth.interviews") === "pass",
      commands: [
        "npm run interview-campaign",
        "npm run interview-packet",
        "npm run interview-workspace",
        "npm run interview-workspace-audit",
        "npm run interview-review-brief",
        "npm run interview-completion-handoff",
        "npm run interview-report"
      ],
      evidenceRequired: [
        "audited local prep workspace, review brief, and completion handoff",
        "five completed interviews",
        "at least five answered questions per interview",
        "valid merchant intake linked to each interview",
        "safety approvals"
      ],
      nextAction: "Review the audited interview brief, then run the first merchant interview only after approved contact and validate it with interview-report"
    },
    {
      id: "controller_policy_signature",
      title: "Sign production policy",
      requiredGates: [
        ...LIVE_ACTION_SAFETY_GATES,
        "security.signing_ceremony",
        "security.controller_signing_action_pack",
        "security.controller_signing_execution_evidence",
        "operations.approval_preflight",
        "operations.approval_request",
        "operations.approval_decision_template",
        "operations.approval_decision_validator",
        "operations.approval_packet_preview",
        "operations.external_action_approval"
      ],
      externalActionType: "controller_policy_signature",
      completeWhen: ({ gateMap }) => gateStatus(gateMap, "security.production_policy") === "pass",
      commands: [
        "npm run controller-signing-action-pack -- <policy.json> <controller>",
        "npm run approval-preflight",
        "npm run approval-request",
        "npm run approval-decision-template",
        "npm run approval-decision -- <approved-decision.json> --require-approved",
        "npm run approval-packet-preview -- <approved-decision.json> <approved-signing-packet.json>",
        "npm run external-action-approval -- <approved-signing-packet.json>",
        "npm run controller-signing-execution-evidence -- <signing-evidence.json>",
        "ALLOW_POLICY_PATH=<signed-policy.json> npm run readiness"
      ],
      evidenceRequired: [
        "approved signing packet",
        "wallet-owner typed-data signature",
        "signed policy stored outside the repo",
        "passing ceremony and production policy audit"
      ],
      nextAction: "Run the real controller signing ceremony with the wallet owner and store the signed policy outside the repository"
    },
    {
      id: "deployment_review_package",
      title: "Prepare deployment evidence",
      requiredGates: [
        ...LIVE_ACTION_SAFETY_GATES,
        "security.contract_review",
        "security.deployment_check_evidence",
        "security.independent_contract_review_evidence",
        "security.deployment_manifest",
        "operations.external_action_approval"
      ],
      externalActionType: "contract_deployment",
      blockedStatus: "waiting_for_evidence",
      completeWhen: ({ signals }) =>
        signals.deploymentCheckValid && signals.independentReviewValid && signals.deploymentManifestValid,
      blockers: ({ signals }) =>
        [
          signals.deploymentCheckValid ? null : "deployment check evidence has not passed",
          signals.independentReviewValid ? null : "independent contract review evidence has not passed",
          signals.deploymentManifestValid ? null : "deployment manifest has not passed"
        ].filter(Boolean),
      commands: [
        "npm test",
        "npm run contract-review",
        "npm run deployment-check-evidence -- <deployment-check-evidence.json>",
        "npm run independent-contract-review -- <independent-review-evidence.json>",
        "npm run validate-deployment -- <deployment-manifest.json>",
        "npm run external-action-approval -- <approved-deployment-packet.json>"
      ],
      evidenceRequired: [
        "passed npm test report",
        "compiler artifact hash",
        "static-analysis report hash",
        "independent reviewer approval",
        "deployment manifest with approved addresses"
      ],
      nextAction: "Fill the compiler/static-analysis evidence and independent review before any deployment approval"
    },
    {
      id: "live_pilot_traffic",
      title: "Run merchant-approved live pilot",
      requiredGates: [
        ...LIVE_ACTION_SAFETY_GATES,
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
        "operations.external_action_approval"
      ],
      externalActionType: "live_pilot",
      completeWhen: ({ gateMap }) => gateStatus(gateMap, "pilot.evidence") === "pass",
      blockers: ({ gateMap }) =>
        [
          gateStatus(gateMap, "growth.interviews") === "pass" ? null : "five valid merchant interviews are not complete",
          gateStatus(gateMap, "security.production_policy") === "pass" ? null : "production signed policy is not configured"
        ].filter(Boolean),
      commands: [
        "npm run pilot-authorization -- <authorization.json> <intake.json> ops/interviews.json",
        "npm run pilot-gateway-config -- <authorization.json> <intake.json> ops/interviews.json <payment-requirements.json>",
        "npm run live-pilot-preflight -- <binding.json> <signed-policy.json> <gateway.json> <dispute.json>",
        "npm run pilot-traffic-action-pack -- <binding.json> <signed-policy.json> <gateway.json> <dispute.json>",
        "npm run approval-preflight",
        "npm run approval-request",
        "npm run approval-decision-template",
        "npm run approval-decision -- <approved-decision.json> --require-approved",
        "npm run approval-packet-preview -- <approved-decision.json> <approved-live-pilot-packet.json>",
        "npm run external-action-approval -- <approved-live-pilot-packet.json>",
        "npm run pilot-traffic-execution-evidence -- <execution-evidence.json> <receipt-log.jsonl>",
        "npm run pilot-report -- <receipt-log.jsonl>"
      ],
      evidenceRequired: [
        "merchant-approved pilot scope",
        "signed policy and approved agent wallet binding",
        "allowed and denied pilot execution evidence",
        "merchant-approved receipt log"
      ],
      nextAction: "Do not run live traffic until interviews and signed policy are complete"
    },
    {
      id: "live_directory_claims",
      title: "Publish live merchant proof",
      requiredGates: [
        ...LIVE_ACTION_SAFETY_GATES,
        "distribution.merchant_directory",
        "distribution.pilot_disclosure_tooling",
        "distribution.merchant_promotion_tooling",
        "operations.evidence_bundle"
      ],
      externalActionType: "merchant_promotion",
      completeWhen: ({ signals }) => signals.liveMerchants > 0,
      blockers: ({ gateMap }) =>
        gateStatus(gateMap, "pilot.evidence") === "pass" ? [] : ["pilot evidence has not passed"],
      commands: [
        "npm run pilot-disclosure -- <pilot-disclosure.json> <receipt-log.jsonl>",
        "npm run merchant-promotion -- <promotion.json> ops/merchant_directory.json <pilot-disclosure.json> <receipt-log.jsonl>",
        "npm run evidence-bundle -- <evidence-bundle.json>"
      ],
      evidenceRequired: [
        "merchant-approved pilot disclosure",
        "signed live merchant profile",
        "redacted receipt evidence bundle"
      ],
      nextAction: "Wait for passing pilot evidence before any live directory or public usage claim"
    },
    {
      id: "token_legal_review",
      title: "Open token legal review",
      requiredGates: [
        "legal.docs",
        "token.governance_tooling"
      ],
      completeWhen: ({ gateMap }) => gateStatus(gateMap, "token.gate") === "pass",
      blockers: ({ gateMap }) =>
        gateStatus(gateMap, "token.gate") === "pass" ? [] : ["token usage gate has not cleared"],
      commands: [
        "npm run metrics-report -- <receipt-log.jsonl>",
        "npm run evidence-bundle -- <usage-evidence-bundle.json>",
        "npm run token-governance -- ops/token_governance.json"
      ],
      evidenceRequired: [
        "100 active agents with credible evidence",
        "50 merchants with credible receipts",
        "10000 credible receipts",
        "20% third-party receipt share",
        "legal review after usage clears"
      ],
      nextAction: "Keep token disabled until organic usage clears the documented governance threshold"
    }
  ];
}

function gateReport(id, gateMap) {
  const gate = gateMap.get(id);
  return {
    id,
    status: gate?.status || "missing",
    message: gate?.message || "Readiness gate is missing"
  };
}

function gateStatus(gateMap, id) {
  return gateMap.get(id)?.status || "missing";
}

function nextActionForStage(definition, status, blockers, openGates) {
  if (status === "complete") return "Complete";
  if (status === "not_ready") return `Fix readiness gates: ${openGates.map((gate) => gate.id).join(", ")}`;
  if (blockers.length > 0) return `${definition.nextAction}: ${blockers.join("; ")}`;
  return definition.nextAction;
}

function reportStatus(currentStage, notReadyStages, stages) {
  if (notReadyStages.length > 0) return "not_ready";
  if (!currentStage) return "complete";
  if (currentStage.status === "ready_for_human_action") return "ready_for_external_action";
  if (currentStage.status === "waiting_for_evidence") return "waiting_for_evidence";
  if (currentStage.status === "blocked") return "blocked_by_prior_evidence";
  return stages.some((stage) => stage.status === "blocked") ? "blocked_by_prior_evidence" : currentStage.status;
}

function signalsFromInput(input) {
  const pilotIntegrationState = input.pilotIntegrationState || {};
  const merchantReports = Array.isArray(pilotIntegrationState.merchants) ? pilotIntegrationState.merchants : [];

  return {
    validatedXPosts: Number(input.xPostState?.counts?.postsWithValidatedExecution || 0),
    validatedOutreachRecords: Number(input.outreachState?.counts?.validEvidenceRecords || 0),
    deploymentCheckValid: Boolean(input.deploymentCheckEvidence?.valid),
    independentReviewValid: Boolean(input.independentContractReview?.valid),
    deploymentManifestValid: Boolean(input.deploymentManifest?.valid),
    liveMerchants: merchantReports.filter((merchant) => merchant.current?.status === "live" || merchant.projected?.status === "live").length
  };
}
