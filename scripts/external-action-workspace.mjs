#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildControllerSigningActionPack } from "../src/controllerSigningActionPack.mjs";
import { buildDeploymentCheckEvidenceReport } from "../src/deploymentCheckEvidence.mjs";
import { validateDeploymentManifest } from "../src/deploymentReadiness.mjs";
import {
  buildExternalActionWorkspaceReport,
  publicExternalActionWorkspaceReport
} from "../src/externalActionWorkspace.mjs";
import { buildIndependentContractReviewReport } from "../src/independentContractReview.mjs";
import { buildLaunchSequenceReport } from "../src/launchSequencer.mjs";
import { loadReceiptRecordsFromPaths, receiptLogPathsFromEnv } from "../src/metrics.mjs";
import { buildOutreachActionPack } from "../src/outreachActionPack.mjs";
import { buildOutreachDrafts } from "../src/outreachDrafts.mjs";
import { buildOutreachStateReport } from "../src/outreachState.mjs";
import { buildPilotIntegrationStateReport } from "../src/pilotIntegrationState.mjs";
import { buildPilotTrafficActionPack, safePilotRuntimeEnv } from "../src/pilotTrafficActionPack.mjs";
import { buildReadinessAudit } from "../src/readiness.mjs";
import { buildXPostActionPack } from "../src/xPostActionPack.mjs";
import { buildXPostStateReport } from "../src/xPostState.mjs";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const outputDir = resolvePath(process.argv[2] || process.env.ALLOW_EXTERNAL_ACTION_WORKSPACE_DIR || join(root, "work/external-action-workspace"));

try {
  const report = await buildCurrentWorkspaceReport(outputDir);
  await writeWorkspace(report, outputDir);
  console.log(JSON.stringify(publicExternalActionWorkspaceReport(report), null, 2));
  process.exitCode = report.valid ? 0 : 1;
} catch (error) {
  console.error(`External action workspace failed: ${error.message}`);
  process.exit(1);
}

