#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadReceiptRecordsFromPaths, receiptLogPathsFromEnv } from "../src/metrics.mjs";
import { buildPilotDisclosureReport } from "../src/pilotDisclosure.mjs";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const [packetPath = join(root, "ops/pilot_disclosure_template.json"), ...receiptPaths] = process.argv.slice(2);
const paths = receiptPaths.length
  ? receiptPaths
  : receiptLogPathsFromEnv(process.env, [join(root, "ops/gateway-receipts.local.jsonl")]);

try {
  const packet = JSON.parse(await readFile(packetPath, "utf8"));
  const loaded = await loadReceiptRecordsFromPaths(paths);
  const report = buildPilotDisclosureReport(packet, loaded.records, {
    minimumActiveAgents: process.env.ALLOW_PILOT_MIN_ACTIVE_AGENTS || 1,
    requireExperimentalDisclosure: process.env.ALLOW_REQUIRE_EXPERIMENTAL_DISCLOSURE === "1"
  });

  console.log(
    JSON.stringify(
      {
        packetPath,
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
  console.error(`Pilot disclosure failed: ${error.message}`);
  process.exit(1);
}
