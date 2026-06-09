#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadReceiptRecordsFromPaths, receiptLogPathsFromEnv } from "../src/metrics.mjs";
import { buildMerchantPromotionReport } from "../src/merchantPromotion.mjs";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const [
  promotionPath = join(root, "ops/merchant_promotion_template.json"),
  directoryPath = join(root, "ops/merchant_directory.json"),
  disclosurePath = join(root, "ops/pilot_disclosure_template.json"),
  ...receiptPaths
] = process.argv.slice(2);
const paths = receiptPaths.length
  ? receiptPaths
  : receiptLogPathsFromEnv(process.env, [join(root, "ops/gateway-receipts.local.jsonl")]);

try {
  const [promotion, directory, disclosurePacket] = await Promise.all([
    readJson(promotionPath),
    readJson(directoryPath),
    readJson(disclosurePath)
  ]);
  const loaded = await loadReceiptRecordsFromPaths(paths);
  const report = await buildMerchantPromotionReport(
    {
      promotion,
      directory,
      disclosurePacket,
      receiptRecords: loaded.records
    },
    {
      minimumActiveAgents: process.env.ALLOW_PILOT_MIN_ACTIVE_AGENTS || 1,
      requireExperimentalDisclosure: process.env.ALLOW_REQUIRE_EXPERIMENTAL_DISCLOSURE === "1"
    }
  );

  console.log(
    JSON.stringify(
      {
        promotionPath,
        directoryPath,
        disclosurePath,
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
  console.error(`Merchant promotion failed: ${error.message}`);
  process.exit(1);
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}
