#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDeploymentCheckEvidenceReport } from "../src/deploymentCheckEvidence.mjs";
import { validateDeploymentManifest } from "../src/deploymentReadiness.mjs";
import { buildIndependentContractReviewReport } from "../src/independentContractReview.mjs";
import { buildLaunchSequenceReport } from "../src/launchSequencer.mjs";
import { buildPilotIntegrationStateReport } from "../src/pilotIntegrationState.mjs";
import { buildReadinessAudit } from "../src/readiness.mjs";
import { loadReceiptRecordsFromPaths, receiptLogPathsFromEnv } from "../src/metrics.mjs";
import { buildOutreachStateReport } from "../src/outreachState.mjs";
import { buildXPostStateReport } from "../src/xPostState.mjs";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));

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
  independentReviewTemplate
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
  readJson(join(root, "ops/independent_contract_review_template.json"))
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

const report = buildLaunchSequenceReport({
  readiness,
  xPostState,
  outreachState,
  pilotIntegrationState,
  deploymentCheckEvidence,
  independentContractReview,
  deploymentManifest: validateDeploymentManifest(deploymentManifest)
});

console.log(JSON.stringify(report, null, 2));

process.exitCode = report.valid ? 0 : 1;

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}
