#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildRegistryLifecycleIntent } from "../src/registryLifecycleIntent.mjs";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const manifestPath = process.argv[2] || join(root, "ops/registry_lifecycle_intent_template.json");

try {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const deploymentManifest = await resolveDeploymentManifest(root, manifest);
  const report = buildRegistryLifecycleIntent(manifest.lifecycle || manifest, {
    ...(manifest.registry || {}),
    deploymentManifest: deploymentManifest || manifest.deploymentManifest || manifest.deployment,
    requireDeployedRegistry: manifest.requireDeployedRegistry === true || manifest.registry?.requireDeployedRegistry === true
  });

  console.log(
    JSON.stringify(
      {
        manifestPath,
        intentId: manifest.intentId || null,
        ...report
      },
      null,
      2
    )
  );
  process.exitCode = report.valid ? 0 : 1;
} catch (error) {
  console.error(`Registry lifecycle intent failed: ${error.message}`);
  process.exit(1);
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
