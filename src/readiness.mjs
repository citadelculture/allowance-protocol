import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { deriveLaunchMetrics, loadReceiptRecordsFromPaths, receiptLogPathsFromEnv } from "./metrics.mjs";
import { summarizeLaunchPosts } from "./socialLaunch.mjs";
import { buildXPostActionPack } from "./xPostActionPack.mjs";
import { verifyProductionPolicy } from "./policyAudit.mjs";
import { summarizeMerchantDirectory, validateMerchantDirectorySignatures } from "./merchantDirectory.mjs";
import { reviewAllowanceRegistry } from "./contractReview.mjs";
import { buildPilotEvidenceReport } from "./pilotEvidence.mjs";
import { productionFixturePolicy } from "./productionFixture.mjs";
import { productionRuntimeReadiness } from "./runtimeConfig.mjs";
import { buildInterviewEvidenceReport } from "./interviewEvidence.mjs";
import { buildTokenGovernanceReport } from "./tokenGovernance.mjs";
import { buildPilotIntegrationStateReport } from "./pilotIntegrationState.mjs";
import { buildXPostStateReport } from "./xPostState.mjs";
import { buildSitePublicationCheck } from "./sitePublicationCheck.mjs";
import { buildSecretExposureResponseReport } from "./secretExposureResponse.mjs";
import { buildDemoIntegrationPacket } from "./demoIntegrationPacket.mjs";
import { buildBuilderQuickstartReport } from "./builderQuickstart.mjs";

