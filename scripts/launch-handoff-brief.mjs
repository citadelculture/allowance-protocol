#!/usr/bin/env node

import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDeploymentCheckEvidenceReport } from "../src/deploymentCheckEvidence.mjs";
import { validateDeploymentManifest } from "../src/deploymentReadiness.mjs";
import { buildExternalActionReviewBrief } from "../src/externalActionReviewBrief.mjs";
import {
  buildLaunchHandoffBrief,
  publicLaunchHandoffBriefReport
} from "../src/launchHandoffBrief.mjs";
import { buildIndependentContractReviewReport } from "../src/independentContractReview.mjs";
import { buildInterviewReviewBrief } from "../src/interviewReviewBrief.mjs";
import { buildLaunchSequenceReport } from "../src/launchSequencer.mjs";
import { loadReceiptRecordsFromPaths, receiptLogPathsFromEnv } from "../src/metrics.mjs";
import { buildOutreachStateReport } from "../src/outreachState.mjs";
import { buildPilotIntegrationStateReport } from "../src/pilotIntegrationState.mjs";
import { buildReadinessAudit } from "../src/readiness.mjs";
import { buildXPostStateReport } from "../src/xPostState.mjs";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const outputPath = process.argv[2] || process.env.ALLOW_LAUNCH_HANDOFF_BRIEF_PATH || join(root, "work/launch-handoff-brief.md");

try {
  const report = await buildCurrentLaunchHandoffBrief();
  const target = resolve(outputPath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${report.markdown}\n`, "utf8");
  console.log(JSON.stringify({
    ...publicLaunchHandoffBriefReport(report),
    briefPath: target
  }, null, 2));
  process.exitCode = report.valid ? 0 : 1;
} catch (error) {
  console.error(`Launch handoff brief failed: ${error.message}`);
  process.exit(1);
}

async function buildCurrentLaunchHandoffBrief() {
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
    externalActionReviewBrief,
    interviewReviewBrief
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
    buildExternalActionReviewBrief(join(root, "work/external-action-workspace"), { root }),
    buildInterviewReviewBrief(join(root, "work/interview-workspace"), { root })
  ]);

  const receiptLogPaths = receiptLogPathsFromEnv(process.env, [join(root, "ops/gateway-receipts.local.jsonl")]);
  const receiptLogs = await loadReceiptRecordsFromPaths(receiptLogPaths);
  const [xPostState, outreachState, pilotIntegrationState, deploymentCheckEvidence, independentContractReview] = await Promise.all([
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

  return buildLaunchHandoffBrief({
    readiness,
    launchSequence,
    externalActionReviewBrief,
    interviewReviewBrief
  });
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}
