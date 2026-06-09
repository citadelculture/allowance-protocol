#!/usr/bin/env node

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPilotEvidenceReport } from "../src/pilotEvidence.mjs";
import { loadReceiptRecordsFromPaths, receiptLogPathsFromEnv } from "../src/metrics.mjs";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const receiptPaths = process.argv.slice(2);
const paths = receiptPaths.length
  ? receiptPaths
  : receiptLogPathsFromEnv(process.env, [join(root, "ops/gateway-receipts.local.jsonl")]);

try {
  const loaded = await loadReceiptRecordsFromPaths(paths);
  const report = buildPilotEvidenceReport(loaded.records, {
    merchantId: process.env.ALLOW_PILOT_MERCHANT_ID || "",
    minimumActiveAgents: process.env.ALLOW_PILOT_MIN_ACTIVE_AGENTS || 1
  });
  console.log(
    JSON.stringify(
      {
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
  console.error(`Pilot report failed: ${error.message}`);
  process.exit(1);
}
