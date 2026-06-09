#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildRegistryPolicyIntent } from "../src/registryPolicyIntent.mjs";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const manifestPath = process.argv[2] || join(root, "ops/registry_policy_intent_template.json");

try {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const policy = await resolvePolicy(root, manifest);
  const deploymentManifest = await resolveDeploymentManifest(root, manifest);
  const report = buildRegistryPolicyIntent(policy, {
    ...(manifest.registry || {}),
    deploymentManifest: deploymentManifest || manifest.deploymentManifest || manifest.deployment,
    requireDeployedRegistry: manifest.requireDeployedRegistry === true || manifest.registry?.requireDeployedRegistry === true,
    allowZeroSettlementToken: manifest.allowZeroSettlementToken === true || manifest.registry?.allowZeroSettlementToken === true
  });

  console.log(
    JSON.stringify(
      {
        manifestPath,
        intentId: manifest.intentId || null,
        policyPath: manifest.policyPath || null,
        ...report
      },
      null,
      2
    )
  );
  process.exitCode = report.valid ? 0 : 1;
} catch (error) {
  console.error(`Registry policy intent failed: ${error.message}`);
  process.exit(1);
}

async function resolvePolicy(rootDir, manifest = {}) {
  if (manifest.policy) return manifest.policy;
  if (!manifest.policyPath) return {};
  const path = insideRoot(rootDir, manifest.policyPath);
  return JSON.parse(await readFile(path, "utf8"));
}

async function resolveDeploymentManifest(rootDir, manifest = {}) {
  if (manifest.deploymentManifestPath) {
    const path = insideRoot(rootDir, manifest.deploymentManifestPath);
    return JSON.parse(await readFile(path, "utf8"));
  }
  return manifest.deploymentManifest || null;
}

function insideRoot(rootDir, path) {
  const absolute = resolve(rootDir, path);
  const normalizedRoot = resolve(rootDir);
  if (absolute !== normalizedRoot && !absolute.startsWith(`${normalizedRoot}/`)) {
    throw new Error(`${path} must stay inside the project root`);
  }
  return absolute;
}