async function buildCurrentWorkspaceReport(outputDir) {
  const [
    readiness,
    launchPosts,
    xPostExecutionRecords,
    prospects,
    contactCandidates,
    interviews,
    outreachExecutionRecords,
    pilotTrafficExecutionRecords,
    merchantDirectory,
    deploymentManifest,
    deploymentCheckEvidenceTemplate,
    independentReviewTemplate,
    policyTemplate,
    pilotBindingTemplate,
    gatewayX402Template,
    disputeTemplate
  ] = await Promise.all([
    buildReadinessAudit(root, process.env),
    readJson(join(root, "launch/x_posts.json")),
    readJson(join(root, "ops/x_post_execution_records.json")),
    readJson(join(root, "ops/prospects.json")),
    readJson(join(root, "ops/contact_candidates.json")),
    readJson(join(root, "ops/interviews.json")),
    readJson(join(root, "ops/outreach_execution_records.json")),
    readJson(join(root, "ops/pilot_traffic_execution_records.json")),
    readJson(join(root, "ops/merchant_directory.json")),
    readJson(join(root, "ops/deployment_manifest.template.json")),
    readJson(join(root, "ops/deployment_check_evidence_template.json")),
    readJson(join(root, "ops/independent_contract_review_template.json")),
    readJson(join(root, "allow-policy.example.json")),
    readJson(join(root, "ops/pilot_binding.template.json")),
    readJson(join(root, "ops/gateway.x402.example.json")),
    readJson(join(root, "ops/dispute_template.json"))
  ]);

  const signedPolicy = await readJsonSource(join(root, "ops/signed-policy.local.json"), "signed policy");
  const receiptLogPaths = receiptLogPathsFromEnv(process.env, [join(root, "ops/gateway-receipts.local.jsonl")]);
  const receiptLogs = await loadReceiptRecordsFromPaths(receiptLogPaths);
  const outreachDrafts = buildOutreachDrafts(contactCandidates, prospects);

  const [
    xPostState,
    outreachState,
    pilotIntegrationState,
    deploymentCheckEvidence,
    independentContractReview,
    pilotTrafficActionPack
  ] = await Promise.all([
    buildXPostStateReport({
      launchPosts,
      executionRecords: xPostExecutionRecords
    }),
    buildOutreachStateReport({
      prospects,
      contactCandidates,
      interviews,
      evidenceRecords: outreachExecutionRecords
    }),
    buildPilotIntegrationStateReport(
      {
        prospects,
        merchantDirectory,
        executionRecords: pilotTrafficExecutionRecords,
        receiptRecords: receiptLogs.records
      },
      {
        receiptSourceErrors: receiptLogs.missingPaths.map((path) => `Receipt log missing: ${path}`)
      }
    ),
    buildDeploymentCheckEvidenceReport(deploymentCheckEvidenceTemplate, {
      root,
      deploymentManifest
    }),
    buildIndependentContractReviewReport(independentReviewTemplate, {
      root,
      deploymentManifest
    }),
    buildPilotTrafficActionPack({
      preflight: {
        binding: pilotBindingTemplate,
        policy: signedPolicy.value,
        gatewayConfig: gatewayX402Template,
        disputePacket: disputeTemplate
      },
      runtimeEnv: safePilotRuntimeEnv(process.env),
      sourceErrors: signedPolicy.reasons
    })
  ]);

  const launchSequence = buildLaunchSequenceReport({
    readiness,
    xPostState,
    outreachState,
    pilotIntegrationState,
    deploymentCheckEvidence,
    independentContractReview,
    deploymentManifest: validateDeploymentManifest(deploymentManifest)
  });

  const xPostActionPack = buildXPostActionPack(launchPosts, {
    destination: process.env.ALLOW_X_HANDLE || "@allow_protocol",
    requestedBy: process.env.ALLOW_EXTERNAL_ACTION_REQUESTED_BY || "allow-operator",
    requestedAt: process.env.ALLOW_EXTERNAL_ACTION_REQUESTED_AT,
    approvalIdPrefix: process.env.ALLOW_X_POST_APPROVAL_ID_PREFIX || "x_post"
  });
  const outreachActionPack = buildOutreachActionPack(
    {
      drafts: outreachDrafts
    },
    {
      requestedBy: process.env.ALLOW_EXTERNAL_ACTION_REQUESTED_BY || "allow-operator",
      requestedAt: process.env.ALLOW_EXTERNAL_ACTION_REQUESTED_AT,
      approvalIdPrefix: process.env.ALLOW_OUTREACH_APPROVAL_ID_PREFIX
    }
  );
  const controllerSigningActionPack = buildControllerSigningActionPack(policyTemplate, {
    controller: process.env.ALLOW_EXPECTED_CONTROLLER || "",
    requestedBy: process.env.ALLOW_EXTERNAL_ACTION_REQUESTED_BY || "allow-operator",
    requestedAt: process.env.ALLOW_EXTERNAL_ACTION_REQUESTED_AT
  });

  const actionPacks = [
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

  return buildExternalActionWorkspaceReport(
    {
      readiness,
      launchSequence,
      actionPacks
    },
    {
      outputDir: relativeOutputDir(outputDir)
    }
  );
}

async function writeWorkspace(report, outputDir) {
  await mkdir(outputDir, { recursive: true });
  for (const file of report.files || []) {
    const target = resolve(outputDir, file.path);
    if (!target.startsWith(`${outputDir}/`) && target !== outputDir) {
      throw new Error(`Refusing to write outside workspace: ${file.path}`);
    }
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, file.content, "utf8");
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function readJsonSource(path, label) {
  try {
    return {
      value: JSON.parse(await readFile(path, "utf8")),
      reasons: []
    };
  } catch (error) {
    return {
      value: null,
      reasons: [`Unable to load ${label} JSON from ${path}: ${error.message}`]
    };
  }
}

function resolvePath(path) {
  return isAbsolute(path) ? resolve(path) : resolve(root, path);
}

function relativeOutputDir(path) {
  const relative = path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path;
  return relative || ".";
}
