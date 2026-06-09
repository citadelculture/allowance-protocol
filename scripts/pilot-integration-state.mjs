#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadReceiptRecordsFromPaths, receiptLogPathsFromEnv } from "../src/metrics.mjs";
import { buildPilotIntegrationStateReport } from "../src/pilotIntegrationState.mjs";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const recordsPath = process.argv[2] || join(root, "ops/pilot_traffic_execution_records.json");
const receiptArg = process.argv[3] || "";
const receiptLogPaths = receiptArg
  ? [resolvePath(receiptArg)]
  : receiptLogPathsFromEnv(process.env, [join(root, "ops/gateway-receipts.local.jsonl")]);

try {
  const [prospects, merchantDirectory, recordsValue, receiptLogs] = await Promise.all([
    readJson(join(root, "ops/prospects.json")),
    readJson(join(root, "ops/merchant_directory.json")),
    readJson(resolvePath(recordsPath)),
    loadReceiptRecordsFromPaths(receiptLogPaths)
  ]);
  const report = await buildPilotIntegrationStateReport(
    {
      prospects,
      merchantDirectory,
      executionRecords: recordsValue,
      receiptRecords: receiptLogs.records
    },
    {
      receiptSourceErrors: receiptLogs.missingPaths.map((path) => `Receipt log missing: ${path}`)
    }
  );

  console.log(
    JSON.stringify(
      {
        recordsPath,
        receiptLogPaths: {
          loaded: receiptLogs.loadedPaths,
          missing: receiptLogs.missingPaths
        },
        ...report
      },
      null,
      2
    )
  );
  process.exitCode = report.valid ? 0 : 1;
} catch (error) {
  console.error(`Pilot integration state validation failed: ${error.message}`);
  process.exit(1);
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function resolvePath(path) {
  return isAbsolute(path) ? path : resolve(root, path);
}
