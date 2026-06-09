#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDeploymentCheckEvidenceReport } from "../src/deploymentCheckEvidence.mjs";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const evidencePath = process.argv[2] || "ops/deployment_check_evidence_template.json";
const absoluteEvidencePath = resolve(root, evidencePath);

try {
  const evidence = JSON.parse(await readFile(absoluteEvidencePath, "utf8"));
  const deploymentManifest = await loadDeploymentManifest(root, evidence);
  const report = await buildDeploymentCheckEvidenceReport(evidence, {
    root,
    deploymentManifest: deploymentManifest.value,
    sourceErrors: deploymentManifest.reasons
  });

  console.log(
    JSON.stringify(
      {
        evidencePath,
        deploymentManifestPath: evidence.deploymentManifestPath || null,
        ...report
      },
      null,
      2
    )
  );
  process.exitCode = report.valid ? 0 : 1;
} catch (error) {
  console.error(`Deployment check evidence failed: ${error.message}`);
  process.exit(1);
}

async function loadDeploymentManifest(rootDir, evidence = {}) {
  if (evidence.deploymentManifest) return { value: evidence.deploymentManifest, reasons: [] };
  if (!evidence.deploymentManifestPath) return { value: null, reasons: [] };

  try {
    const path = insideRoot(rootDir, evidence.deploymentManifestPath);
    return {
      value: JSON.parse(await readFile(path, "utf8")),
      reasons: []
    };
  } catch (error) {
    return {
      value: null,
      reasons: [`Unable to load deployment manifest from ${evidence.deploymentManifestPath}: ${error.message}`]
    };
  }
}

function insideRoot(rootDir, path) {
  const absolute = resolve(rootDir, path);
  const normalizedRoot = resolve(rootDir);
  if (absolute !== normalizedRoot && !absolute.startsWith(`${normalizedRoot}/`)) {
    throw new Error(`${path} must stay inside the project root`);
  }
  return absolute;
}
