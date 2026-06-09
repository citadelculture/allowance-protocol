import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  buildActionTimeApprovalRequest,
  publicActionTimeApprovalRequestReport
} from "../src/actionTimeApprovalRequest.mjs";
import {
  buildActionTimeApprovalDecisionTemplate,
  publicActionTimeApprovalDecisionReport,
  publicActionTimeApprovalDecisionTemplateReport,
  validateActionTimeApprovalDecision
} from "../src/actionTimeApprovalDecision.mjs";
import {
  buildApprovalPacketPreview,
  publicApprovalPacketPreviewReport
} from "../src/approvalPacketPreview.mjs";
import {
  buildLiveResourceHandoffReport,
  publicLiveResourceHandoffReport
} from "../src/liveResourceHandoff.mjs";
import { buildSitePublicationCheck } from "../src/sitePublicationCheck.mjs";
import {
  buildSecretExposureResponseReport,
  publicSecretExposureResponseReport
} from "../src/secretExposureResponse.mjs";
import {
  buildCredentialRotationActionPack,
  publicCredentialRotationActionPack
} from "../src/credentialRotationActionPack.mjs";
import {
  buildDemoIntegrationPacket,
  publicDemoIntegrationPacket
} from "../src/demoIntegrationPacket.mjs";
import {
  buildBuilderQuickstartReport,
  publicBuilderQuickstartReport
} from "../src/builderQuickstart.mjs";
import { summarizePipeline } from "../src/growthPipeline.mjs";
import { buildOutreachDrafts } from "../src/outreachDrafts.mjs";
import { buildOutreachApprovalReport } from "../src/outreachApproval.mjs";
import { buildXPostActionPack } from "../src/xPostActionPack.mjs";
import { buildXPostExecutionEvidenceReport } from "../src/xPostExecutionEvidence.mjs";
import { buildXPostStateReport } from "../src/xPostState.mjs";
import { buildOutreachActionPack } from "../src/outreachActionPack.mjs";
import { buildOutreachExecutionEvidenceReport } from "../src/outreachExecutionEvidence.mjs";
import { buildOutreachStateReport } from "../src/outreachState.mjs";
import { buildInterviewCampaignPlan } from "../src/interviewCampaign.mjs";
import { buildMerchantInterviewPackets } from "../src/interviewPacket.mjs";
import { buildInterviewEvidenceReport } from "../src/interviewEvidence.mjs";
import {
  buildInterviewWorkspaceReport,
  publicInterviewWorkspaceReport
} from "../src/interviewWorkspace.mjs";
import { buildInterviewWorkspaceAuditReport } from "../src/interviewWorkspaceAudit.mjs";
import {
  buildInterviewReviewBrief,
  publicInterviewReviewBriefReport
} from "../src/interviewReviewBrief.mjs";
import { buildPilotAuthorizationReport } from "../src/pilotAuthorization.mjs";
import { buildPilotGatewayConfigReport } from "../src/pilotGatewayConfig.mjs";
import { buildPilotTrafficActionPack, safePilotRuntimeEnv } from "../src/pilotTrafficActionPack.mjs";
import { buildPilotTrafficExecutionEvidenceReport } from "../src/pilotTrafficExecutionEvidence.mjs";
import { buildPilotIntegrationStateReport } from "../src/pilotIntegrationState.mjs";
import { buildControllerSigningActionPack } from "../src/controllerSigningActionPack.mjs";
import { buildControllerSigningExecutionEvidenceReport } from "../src/controllerSigningExecutionEvidence.mjs";
import { buildIndependentContractReviewReport } from "../src/independentContractReview.mjs";
import { buildDeploymentCheckEvidenceReport } from "../src/deploymentCheckEvidence.mjs";
import { validateDeploymentManifest } from "../src/deploymentReadiness.mjs";
import { buildLaunchSequenceReport } from "../src/launchSequencer.mjs";
import {
  buildLaunchHandoffBrief,
  publicLaunchHandoffBriefReport
} from "../src/launchHandoffBrief.mjs";
import {
  buildApprovalRunbook,
  publicApprovalRunbookReport
} from "../src/approvalRunbook.mjs";
import {
  buildApprovalPreflight,
  publicApprovalPreflightReport
} from "../src/approvalPreflight.mjs";
import {
  buildExecutionEvidenceLedgerEntry,
  publicExecutionEvidenceLedgerEntryReport
} from "../src/executionEvidenceLedgerEntry.mjs";
import {
  buildStateUpdatePreview,
  publicStateUpdatePreviewReport
} from "../src/stateUpdatePreview.mjs";
import {
  buildCanonicalUpdateSet,
  publicCanonicalUpdateSetReport
} from "../src/canonicalUpdateSet.mjs";
import { buildExternalActionQueueReport } from "../src/externalActionQueue.mjs";
import {
  buildExternalActionWorkspaceReport,
  publicExternalActionWorkspaceReport
} from "../src/externalActionWorkspace.mjs";
import { buildExternalActionWorkspaceAuditReport } from "../src/externalActionWorkspaceAudit.mjs";
import {
  buildExternalActionReviewBrief,
  publicExternalActionReviewBriefReport
} from "../src/externalActionReviewBrief.mjs";
import { deriveLaunchMetrics, loadReceiptRecordsFromPaths, receiptLogPathsFromEnv } from "../src/metrics.mjs";
import { buildReadinessAudit } from "../src/readiness.mjs";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const metrics = JSON.parse(await readFile(join(root, "ops/metrics.json"), "utf8"));
const backlog = JSON.parse(await readFile(join(root, "ops/backlog.json"), "utf8"));
const outreachTargets = JSON.parse(await readFile(join(root, "ops/outreach_targets.json"), "utf8"));
const launchPosts = JSON.parse(await readFile(join(root, "launch/x_posts.json"), "utf8"));
const interviewScript = JSON.parse(await readFile(join(root, "ops/interview_script.json"), "utf8"));
const prospects = JSON.parse(await readFile(join(root, "ops/prospects.json"), "utf8"));
const interviews = JSON.parse(await readFile(join(root, "ops/interviews.json"), "utf8"));
const contactCandidates = JSON.parse(await readFile(join(root, "ops/contact_candidates.json"), "utf8"));
const merchantDirectory = JSON.parse(await readFile(join(root, "ops/merchant_directory.json"), "utf8"));
const outreachExecutionTemplate = JSON.parse(await readFile(join(root, "ops/outreach_execution_template.json"), "utf8"));
const xPostExecutionTemplate = JSON.parse(await readFile(join(root, "ops/x_post_execution_template.json"), "utf8"));
const xPostExecutionRecords = JSON.parse(await readFile(join(root, "ops/x_post_execution_records.json"), "utf8"));
const outreachExecutionRecords = JSON.parse(await readFile(join(root, "ops/outreach_execution_records.json"), "utf8"));
const pilotTrafficExecutionRecords = JSON.parse(await readFile(join(root, "ops/pilot_traffic_execution_records.json"), "utf8"));
const pilotAuthorizationTemplate = JSON.parse(await readFile(join(root, "ops/pilot_authorization_template.json"), "utf8"));
const pilotGatewayPaymentRequirementsTemplate = JSON.parse(await readFile(join(root, "ops/pilot_gateway_payment_requirements_template.json"), "utf8"));
const pilotBindingTemplate = JSON.parse(await readFile(join(root, "ops/pilot_binding.template.json"), "utf8"));
const gatewayX402Template = JSON.parse(await readFile(join(root, "ops/gateway.x402.example.json"), "utf8"));
const disputeTemplate = JSON.parse(await readFile(join(root, "ops/dispute_template.json"), "utf8"));
const pilotTrafficExecutionTemplate = JSON.parse(await readFile(join(root, "ops/pilot_traffic_execution_template.json"), "utf8"));
const controllerSigningExecutionTemplate = JSON.parse(await readFile(join(root, "ops/controller_signing_execution_template.json"), "utf8"));
const independentContractReviewTemplate = JSON.parse(await readFile(join(root, "ops/independent_contract_review_template.json"), "utf8"));
const deploymentCheckEvidenceTemplate = JSON.parse(await readFile(join(root, "ops/deployment_check_evidence_template.json"), "utf8"));
const deploymentManifestTemplate = JSON.parse(await readFile(join(root, "ops/deployment_manifest.template.json"), "utf8"));
const liveResourceHandoffTemplate = await readJsonSource(join(root, "ops/live_resource_handoff.template.json"), "live resource handoff");
const secretExposureIncident = await readJsonSource(join(root, "ops/secret_exposure_incident.template.json"), "secret exposure incident");
const demoIntegrationPacketTemplate = await readJsonSource(join(root, "ops/demo_integration_packet.template.json"), "demo integration packet");
const builderQuickstartTemplate = await readJsonSource(join(root, "ops/builder_quickstart.template.json"), "builder quickstart");
const policyTemplate = JSON.parse(await readFile(join(root, "allow-policy.example.json"), "utf8"));
const signedPolicy = await readJsonSource(join(root, "ops/signed-policy.local.json"), "policy");
const receiptLogPaths = receiptLogPathsFromEnv(process.env, [join(root, "ops/gateway-receipts.local.jsonl")]);
const receiptLogs = await loadReceiptRecordsFromPaths(receiptLogPaths);
const derivedMetrics = deriveLaunchMetrics(metrics, receiptLogs.records, {
  loadedPaths: receiptLogs.loadedPaths
});
const pipeline = summarizePipeline(prospects, interviews);
const outreachState = await buildOutreachStateReport({
  prospects,
  contactCandidates,
  interviews,
  evidenceRecords: outreachExecutionRecords
});
const evidenceAdjustedPipeline = summarizePipeline(outreachState.projectedProspects, interviews);
const outreachDrafts = buildOutreachDrafts(contactCandidates, prospects);
const outreachApproval = buildOutreachApprovalReport(contactCandidates, prospects, {
  drafts: outreachDrafts
});
const outreachActionPack = buildOutreachActionPack({
  drafts: outreachDrafts
});
const xPostActionPack = buildXPostActionPack(launchPosts, {
  destination: process.env.ALLOW_X_HANDLE || "@allow_protocol"
});
const xPostExecutionEvidence = await buildXPostExecutionEvidenceReport(xPostExecutionTemplate);
const xPostExecutionLedgerEntry = await buildExecutionEvidenceLedgerEntry({
  evidence: xPostExecutionTemplate,
  existingLedger: xPostExecutionRecords
});
const xPostStateUpdatePreview = await buildStateUpdatePreview({
  ledgerEntryReport: xPostExecutionLedgerEntry,
  launchPosts
});
const xPostCanonicalUpdateSet = buildCanonicalUpdateSet({
  ledgerEntryReport: xPostExecutionLedgerEntry,
  stateUpdatePreview: xPostStateUpdatePreview,
  currentLedger: xPostExecutionRecords,
  currentState: launchPosts
});
const xPostState = await buildXPostStateReport({
  launchPosts,
  executionRecords: xPostExecutionRecords
});
const outreachExecutionEvidence = await buildOutreachExecutionEvidenceReport(outreachExecutionTemplate);
const outreachExecutionLedgerEntry = await buildExecutionEvidenceLedgerEntry({
  evidence: outreachExecutionTemplate,
  existingLedger: outreachExecutionRecords
});
const outreachStateUpdatePreview = await buildStateUpdatePreview({
  ledgerEntryReport: outreachExecutionLedgerEntry,
  prospects,
  contactCandidates,
  interviews
});
const outreachCanonicalUpdateSet = buildCanonicalUpdateSet({
  ledgerEntryReport: outreachExecutionLedgerEntry,
  stateUpdatePreview: outreachStateUpdatePreview,
  currentLedger: outreachExecutionRecords,
  currentState: prospects
});
const interviewPackets = buildMerchantInterviewPackets(contactCandidates, prospects, interviewScript, {
  limit: 3
});
const interviewCampaign = buildInterviewCampaignPlan(
  {
    candidates: contactCandidates,
    prospects,
    interviews,
    script: interviewScript
  },
  {
    limit: 5
  }
);
const interviewWorkspace = publicInterviewWorkspaceReport(buildInterviewWorkspaceReport(
  {
    campaign: interviewCampaign
  },
  {
    outputDir: "work/interview-workspace"
  }
));
const interviewWorkspaceAudit = await buildInterviewWorkspaceAuditReport(join(root, "work/interview-workspace"), {
  root
});
const interviewReviewBrief = publicInterviewReviewBriefReport(await buildInterviewReviewBrief(join(root, "work/interview-workspace"), {
  root,
  audit: interviewWorkspaceAudit
}));
const interviewReport = await buildInterviewEvidenceReport(root, interviews, {
  prospects,
  contactCandidates
});
const pilotAuthorization = buildPilotAuthorizationReport(pilotAuthorizationTemplate, {
  interviews
});
const pilotGatewayConfig = buildPilotGatewayConfigReport(
  pilotAuthorizationTemplate,
  {
    interviews
  },
  {
    paymentRequirements: pilotGatewayPaymentRequirementsTemplate
  }
);
const pilotTrafficActionPack = await buildPilotTrafficActionPack({
  preflight: {
    binding: pilotBindingTemplate,
    policy: signedPolicy.value,
    gatewayConfig: gatewayX402Template,
    disputePacket: disputeTemplate
  },
  runtimeEnv: safePilotRuntimeEnv(process.env),
  sourceErrors: signedPolicy.reasons
});
const pilotTrafficExecutionEvidence = await buildPilotTrafficExecutionEvidenceReport(pilotTrafficExecutionTemplate, {
  receiptRecords: receiptLogs.records,
  sourceErrors: receiptLogs.missingPaths.map((path) => `Receipt log missing: ${path}`)
});
const pilotIntegrationState = await buildPilotIntegrationStateReport(
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
const controllerSigningActionPack = buildControllerSigningActionPack(policyTemplate, {
  controller: process.env.ALLOW_EXPECTED_CONTROLLER || ""
});
const controllerSigningExecutionEvidence = await buildControllerSigningExecutionEvidenceReport(controllerSigningExecutionTemplate);
const independentContractReview = await buildIndependentContractReviewReport(independentContractReviewTemplate, {
  root,
  deploymentManifest: deploymentManifestTemplate
});
const deploymentCheckEvidence = await buildDeploymentCheckEvidenceReport(deploymentCheckEvidenceTemplate, {
  root,
  deploymentManifest: deploymentManifestTemplate
});
const readiness = await buildReadinessAudit(root, process.env);
const launchSequence = buildLaunchSequenceReport({
  readiness,
  xPostState,
  outreachState,
  pilotIntegrationState,
  deploymentCheckEvidence,
  independentContractReview,
  deploymentManifest: validateDeploymentManifest(deploymentManifestTemplate)
});
const externalActionPacks = [
  {
    stageId: "public_build_post",
    source: "x_post_action_pack",
    actionType: "x_post",
    title: "X build post",
    sourceCommand: "npm run x-post-action-pack",
    report: xPostActionPack
  },
  {
    stageId: "merchant_outreach",
    source: "outreach_action_pack",
    actionType: "merchant_outreach",
    title: "Merchant outreach",
    sourceCommand: "npm run outreach-action-pack",
    report: outreachActionPack
  },
  {
    stageId: "controller_policy_signature",
    source: "controller_signing_action_pack",
    actionType: "controller_policy_signature",
    title: "Controller policy signature",
    sourceCommand: "npm run controller-signing-action-pack -- <policy.json> <controller>",
    report: controllerSigningActionPack
  },
  {
    stageId: "live_pilot_traffic",
    source: "pilot_traffic_action_pack",
    actionType: "live_pilot",
    title: "Live pilot traffic",
    sourceCommand: "npm run pilot-traffic-action-pack -- <binding.json> <signed-policy.json> <gateway.json> <dispute.json>",
    report: pilotTrafficActionPack
  }
];
const externalActionQueue = buildExternalActionQueueReport({
  readiness,
  launchSequence,
  actionPacks: externalActionPacks
});
const externalActionWorkspace = publicExternalActionWorkspaceReport(buildExternalActionWorkspaceReport({
  queue: externalActionQueue,
  actionPacks: externalActionPacks
}));
const externalActionWorkspaceAudit = await buildExternalActionWorkspaceAuditReport(join(root, "work/external-action-workspace"), {
  root
});
const externalActionReviewBrief = publicExternalActionReviewBriefReport(await buildExternalActionReviewBrief(join(root, "work/external-action-workspace"), {
  root,
  audit: externalActionWorkspaceAudit
}));
const launchHandoffBrief = publicLaunchHandoffBriefReport(buildLaunchHandoffBrief({
  readiness,
  launchSequence,
  externalActionReviewBrief,
  interviewReviewBrief
}));
const approvalRunbook = publicApprovalRunbookReport(buildApprovalRunbook({
  externalActionReviewBrief,
  launchHandoffBrief,
  launchSequence
}));
const approvalPreflight = publicApprovalPreflightReport(buildApprovalPreflight({
  externalActionReviewBrief,
  approvalRunbook,
  launchHandoffBrief,
  launchSequence
}));
const approvalRequestDraftPacket = await readJsonSource(
  approvalPreflight.action?.packetPath
    ? join(root, "work/external-action-workspace", approvalPreflight.action.packetPath)
    : "",
  "approval request draft packet"
);
const approvalRequest = publicActionTimeApprovalRequestReport(buildActionTimeApprovalRequest({
  approvalPreflight,
  draftPacket: approvalRequestDraftPacket.value,
  packetPath: approvalPreflight.action?.packetPath,
  evidenceTemplatePath: approvalPreflight.action?.evidenceTemplatePath
}));
const approvalDecisionTemplateReport = buildActionTimeApprovalDecisionTemplate({
  approvalRequest,
  draftPacket: approvalRequestDraftPacket.value,
  draftPacketSource: approvalRequestDraftPacket.source,
  packetPath: approvalPreflight.action?.packetPath
});
const approvalDecisionTemplate = publicActionTimeApprovalDecisionTemplateReport(approvalDecisionTemplateReport);
const approvalDecisionValidation = publicActionTimeApprovalDecisionReport(validateActionTimeApprovalDecision(
  approvalDecisionTemplateReport.template,
  {
    approvalRequest,
    draftPacket: approvalRequestDraftPacket.value,
    draftPacketSource: approvalRequestDraftPacket.source,
    packetPath: approvalPreflight.action?.packetPath
  }
));
const approvalPacketPreview = publicApprovalPacketPreviewReport(await buildApprovalPacketPreview({
  approvalDecision: approvalDecisionTemplateReport.template,
  approvalRequest,
  draftPacket: approvalRequestDraftPacket.value,
  draftPacketSource: approvalRequestDraftPacket.source,
  packetPath: approvalPreflight.action?.packetPath
}));
const liveResourceHandoff = publicLiveResourceHandoffReport(buildLiveResourceHandoffReport(
  liveResourceHandoffTemplate.value,
  {
    sourceErrors: liveResourceHandoffTemplate.reasons
  }
));
const sitePublicationCheck = await buildSitePublicationCheck(root);
const secretExposureResponse = publicSecretExposureResponseReport(buildSecretExposureResponseReport(
  secretExposureIncident.value,
  {
    sourceErrors: secretExposureIncident.reasons
  }
));
const credentialRotationActionPack = publicCredentialRotationActionPack(buildCredentialRotationActionPack(
  secretExposureIncident.value,
  {
    sourceErrors: secretExposureIncident.reasons
  }
));
const demoIntegrationPacket = publicDemoIntegrationPacket(buildDemoIntegrationPacket(
  demoIntegrationPacketTemplate.value,
  {
    sourceErrors: demoIntegrationPacketTemplate.reasons
  }
));
const builderQuickstart = publicBuilderQuickstartReport(buildBuilderQuickstartReport(
  builderQuickstartTemplate.value,
  {
    sourceErrors: builderQuickstartTemplate.reasons
  }
));

const nextTasks = backlog
  .filter((item) => item.status === "next")
  .sort((a, b) => a.priority - b.priority);

const xPost = [
  "AI agents should not get blank-check wallets.",
  "",
  "Allow Protocol is building the allowance layer for autonomous payments:",
  "- merchant allowlists",
  "- per-tx caps",
  "- daily budgets",
  "- metadata filters",
  "- receipt proofs",
  "",
  "Day 1 shipped: policy engine, dashboard, receipt ledger, and x402-style preflight."
].join("\n");

const publicTesterAsk = [
  "Looking for 5 API or MCP builders who expect AI agents to pay for their service.",
  "",
  "Allow Protocol is a no-custody allowance layer for agent payments:",
  "- merchant allowlists",
  "- spend caps",
  "- metadata filters",
  "- nonce/replay checks",
  "- receipts",
  "",
  "No token pitch. I need blunt middleware feedback."
].join("\n");

const priorityOutreach = outreachTargets
  .filter((target) => target.status === "next")
  .sort((a, b) => a.priority - b.priority)
  .slice(0, 3);

const report = {
  generatedAt: new Date().toISOString(),
  metrics: derivedMetrics,
  readiness: {
    status: readiness.status,
    openGates: readiness.gates.filter((gate) => gate.status !== "pass"),
    nextActions: readiness.nextActions
  },
  launchSequence,
  launchHandoffBrief,
  approvalRunbook,
  approvalPreflight,
  approvalRequest,
  approvalDecisionTemplate,
  approvalDecisionValidation,
  approvalPacketPreview,
  liveResourceHandoff,
  sitePublicationCheck,
  secretExposureResponse,
  credentialRotationActionPack,
  demoIntegrationPacket,
  builderQuickstart,
  externalActionQueue,
  externalActionWorkspace,
  externalActionWorkspaceAudit,
  externalActionReviewBrief,
  metricsSource: {
    base: "ops/metrics.json",
    receiptLogs: {
      loaded: receiptLogs.loadedPaths,
      missing: receiptLogs.missingPaths
    }
  },
  nextTasks,
  xPost,
  distribution: {
    xPostActionPack,
    xPostExecutionEvidence,
    xPostExecutionLedgerEntry: publicExecutionEvidenceLedgerEntryReport(xPostExecutionLedgerEntry),
    xPostStateUpdatePreview: publicStateUpdatePreviewReport(xPostStateUpdatePreview),
    xPostCanonicalUpdateSet: publicCanonicalUpdateSetReport(xPostCanonicalUpdateSet),
    xPostState
  },
  growth: {
    priorityOutreach,
    pipeline,
    evidenceAdjustedPipeline,
    contactCandidates: contactCandidates
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5),
    outreachDrafts,
    outreachApproval,
    outreachActionPack,
    outreachExecutionEvidence,
    outreachExecutionLedgerEntry: publicExecutionEvidenceLedgerEntryReport(outreachExecutionLedgerEntry),
    outreachStateUpdatePreview: publicStateUpdatePreviewReport(outreachStateUpdatePreview),
    outreachCanonicalUpdateSet: publicCanonicalUpdateSetReport(outreachCanonicalUpdateSet),
    outreachState,
    interviewCampaign,
    interviewWorkspace,
    interviewWorkspaceAudit,
    interviewReviewBrief,
    interviewPackets,
    interviewReport,
    pilotAuthorization,
    pilotGatewayConfig,
    pilotTrafficActionPack,
    pilotTrafficExecutionEvidence,
    pilotIntegrationState,
    firstInterviewQuestions: interviewScript.questions.slice(0, 5),
    publicTesterAsk
  },
  security: {
    controllerSigningActionPack,
    controllerSigningExecutionEvidence,
    independentContractReview,
    deploymentCheckEvidence
  }
};

console.log(JSON.stringify(report, null, 2));

async function readJsonSource(path, label) {
  try {
    const source = await readFile(path, "utf8");
    return {
      value: JSON.parse(source),
      source,
      reasons: []
    };
  } catch (error) {
    return {
      value: null,
      source: "",
      reasons: [`Unable to load ${label} JSON from ${path}: ${error.message}`]
    };
  }
}
