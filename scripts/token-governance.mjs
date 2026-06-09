#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deriveLaunchMetrics, loadReceiptRecordsFromPaths, receiptLogPathsFromEnv } from "../src/metrics.mjs";
import { buildTokenGovernanceReport } from "../src/tokenGovernance.mjs";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const manifestPath = process.argv[2] || join(root, "ops/token_governance.json");

try {
  const [manifest, baseMetrics] = await Promise.all([
    readJson(manifestPath),
    readJson(join(root, "ops/metrics.json"))
  ]);
  const receiptPaths = receiptLogPathsFromEnv(process.env, [join(root, "ops/gateway-receipts.local.jsonl")]);
  const loaded = await loadReceiptRecordsFromPaths(receiptPaths);
  const metrics = deriveLaunchMetrics(baseMetrics, loaded.records, {
    loadedPaths: loaded.loadedPaths
  });
  const report = buildTokenGovernanceReport(manifest, metrics);
  console.log(
    JSON.stringify(
      {
        manifestPath,
        receiptLogs: {
          loaded: loaded.loadedPaths,
          missing: loaded.missingPaths
        },
        ...report
      },
      null,
      2
    )
  );
  process.exitCode = report.valid ? 0 : 1;
} catch (error) {
  console.error(`Token governance validation failed: ${error.message}`);
  process.exit(1);
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}
