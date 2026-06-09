#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { summarizeDeploymentManifest, validateDeploymentManifest } from "../src/deploymentReadiness.mjs";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const manifestPath = process.argv[2] || process.env.ALLOW_DEPLOYMENT_MANIFEST || "ops/deployment_manifest.template.json";
const absoluteManifestPath = resolve(root, manifestPath);

try {
  const manifest = JSON.parse(await readFile(absoluteManifestPath, "utf8"));
  const validation = validateDeploymentManifest(manifest, {
    requireMainnet: process.env.ALLOW_REQUIRE_MAINNET_DEPLOYMENT === "1"
  });
  const sourceCheck = await sourceHashCheck(manifest, root);
  const reasons = [...validation.reasons, ...sourceCheck.reasons];
  const warnings = [...validation.warnings, ...sourceCheck.warnings];
  const valid = reasons.length === 0;

  console.log(
    JSON.stringify(
      {
        path: manifestPath,
        ...summarizeDeploymentManifest(manifest, {
          requireMainnet: process.env.ALLOW_REQUIRE_MAINNET_DEPLOYMENT === "1"
        }),
        valid,
        reasons,
        warnings,
        sourceCheck,
        validation
      },
      null,
      2
    )
  );
  process.exitCode = valid ? 0 : 1;
} catch (error) {
  console.error(`Deployment manifest validation failed: ${error.message}`);
  process.exit(1);
}

async function sourceHashCheck(manifest, root) {
  const contractPath = manifest?.contract?.path || "";
  const expected = String(manifest?.contract?.sourceSha256 || "").toLowerCase();
  const reasons = [];
  const warnings = [];

  if (!contractPath || !expected) {
    return { valid: false, reasons: [], warnings, actualSha256: null, expectedSha256: expected || null };
  }

  try {
    const absolutePath = resolve(root, contractPath);
    const relativePath = relative(root, absolutePath);
    if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
      return {
        valid: false,
        reasons: ["contract.path must stay inside the project root"],
        warnings,
        actualSha256: null,
        expectedSha256: expected
      };
    }
    const bytes = await readFile(absolutePath);
    const actual = `0x${createHash("sha256").update(bytes).digest("hex")}`;
    if (expected !== actual.toLowerCase()) reasons.push("contract.sourceSha256 does not match contract.path");
    return {
      valid: reasons.length === 0,
      reasons,
      warnings,
      actualSha256: actual,
      expectedSha256: expected
    };
  } catch (error) {
    return {
      valid: false,
      reasons: [`Unable to hash contract source: ${error.message}`],
      warnings,
      actualSha256: null,
      expectedSha256: expected
    };
  }
}
