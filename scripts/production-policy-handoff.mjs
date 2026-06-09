#!/usr/bin/env node

import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildControllerSigningActionPack } from "../src/controllerSigningActionPack.mjs";
import { buildControllerSigningExecutionEvidenceReport } from "../src/controllerSigningExecutionEvidence.mjs";
import {
  buildProductionPolicyHandoff,
  publicProductionPolicyHandoffReport
} from "../src/productionPolicyHandoff.mjs";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const outputPath = process.argv[2] || process.env.ALLOW_PRODUCTION_POLICY_HANDOFF_PATH || join(root, "work/production-policy-handoff.md");
const paths = {
  policyTemplate: process.env.ALLOW_POLICY_TEMPLATE || "allow-policy.example.json",
  executionEvidence: process.env.ALLOW_CONTROLLER_SIGNING_EXECUTION_EVIDENCE || "ops/controller_signing_execution_template.json"
};
const controller = process.env.ALLOW_EXPECTED_CONTROLLER || "";

try {
  const report = await buildCurrentProductionPolicyHandoff(paths, controller);
  const target = resolvePath(outputPath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${report.markdown}\n`, "utf8");
  console.log(JSON.stringify({
    ...publicProductionPolicyHandoffReport(report),
    handoffPath: target
  }, null, 2));
} catch (error) {
  console.error(`Production policy handoff failed: ${error.message}`);
  process.exit(1);
}

async function buildCurrentProductionPolicyHandoff(inputPaths, expectedController) {
  const [templateResult, evidenceResult] = await Promise.all([
    readJsonSource(inputPaths.policyTemplate, "policy template"),
    readJsonSource(inputPaths.executionEvidence, "controller signing execution evidence")
  ]);
  const sourceErrors = [
    ...templateResult.reasons,
    ...evidenceResult.reasons
  ];
  const actionPack = buildControllerSigningActionPack(templateResult.value || {}, {
    controller: expectedController
  });
  const executionEvidenceReport = evidenceResult.value
    ? await buildControllerSigningExecutionEvidenceReport(evidenceResult.value)
    : {
        valid: false,
        status: "needs_controller_signing_evidence",
        reasons: evidenceResult.reasons,
        warnings: []
      };

  return buildProductionPolicyHandoff({
    actionPack,
    executionEvidenceReport,
    controller: expectedController,
    paths: inputPaths,
    sourceErrors
  });
}

async function readJsonSource(path, label) {
  try {
    return {
      value: JSON.parse(await readFile(resolvePath(path), "utf8")),
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
  return isAbsolute(path) ? path : resolve(root, path);
}