export async function buildReadinessAudit(root, env = {}) {
  const [
    packageJson,
    backlog,
    baseMetrics,
    launchPosts,
    prospects,
    contactCandidates,
    interviews,
    merchantDirectory,
    xPostExecutionRecords,
    pilotTrafficExecutionRecords,
    tokenGovernanceManifest,
    secretExposureIncident,
    demoIntegrationPacketTemplate,
    builderQuickstartTemplate
  ] = await Promise.all([
    readJson(join(root, "package.json")),
    readJson(join(root, "ops/backlog.json")),
    readJson(join(root, "ops/metrics.json")),
    readJson(join(root, "launch/x_posts.json")),
    readJson(join(root, "ops/prospects.json")),
    readJson(join(root, "ops/contact_candidates.json")),
    readJson(join(root, "ops/interviews.json")),
    readJson(join(root, "ops/merchant_directory.json")),
    readJson(join(root, "ops/x_post_execution_records.json")),
    readJson(join(root, "ops/pilot_traffic_execution_records.json")),
    readJson(join(root, "ops/token_governance.json")),
    readJson(join(root, "ops/secret_exposure_incident.template.json")),
    readJson(join(root, "ops/demo_integration_packet.template.json")),
    readJson(join(root, "ops/builder_quickstart.template.json"))
  ]);

  const receiptLogPaths = receiptLogPathsFromEnv(env, [join(root, "ops/gateway-receipts.local.jsonl")]);
  const receiptLogs = await loadReceiptRecordsFromPaths(receiptLogPaths);
  const metrics = deriveLaunchMetrics(baseMetrics, receiptLogs.records, {
    loadedPaths: receiptLogs.loadedPaths
  });
  const pilotEvidenceReport = buildPilotEvidenceReport(receiptLogs.records);
  const pilotIntegrationStateReport = await buildPilotIntegrationStateReport(
    {
      prospects,
      merchantDirectory,
      executionRecords: pilotTrafficExecutionRecords,
      receiptRecords: receiptLogs.records
    },
    {
      receiptSourceErrors: receiptLogs.missingPaths.map((path) => `Receipt log missing: ${path}`)
    }
  );
  const interviewEvidenceReport = await buildInterviewEvidenceReport(root, interviews, {
    prospects,
    contactCandidates
  });
  const launchPack = summarizeLaunchPosts(launchPosts);
  const xPostActionPack = buildXPostActionPack(launchPosts);
  const xPostStateReport = await buildXPostStateReport({
    launchPosts,
    executionRecords: xPostExecutionRecords
  });
  const sitePublicationCheck = await buildSitePublicationCheck(root);
  const secretExposureResponse = buildSecretExposureResponseReport(secretExposureIncident);
  const demoIntegrationPacket = buildDemoIntegrationPacket(demoIntegrationPacketTemplate);
  const builderQuickstart = buildBuilderQuickstartReport(builderQuickstartTemplate);
  const directorySummary = summarizeMerchantDirectory(merchantDirectory);
  const directorySignatureValidation = await validateMerchantDirectorySignatures(merchantDirectory);
  const directoryDetails = {
    ...directorySummary,
    signatureValidation: directorySignatureValidation
  };
  const productionRuntimeGuard = {
    safe: productionRuntimeReadiness(
      {
        ALLOW_PRODUCTION: "1",
        ALLOW_REQUIRE_AGENT_SIGNATURE: "1",
        ALLOW_USE_FIXTURE: "1"
      },
      productionFixturePolicy()
    ),
    unsafe: productionRuntimeReadiness(
      {
        ALLOW_PRODUCTION: "1",
        ALLOW_USE_FIXTURE: "1"
      },
      productionFixturePolicy()
    )
  };
  const contractReview = await contractReviewFromRoot(root);
  const policyAudit = await productionPolicyAuditFromEnv(env);
  const tokenGovernance = buildTokenGovernanceReport(tokenGovernanceManifest, metrics);
  const requiredDocs = [
    "docs/LEGAL_AND_ETHICS.md",
    "docs/TOKEN_PATH.md",
    "docs/CONTROLLER_SIGNING_CEREMONY.md",
    "docs/CONTROLLER_SIGNING_ACTION_PACK.md",
    "docs/CONTROLLER_SIGNING_EXECUTION_EVIDENCE.md",
    "docs/THREAT_MODEL.md",
    "docs/INTEGRATION.md",
    "docs/CONTRACT_REVIEW.md",
    "docs/INDEPENDENT_CONTRACT_REVIEW.md",
    "docs/DEPLOYMENT_CHECK_EVIDENCE.md",
    "docs/MERCHANT_PROFILE_SIGNING.md",
    "docs/RATE_LIMITS.md",
    "docs/AGENT_INTENT_SIGNATURES.md",
    "docs/SETTLEMENT_PROOFS.md",
    "docs/REGISTRY_LIFECYCLE_INTENTS.md",
    "docs/REGISTRY_POLICY_INTENTS.md",
    "docs/RECEIPT_REGISTRY_INTENTS.md",
    "docs/REGISTRY_TRANSACTION_EVIDENCE.md",
    "docs/X402_FACILITATOR.md",
    "docs/PILOT_EVIDENCE.md",
    "docs/DISTRIBUTION_CLAIMS.md",
    "docs/DISPUTE_PROCESS.md",
    "docs/LAUNCH_SEQUENCE.md",
    "docs/DEPLOYMENT_READINESS.md",
    "docs/PILOT_AGENT_BINDING.md",
    "docs/PILOT_AUTHORIZATION.md",
    "docs/PILOT_GATEWAY_CONFIG.md",
    "docs/PILOT_TRAFFIC_ACTION_PACK.md",
    "docs/PILOT_TRAFFIC_EXECUTION_EVIDENCE.md",
    "docs/PILOT_INTEGRATION_STATE.md",
    "docs/PILOT_DISCLOSURE.md",
    "docs/MERCHANT_PROMOTION.md",
    "docs/INTERVIEW_CAMPAIGN.md",
    "docs/X_POST_ACTION_PACK.md",
    "docs/X_POST_EXECUTION_EVIDENCE.md",
    "docs/X_POST_STATE.md",
    "docs/OUTREACH_ACTION_PACK.md",
    "docs/OUTREACH_EXECUTION_EVIDENCE.md",
    "docs/OUTREACH_STATE.md",
    "docs/EXTERNAL_ACTION_APPROVAL.md",
    "docs/EXTERNAL_ACTION_QUEUE.md",
    "docs/APPROVAL_RUNBOOK.md",
    "docs/APPROVAL_PREFLIGHT.md",
    "docs/APPROVAL_REQUEST.md",
    "docs/APPROVAL_DECISION.md",
    "docs/APPROVAL_PACKET_PREVIEW.md",
    "docs/LIVE_RESOURCE_HANDOFF.md",
    "docs/SITE_PUBLICATION.md",
    "docs/SECRET_EXPOSURE_RESPONSE.md",
    "docs/CREDENTIAL_ROTATION_ACTION_PACK.md",
    "docs/DEMO_INTEGRATION_PACKET.md",
    "docs/BUILDER_QUICKSTART.md",
    "docs/EXECUTION_EVIDENCE_LEDGER.md",
    "docs/STATE_UPDATE_PREVIEW.md",
    "docs/CANONICAL_UPDATE_SET.md",
    "docs/EVIDENCE_BUNDLES.md",
    "docs/TOKEN_GOVERNANCE.md"
  ];

  const gates = [
    gate("product.package", hasScripts(packageJson, ["test", "start", "gateway", "pilot-kit", "metrics-report"]), {
      pass: "Core package scripts are present",
      fail: "Missing core package scripts"
    }),
    gate("product.gateway", await allFilesExist(root, ["src/gateway.mjs", "src/gatewaySmoke.mjs", "scripts/gateway.mjs", "scripts/gateway-smoke.mjs", "ops/gateway.example.json"]), {
      pass: "Gateway implementation, runner, smoke harness, and config exist",
      fail: "Gateway artifacts are missing"
    }),
    gate("product.demo_integration_packet", demoIntegrationPacket.valid && hasScripts(packageJson, ["demo-integration-packet"]) && (await allFilesExist(root, ["src/demoIntegrationPacket.mjs", "scripts/demo-integration-packet.mjs", "ops/demo_integration_packet.template.json", "docs/DEMO_INTEGRATION_PACKET.md"])), {
      pass: "Copyable API/MCP demo integration packet exists and evaluates against preflight",
      fail: "Demo integration packet tooling is missing or invalid",
      details: demoIntegrationPacket
    }),
    gate("product.builder_quickstart", builderQuickstart.valid && hasScripts(packageJson, ["builder-quickstart"]) && (await allFilesExist(root, ["src/builderQuickstart.mjs", "scripts/builder-quickstart.mjs", "ops/builder_quickstart.template.json", "docs/BUILDER_QUICKSTART.md"])), {
      pass: "Builder quickstart smoke proves allow, deny, and replay behavior locally",
      fail: "Builder quickstart smoke tooling is missing or invalid",
      details: builderQuickstart
    }),
    gate("product.mcp_guard", await allFilesExist(root, ["src/mcpGuard.mjs", "examples/mcp-guard.mjs"]), {
      pass: "MCP tools/call guard and example exist",
      fail: "MCP guard artifacts are missing"
    }),
    gate("product.wallet_hook", await allFilesExist(root, ["src/walletHook.mjs", "examples/wallet-hook.mjs", "examples/viem-wallet-client.mjs"]), {
      pass: "Wallet policy hook and wallet-client examples exist",
      fail: "Wallet hook artifacts are missing"
    }),
    gate("product.pilot", hasScripts(packageJson, ["live-pilot-preflight", "pilot-authorization", "pilot-gateway-config", "pilot-traffic-action-pack", "pilot-traffic-execution-evidence", "pilot-evidence-handoff", "pilot-integration-state"]) && (await allFilesExist(root, ["src/pilotKit.mjs", "src/pilotPacket.mjs", "src/pilotAuthorization.mjs", "src/pilotGatewayConfig.mjs", "src/pilotTrafficActionPack.mjs", "src/pilotTrafficExecutionEvidence.mjs", "src/pilotEvidenceHandoff.mjs", "src/pilotIntegrationState.mjs", "src/livePilotPreflight.mjs", "scripts/pilot-kit.mjs", "scripts/pilot-packet.mjs", "scripts/pilot-authorization.mjs", "scripts/pilot-gateway-config.mjs", "scripts/pilot-traffic-action-pack.mjs", "scripts/pilot-traffic-execution-evidence.mjs", "scripts/pilot-evidence-handoff.mjs", "scripts/pilot-integration-state.mjs", "scripts/live-pilot-preflight.mjs", "scripts/pilot-report.mjs", "ops/pilot_authorization_template.json", "ops/pilot_gateway_payment_requirements_template.json", "ops/pilot_traffic_execution_template.json", "ops/pilot_traffic_execution_records.json", "docs/PILOT_AUTHORIZATION.md", "docs/PILOT_GATEWAY_CONFIG.md", "docs/PILOT_TRAFFIC_ACTION_PACK.md", "docs/PILOT_TRAFFIC_EXECUTION_EVIDENCE.md", "docs/PILOT_EVIDENCE_HANDOFF.md", "docs/PILOT_INTEGRATION_STATE.md"])), {
      pass: "Pilot kit, packet, authorization, gateway config, traffic action pack, traffic execution evidence, evidence handoff, integration state, live preflight, and pilot report tooling exist",
      fail: "Pilot tooling is missing"
    }),
    gate("distribution.pilot_disclosure_tooling", hasScripts(packageJson, ["pilot-disclosure"]) && (await allFilesExist(root, ["src/pilotDisclosure.mjs", "scripts/pilot-disclosure.mjs", "ops/pilot_disclosure_template.json", "docs/PILOT_DISCLOSURE.md"])), {
      pass: "Merchant-approved pilot disclosure tooling exists",
      fail: "Pilot disclosure tooling is missing"
    }),
    gate("distribution.merchant_promotion_tooling", hasScripts(packageJson, ["merchant-promotion"]) && (await allFilesExist(root, ["src/merchantPromotion.mjs", "scripts/merchant-promotion.mjs", "ops/merchant_promotion_template.json", "docs/MERCHANT_PROMOTION.md"])), {
      pass: "Live merchant promotion gate exists",
      fail: "Live merchant promotion gate is missing"
    }),
    gate("operations.dispute_process", await allFilesExist(root, ["src/disputeProcess.mjs", "scripts/validate-dispute.mjs", "ops/dispute_template.json", "docs/DISPUTE_PROCESS.md"]), {
      pass: "Receipt-bound dispute process and validator exist",
      fail: "Dispute process artifacts are missing"
    }),
    gate("distribution.launch_pack", launchPack.valid && launchPack.readyDrafts >= 3, {
      pass: "Launch pack has three valid draft-only posts",
      fail: "Launch pack is invalid or too thin",
      details: launchPack.posts
    }),
    gate("distribution.x_post_action_pack", xPostActionPack.valid && hasScripts(packageJson, ["x-post-action-pack", "launch-post-action-pack"]) && (await allFilesExist(root, ["src/xPostActionPack.mjs", "scripts/x-post-action-pack.mjs", "docs/X_POST_ACTION_PACK.md"])), {
      pass: "Draft X post external-action packet generator exists",
      fail: "Draft X post external-action packet generator is missing or invalid",
      details: xPostActionPack
    }),
    gate("distribution.x_post_execution_evidence", hasScripts(packageJson, ["x-post-execution-evidence"]) && (await allFilesExist(root, ["src/xPostExecutionEvidence.mjs", "scripts/x-post-execution-evidence.mjs", "ops/x_post_execution_template.json", "docs/X_POST_EXECUTION_EVIDENCE.md"])), {
      pass: "Human-posted X execution evidence validator exists",
      fail: "X post execution evidence validator is missing"
    }),
    gate("distribution.x_post_state", xPostStateReport.valid && hasScripts(packageJson, ["x-post-state"]) && (await allFilesExist(root, ["src/xPostState.mjs", "scripts/x-post-state.mjs", "ops/x_post_execution_records.json", "docs/X_POST_STATE.md"])), {
      pass: "X post state reconciler passes and no post claim is ahead of evidence",
      fail: "X post state reconciler is missing or launch post state is ahead of validated evidence",
      details: xPostStateReport
    }),
    gate("distribution.merchant_directory", directorySummary.valid && directorySignatureValidation.valid && directorySummary.merchantCount >= 3 && directorySummary.readyMerchantCount >= 1, {
      pass: "Merchant directory is valid and has a pilot-ready listing",
      fail: "Merchant directory is missing, invalid, has bad live signatures, or has no pilot-ready listing",
      details: directoryDetails
    }),
    gate("growth.prospects", prospects.length >= 5 && contactCandidates.length >= 3, {
      pass: "Initial prospect and contact pipeline is populated",
      fail: "Prospect or contact pipeline is underbuilt"
    }),
    gate("growth.interview_packets", hasScripts(packageJson, ["interview-packet", "interview-report"]) && (await allFilesExist(root, ["src/interviewPacket.mjs", "src/interviewEvidence.mjs", "scripts/interview-packet.mjs", "scripts/interview-report.mjs", "ops/interview_script.json", "ops/interviews_template.json"])), {
      pass: "Review-only merchant interview packet tooling exists",
      fail: "Merchant interview packet tooling is missing"
    }),
    gate("growth.interview_campaign", hasScripts(packageJson, ["interview-campaign"]) && (await allFilesExist(root, ["src/interviewCampaign.mjs", "scripts/interview-campaign.mjs", "docs/INTERVIEW_CAMPAIGN.md"])), {
      pass: "Review-only interview campaign planner exists",
      fail: "Interview campaign planner is missing"
    }),
    gate("growth.interview_workspace", hasScripts(packageJson, ["interview-workspace"]) && (await allFilesExist(root, ["src/interviewWorkspace.mjs", "scripts/interview-workspace.mjs", "docs/INTERVIEW_CAMPAIGN.md"])), {
      pass: "Local interview workspace prepares review-only interview evidence templates",
      fail: "Interview workspace tooling is missing"
    }),
    gate("growth.interview_workspace_audit", hasScripts(packageJson, ["interview-workspace-audit"]) && (await allFilesExist(root, ["src/interviewWorkspaceAudit.mjs", "scripts/interview-workspace-audit.mjs", "docs/INTERVIEW_CAMPAIGN.md"])), {
      pass: "Interview workspace audit verifies prep files remain local and incomplete",
      fail: "Interview workspace audit tooling is missing"
    }),
    gate("growth.interview_review_brief", hasScripts(packageJson, ["interview-review-brief"]) && (await allFilesExist(root, ["src/interviewReviewBrief.mjs", "scripts/interview-review-brief.mjs", "docs/INTERVIEW_CAMPAIGN.md"])), {
      pass: "Interview review brief summarizes audited prep files for human approval",
      fail: "Interview review brief tooling is missing"
    }),
    gate("growth.interview_completion_handoff", hasScripts(packageJson, ["interview-completion-handoff"]) && (await allFilesExist(root, ["src/interviewCompletionHandoff.mjs", "scripts/interview-completion-handoff.mjs", "docs/INTERVIEW_COMPLETION_HANDOFF.md"])), {
      pass: "Interview completion handoff maps audited prep to the evidence required for five valid interviews",
      fail: "Interview completion handoff tooling is missing"
    }),
    gate("distribution.outreach_approval", await allFilesExist(root, ["src/outreachApproval.mjs", "scripts/outreach-approval.mjs"]), {
      pass: "Outbound outreach approval validator exists",
      fail: "Outbound outreach approval validator is missing"
    }),
    gate("distribution.outreach_action_pack", hasScripts(packageJson, ["outreach-action-pack"]) && (await allFilesExist(root, ["src/outreachActionPack.mjs", "scripts/outreach-action-pack.mjs", "docs/OUTREACH_ACTION_PACK.md"])), {
      pass: "Outbound outreach external-action packet generator exists",
      fail: "Outbound outreach external-action packet generator is missing"
    }),
    gate("distribution.outreach_execution_evidence", hasScripts(packageJson, ["outreach-execution-evidence"]) && (await allFilesExist(root, ["src/outreachExecutionEvidence.mjs", "scripts/outreach-execution-evidence.mjs", "ops/outreach_execution_template.json", "docs/OUTREACH_EXECUTION_EVIDENCE.md"])), {
      pass: "Human-sent outreach execution evidence validator exists",
      fail: "Outreach execution evidence validator is missing"
    }),
    gate("distribution.outreach_state", hasScripts(packageJson, ["outreach-state"]) && (await allFilesExist(root, ["src/outreachState.mjs", "scripts/outreach-state.mjs", "ops/outreach_execution_records.json", "docs/OUTREACH_STATE.md"])), {
      pass: "Outreach evidence-to-prospect-state reconciler exists",
      fail: "Outreach state reconciler is missing"
    }),
    gate("operations.pilot_integration_state", pilotIntegrationStateReport.valid, {
      pass: "Pilot integration and live merchant states are backed by execution evidence",
      fail: "Pilot integration or live merchant state is ahead of validated evidence",
      details: pilotIntegrationStateReport
    }),
    gate("operations.external_action_approval", hasScripts(packageJson, ["external-action-approval"]) && (await allFilesExist(root, ["src/externalActionApproval.mjs", "scripts/external-action-approval.mjs", "ops/external_action_template.json", "docs/EXTERNAL_ACTION_APPROVAL.md"])), {
      pass: "External action approval packet tooling exists",
      fail: "External action approval packet tooling is missing"
    }),
    gate("operations.external_action_queue", hasScripts(packageJson, ["external-action-queue"]) && (await allFilesExist(root, ["src/externalActionQueue.mjs", "scripts/external-action-queue.mjs", "docs/EXTERNAL_ACTION_QUEUE.md"])), {
      pass: "External action queue summarizes pending human-approved actions",
      fail: "External action queue tooling is missing"
    }),
    gate("operations.external_action_workspace", hasScripts(packageJson, ["external-action-workspace"]) && (await allFilesExist(root, ["src/externalActionWorkspace.mjs", "scripts/external-action-workspace.mjs", "docs/EXTERNAL_ACTION_WORKSPACE.md"])), {
      pass: "External action workspace writes local draft review files",
      fail: "External action workspace tooling is missing"
    }),
    gate("operations.external_action_workspace_audit", hasScripts(packageJson, ["external-action-workspace-audit"]) && (await allFilesExist(root, ["src/externalActionWorkspaceAudit.mjs", "scripts/external-action-workspace-audit.mjs", "docs/EXTERNAL_ACTION_WORKSPACE.md"])), {
      pass: "External action workspace audit verifies draft review files",
      fail: "External action workspace audit tooling is missing"
    }),
    gate("operations.external_action_review_brief", hasScripts(packageJson, ["external-action-review-brief"]) && (await allFilesExist(root, ["src/externalActionReviewBrief.mjs", "scripts/external-action-review-brief.mjs", "docs/EXTERNAL_ACTION_WORKSPACE.md"])), {
      pass: "External action review brief summarizes audited draft packets",
      fail: "External action review brief tooling is missing"
    }),
    gate("operations.evidence_bundle", hasScripts(packageJson, ["evidence-bundle"]) && (await allFilesExist(root, ["src/evidenceBundle.mjs", "scripts/evidence-bundle.mjs", "ops/evidence_bundle_template.json", "docs/EVIDENCE_BUNDLES.md"])), {
      pass: "Evidence bundle hash manifest tooling exists",
      fail: "Evidence bundle hash manifest tooling is missing"
    }),
    gate("operations.launch_sequence", hasScripts(packageJson, ["launch-sequence"]) && (await allFilesExist(root, ["src/launchSequencer.mjs", "scripts/launch-sequence.mjs", "docs/LAUNCH_SEQUENCE.md"])), {
      pass: "Launch critical-path sequencer exists",
      fail: "Launch critical-path sequencer is missing"
    }),
    gate("operations.launch_handoff_brief", hasScripts(packageJson, ["launch-handoff-brief"]) && (await allFilesExist(root, ["src/launchHandoffBrief.mjs", "scripts/launch-handoff-brief.mjs", "docs/LAUNCH_SEQUENCE.md"])), {
      pass: "Launch handoff brief summarizes current human action and evidence blockers",
      fail: "Launch handoff brief tooling is missing"
    }),
    gate("operations.approval_runbook", hasScripts(packageJson, ["approval-runbook"]) && (await allFilesExist(root, ["src/approvalRunbook.mjs", "scripts/approval-runbook.mjs", "docs/APPROVAL_RUNBOOK.md"])), {
      pass: "Approval runbook turns audited draft packets into safe human execution checklists",
      fail: "Approval runbook tooling is missing"
    }),
    gate("operations.approval_preflight", hasScripts(packageJson, ["approval-preflight"]) && (await allFilesExist(root, ["src/approvalPreflight.mjs", "scripts/approval-preflight.mjs", "docs/APPROVAL_PREFLIGHT.md"])), {
      pass: "Approval preflight verifies the current external-action packet, runbook, and post-evidence path before action-time approval",
      fail: "Approval preflight tooling is missing"
    }),
    gate("operations.approval_request", hasScripts(packageJson, ["approval-request"]) && (await allFilesExist(root, ["src/actionTimeApprovalRequest.mjs", "scripts/approval-request.mjs", "docs/APPROVAL_REQUEST.md"])), {
      pass: "Action-time approval request packages the exact current draft for human decision without approving it",
      fail: "Action-time approval request tooling is missing"
    }),
    gate("operations.approval_decision_template", hasScripts(packageJson, ["approval-decision-template"]) && (await allFilesExist(root, ["src/actionTimeApprovalDecision.mjs", "scripts/approval-decision-template.mjs", "docs/APPROVAL_DECISION.md"])), {
      pass: "Packet-hash-bound approval decision template exists for action-time yes/no decisions",
      fail: "Approval decision template tooling is missing"
    }),
    gate("operations.approval_decision_validator", hasScripts(packageJson, ["approval-decision"]) && (await allFilesExist(root, ["src/actionTimeApprovalDecision.mjs", "scripts/approval-decision.mjs", "docs/APPROVAL_DECISION.md"])), {
      pass: "Approval decision validator checks pending, approved, and rejected decisions against the current draft packet hash",
      fail: "Approval decision validator tooling is missing"
    }),
    gate("operations.approval_packet_preview", hasScripts(packageJson, ["approval-packet-preview"]) && (await allFilesExist(root, ["src/approvalPacketPreview.mjs", "scripts/approval-packet-preview.mjs", "docs/APPROVAL_PACKET_PREVIEW.md"])), {
      pass: "Approved packet preview tooling derives a separate approved packet copy from a validated approved decision",
      fail: "Approved packet preview tooling is missing"
    }),
    gate("operations.live_resource_handoff", hasScripts(packageJson, ["live-resource-handoff"]) && (await allFilesExist(root, ["src/liveResourceHandoff.mjs", "scripts/live-resource-handoff.mjs", "ops/live_resource_handoff.template.json", "docs/LIVE_RESOURCE_HANDOFF.md"])), {
      pass: "Live resource handoff tooling verifies wallet, X, and website readiness without storing secrets",
      fail: "Live resource handoff tooling is missing"
    }),
    gate("distribution.site_publication_check", sitePublicationCheck.valid && hasScripts(packageJson, ["site-publication-check"]) && (await allFilesExist(root, ["src/sitePublicationCheck.mjs", "scripts/site-publication-check.mjs", "docs/SITE_PUBLICATION.md"])), {
      pass: "Public site publication check passes with required disclosures and no unsafe claims",
      fail: "Public site publication check is missing or failed",
      details: sitePublicationCheck
    }),
    gate("security.secret_exposure_response_tooling", hasScripts(packageJson, ["secret-exposure-response"]) && (await allFilesExist(root, ["src/secretExposureResponse.mjs", "scripts/secret-exposure-response.mjs", "ops/secret_exposure_incident.template.json", "docs/SECRET_EXPOSURE_RESPONSE.md"])), {
      pass: "Secret exposure response tooling and redacted incident template exist",
      fail: "Secret exposure response tooling is missing"
    }),
    gate("security.credential_rotation_action_pack", hasScripts(packageJson, ["credential-rotation-action-pack"]) && (await allFilesExist(root, ["src/credentialRotationActionPack.mjs", "scripts/credential-rotation-action-pack.mjs", "docs/CREDENTIAL_ROTATION_ACTION_PACK.md"])), {
      pass: "Owner-only credential rotation action pack tooling exists",
      fail: "Credential rotation action pack tooling is missing"
    }),
    gate("security.credential_rotation_handoff", hasScripts(packageJson, ["credential-rotation-handoff"]) && (await allFilesExist(root, ["src/credentialRotationHandoff.mjs", "scripts/credential-rotation-handoff.mjs", "docs/CREDENTIAL_ROTATION_HANDOFF.md"])), {
      pass: "Credential rotation handoff packages owner-only actions, redacted proof updates, and post-rotation checks",
      fail: "Credential rotation handoff tooling is missing"
    }),
    gate("security.secret_exposure_response", secretExposureResponse.valid, {
      pass: "No unresolved leaked credential incident is blocking live actions",
      warn: "Leaked wallet/API credentials require owner rotation before live actions",
      severity: "action_required",
      details: secretExposureResponse
    }),
    gate("operations.execution_evidence_ledger_entry", hasScripts(packageJson, ["execution-evidence-ledger-entry"]) && (await allFilesExist(root, ["src/executionEvidenceLedgerEntry.mjs", "scripts/execution-evidence-ledger-entry.mjs", "docs/EXECUTION_EVIDENCE_LEDGER.md"])), {
      pass: "Execution evidence ledger-entry preview exists for validated X posts and outreach",
      fail: "Execution evidence ledger-entry tooling is missing"
    }),
    gate("operations.state_update_preview", hasScripts(packageJson, ["state-update-preview"]) && (await allFilesExist(root, ["src/stateUpdatePreview.mjs", "scripts/state-update-preview.mjs", "docs/STATE_UPDATE_PREVIEW.md"])), {
      pass: "State update preview exists for evidence-backed X and outreach state changes",
      fail: "State update preview tooling is missing"
    }),
    gate("operations.canonical_update_set", hasScripts(packageJson, ["canonical-update-set"]) && (await allFilesExist(root, ["src/canonicalUpdateSet.mjs", "scripts/canonical-update-set.mjs", "docs/CANONICAL_UPDATE_SET.md"])), {
      pass: "Canonical update set exists for reviewed ledger and state JSON changes",
      fail: "Canonical update set tooling is missing"
    }),
    gate("growth.interviews", interviewEvidenceReport.valid, {
      pass: "Five merchant interviews are complete and linked to valid intakes",
      warn: "Five valid merchant interviews are not complete yet",
      severity: "action_required",
      details: interviewEvidenceReport
    }),
    gate("pilot.evidence", pilotEvidenceReport.valid, {
      pass: "At least one merchant has allowed and denied receipt evidence",
      warn: "No full pilot evidence from receipt logs yet",
      severity: "action_required",
      details: {
        metrics: metrics.pilotEvidence,
        report: pilotEvidenceReport
      }
    }),
    gate("security.production_policy", Boolean(policyAudit?.valid), {
      pass: "Production policy signature verifies",
      warn: policyAudit
        ? "Production policy is configured but failed verification"
        : "No production signed policy configured",
      severity: policyAudit ? "fail" : "action_required",
      details: policyAudit || {
        requiredEnv: ["ALLOW_POLICY_PATH", "ALLOW_POLICY_JSON"]
      }
    }),
    gate("security.signing_ceremony", hasScripts(packageJson, ["policy-signing-packet", "ceremony-audit"]) && (await allFilesExist(root, ["src/signingCeremony.mjs", "src/policySigningPacket.mjs", "scripts/policy-signing-packet.mjs", "scripts/ceremony-audit.mjs", "docs/CONTROLLER_SIGNING_CEREMONY.md"])), {
      pass: "Controller signing ceremony audit tooling exists",
      fail: "Controller signing ceremony audit tooling is missing"
    }),
    gate("security.controller_signing_action_pack", hasScripts(packageJson, ["controller-signing-action-pack"]) && (await allFilesExist(root, ["src/controllerSigningActionPack.mjs", "scripts/controller-signing-action-pack.mjs", "docs/CONTROLLER_SIGNING_ACTION_PACK.md"])), {
      pass: "Controller signing external-action packet tooling exists",
      fail: "Controller signing action pack tooling is missing"
    }),
    gate("security.controller_signing_execution_evidence", hasScripts(packageJson, ["controller-signing-execution-evidence"]) && (await allFilesExist(root, ["src/controllerSigningExecutionEvidence.mjs", "scripts/controller-signing-execution-evidence.mjs", "ops/controller_signing_execution_template.json", "docs/CONTROLLER_SIGNING_EXECUTION_EVIDENCE.md"])), {
      pass: "Controller signing post-execution evidence tooling exists",
      fail: "Controller signing post-execution evidence tooling is missing"
    }),
    gate("security.production_policy_handoff", hasScripts(packageJson, ["production-policy-handoff"]) && (await allFilesExist(root, ["src/productionPolicyHandoff.mjs", "scripts/production-policy-handoff.mjs", "docs/PRODUCTION_POLICY_HANDOFF.md"])), {
      pass: "Production policy handoff packages signing approval, evidence, and runtime follow-up commands",
      fail: "Production policy handoff tooling is missing"
    }),
    gate("security.contract_review", Boolean(contractReview?.valid), {
      pass: "AllowanceRegistry automated pre-deploy review passes",
      fail: "AllowanceRegistry automated pre-deploy review failed",
      details: contractReview
    }),
    gate("security.independent_contract_review_evidence", hasScripts(packageJson, ["independent-contract-review"]) && (await allFilesExist(root, ["src/independentContractReview.mjs", "scripts/independent-contract-review.mjs", "ops/independent_contract_review_template.json", "docs/INDEPENDENT_CONTRACT_REVIEW.md"])), {
      pass: "Independent contract review evidence validator exists",
      fail: "Independent contract review evidence tooling is missing"
    }),
    gate("security.deployment_check_evidence", hasScripts(packageJson, ["deployment-check-evidence"]) && (await allFilesExist(root, ["src/deploymentCheckEvidence.mjs", "scripts/deployment-check-evidence.mjs", "ops/deployment_check_evidence_template.json", "docs/DEPLOYMENT_CHECK_EVIDENCE.md"])), {
      pass: "Deployment compiler/static-analysis evidence validator exists",
      fail: "Deployment check evidence tooling is missing"
    }),
    gate("security.deployment_manifest", await allFilesExist(root, ["src/deploymentReadiness.mjs", "scripts/validate-deployment.mjs", "ops/deployment_manifest.template.json", "docs/DEPLOYMENT_READINESS.md"]), {
      pass: "Deployment manifest gate and template exist",
      fail: "Deployment manifest gate is missing"
    }),
    gate("security.merchant_profile_signing", await allFilesExist(root, ["src/merchantProfileSigner.mjs", "scripts/sign-merchant-profile.mjs", "scripts/verify-merchant-profile.mjs"]), {
      pass: "Merchant profile signing and verification tooling exists",
      fail: "Merchant profile signing tooling is missing"
    }),
    gate("security.rate_limits", await allFilesExist(root, ["src/rateLimit.mjs", "docs/RATE_LIMITS.md"]), {
      pass: "Rate limit control exists for paid routes and gateways",
      fail: "Rate limit control is missing"
    }),
    gate("security.agent_intent_signing", await allFilesExist(root, ["src/agentIntentSigner.mjs", "scripts/sign-agent-intent.mjs", "scripts/verify-agent-intent.mjs"]), {
      pass: "Agent intent signing and verification tooling exists",
      fail: "Agent intent signing tooling is missing"
    }),
    gate("security.pilot_agent_binding", await allFilesExist(root, ["src/pilotBinding.mjs", "scripts/validate-pilot-binding.mjs", "ops/pilot_binding.template.json", "docs/PILOT_AGENT_BINDING.md"]), {
      pass: "Pilot agent wallet binding validator and template exist",
      fail: "Pilot agent wallet binding validator is missing"
    }),
    gate("security.production_runtime_guard", productionRuntimeGuard.safe.valid && !productionRuntimeGuard.unsafe.valid, {
      pass: "Production runtime guard enforces signed agent intents",
      fail: "Production runtime guard does not fail closed for unsigned agent intents",
      details: productionRuntimeGuard
    }),
    gate("security.settlement_proofs", await allFilesExist(root, ["src/settlementProof.mjs", "docs/SETTLEMENT_PROOFS.md"]), {
      pass: "Settlement proof boundary exists for paid delivery",
      fail: "Settlement proof boundary is missing"
    }),
    gate("security.registry_lifecycle_intents", hasScripts(packageJson, ["registry-lifecycle-intent"]) && (await allFilesExist(root, ["src/registryLifecycleIntent.mjs", "scripts/registry-lifecycle-intent.mjs", "ops/registry_lifecycle_intent_template.json", "docs/REGISTRY_LIFECYCLE_INTENTS.md"])), {
      pass: "Dry-run registry lifecycle update-intent tooling exists",
      fail: "Registry lifecycle update-intent tooling is missing"
    }),
    gate("security.registry_policy_intents", hasScripts(packageJson, ["registry-policy-intent"]) && (await allFilesExist(root, ["src/registryPolicyIntent.mjs", "scripts/registry-policy-intent.mjs", "ops/registry_policy_intent_template.json", "docs/REGISTRY_POLICY_INTENTS.md"])), {
      pass: "Dry-run registry policy create-intent tooling exists",
      fail: "Registry policy create-intent tooling is missing"
    }),
    gate("security.receipt_registry_intents", hasScripts(packageJson, ["receipt-registry-intent"]) && (await allFilesExist(root, ["src/receiptRegistryIntent.mjs", "scripts/receipt-registry-intent.mjs", "ops/receipt_registry_intent_template.json", "docs/RECEIPT_REGISTRY_INTENTS.md"])), {
      pass: "Dry-run receipt registry write-intent tooling exists",
      fail: "Receipt registry write-intent tooling is missing"
    }),
    gate("security.registry_transaction_evidence", hasScripts(packageJson, ["registry-transaction-evidence"]) && (await allFilesExist(root, ["src/registryTransactionEvidence.mjs", "scripts/registry-transaction-evidence.mjs", "ops/registry_transaction_evidence_template.json", "docs/REGISTRY_TRANSACTION_EVIDENCE.md"])), {
      pass: "Registry transaction evidence validator exists",
      fail: "Registry transaction evidence validator is missing"
    }),
    gate("security.x402_facilitator", await allFilesExist(root, ["src/x402Facilitator.mjs", "src/x402Smoke.mjs", "scripts/x402-smoke.mjs", "docs/X402_FACILITATOR.md", "ops/gateway.x402.example.json"]), {
      pass: "x402 facilitator adapter, smoke harness, docs, and gateway template exist",
      fail: "x402 facilitator adapter is missing"
    }),
    gate("legal.docs", await allFilesExist(root, requiredDocs), {
      pass: "Legal, token, signing, threat, and integration docs exist",
      fail: "Required legal/security docs are missing"
    }),
    gate("token.governance_tooling", hasScripts(packageJson, ["token-governance"]) && (await allFilesExist(root, ["src/tokenGovernance.mjs", "scripts/token-governance.mjs", "ops/token_governance.json", "docs/TOKEN_GOVERNANCE.md"])), {
      pass: "Token governance lock tooling exists",
      fail: "Token governance lock tooling is missing"
    }),
    gate("token.gate", tokenGovernance.readyForLegalReview, {
      pass: "Token usage gate has enough evidence to begin legal review",
      warn: tokenGovernance.valid
        ? "Token remains locked by missing usage; do not launch token"
        : "Token governance manifest is invalid; do not launch token",
      severity: "action_required",
      details: {
        ...tokenGovernance
      }
    })
  ];

  return {
    generatedAt: new Date().toISOString(),
    status: readinessStatus(gates),
    metrics,
    metricsSource: {
      receiptLogs: {
        loaded: receiptLogs.loadedPaths,
        missing: receiptLogs.missingPaths
      }
    },
    gates,
    nextActions: nextActionsFromGates(gates, backlog)
  };
}

