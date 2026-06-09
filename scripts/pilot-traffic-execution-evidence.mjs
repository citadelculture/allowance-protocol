#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPilotTrafficExecutionEvidenceReport } from "../src/pilotTrafficExecutionEvidence.mjs";
import { loadReceiptRecords } from "../src/receiptStore.mjs";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const evidencePath = process.argv[2] || join(root, "ops/pilot_traffic_execution_template.json");

try {
  const evidence = JSON.parse(await readFile(resolvePath(evidencePath), "utf8"));
  const receiptLogPath = process.argv[3] || evidence.receipts?.receiptLogPath || "";
  const { records, reasons } = await loadRecords(receiptLogPath);
  const report = await buildPilotTrafficExecutionEvidenceReport(evidence, {
    receiptRecords: records,
    sourceErrors: reasons
  });

  console.log(
    JSON.stringify(
      {
        evidencePath,
        receiptLogPath: receiptLogPath || null,
        ...report
      },
      null,
      2
    )
  );
  process.exitCode = report.valid ? 0 : 1;
} catch (error) {
  console.error(`Pilot traffic execution evidence validation failed: ${error.message}`);
  process.exit(1);
}

async function loadRecords(path) {
  if (!path) return { records: [], reasons: ["Missing receipt log path"] };
  try {
    return { records: await loadReceiptRecords(resolvePath(path)), reasons: [] };
  } catch (error) {
    return {
      records: [],
      reasons: [`Unable to load receipt records from ${path}: ${error.message}`]
    };
  }
}

function resolvePath(path) {
  return isAbsolute(path) ? path : resolve(root, path);
}
