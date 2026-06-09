#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deriveLaunchMetrics, loadReceiptRecordsFromPaths, receiptLogPathsFromEnv } from "../src/metrics.mjs";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const baseMetrics = JSON.parse(await readFile(join(root, "ops/metrics.json"), "utf8"));
const receiptPaths = process.argv.slice(2);
const paths = receiptPaths.length
  ? receiptPaths
  : receiptLogPathsFromEnv(process.env, [join(root, "ops/gateway-receipts.local.jsonl")]);
const loaded = await loadReceiptRecordsFromPaths(paths);
const metrics = deriveLaunchMetrics(baseMetrics, loaded.records, {
  loadedPaths: loaded.loadedPaths
});

console.log(
  JSON.stringify(
    {
      metrics,
      receiptLogs: {
        loaded: loaded.loadedPaths,
        missing: loaded.missingPaths
      }
    },
    null,
    2
  )
);