export function readinessStatus(gates = []) {
  if (gates.some((item) => item.status === "fail")) return "not_ready";
  if (gates.some((item) => item.status === "action_required")) return "needs_external_action";
  return "ready_for_next_launch_step";
}

function gate(id, condition, options) {
  if (condition) {
    return {
      id,
      status: "pass",
      message: options.pass,
      details: options.details || null
    };
  }

  const status = options.severity || "fail";
  return {
    id,
    status,
    message: options.warn || options.fail,
    details: options.details || null
  };
}

function nextActionsFromGates(gates, backlog) {
  const openGateActions = gates
    .filter((item) => item.status !== "pass")
    .map((item) => actionForGate(item.id, item.message));
  const backlogActions = backlog
    .filter((item) => item.status === "next")
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 5)
    .map((item) => item.task);

  return [...new Set([...openGateActions, ...backlogActions])].slice(0, 8);
}

function actionForGate(id, fallback) {
  const actions = {
    "growth.interviews": "Run five merchant interviews, link valid intakes, and pass npm run interview-report",
    "pilot.evidence": "Run a merchant-approved gateway pilot and load its receipt log",
    "security.production_policy": "Run the real controller signing ceremony and set ALLOW_POLICY_PATH",
    "security.secret_exposure_response": "Move funds from the exposed wallet to a fresh wallet, revoke the exposed X token, and record redacted proof",
    "token.gate": "Keep token disabled until organic usage clears the documented gate"
  };
  return actions[id] || fallback;
}

async function productionPolicyAuditFromEnv(env) {
  const policy = await policyFromAuditEnv(env);
  if (!policy) return null;
  return verifyProductionPolicy(policy);
}

async function contractReviewFromRoot(root) {
  try {
    return reviewAllowanceRegistry(join(root, "contracts/AllowanceRegistry.sol"));
  } catch (error) {
    return {
      valid: false,
      error: error.message
    };
  }
}

async function policyFromAuditEnv(env) {
  if (env.ALLOW_POLICY_JSON) return JSON.parse(env.ALLOW_POLICY_JSON);
  if (env.ALLOW_POLICY_PATH) return readJson(env.ALLOW_POLICY_PATH);
  return null;
}

async function allFilesExist(root, paths) {
  const results = await Promise.all(
    paths.map(async (path) => {
      try {
        await access(join(root, path));
        return true;
      } catch {
        return false;
      }
    })
  );
  return results.every(Boolean);
}

function hasScripts(packageJson, scripts) {
  return scripts.every((script) => typeof packageJson.scripts?.[script] === "string");
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}
