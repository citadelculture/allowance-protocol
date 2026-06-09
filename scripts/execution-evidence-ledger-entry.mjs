#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildExecutionEvidenceLedgerEntry,
  publicExecutionEvidenceLedgerEntryReport
} from "../src/executionEvidenceLedgerEntry.mjs";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const evidencePath = process.argv[2] || process.env.ALLOW_EXECUTION_EVIDENCE_PATH || "";
const explicitLedgerPath = process.argv[3] || process.env.ALLOW_EXECUTION_LEDGER_PATH || "";
const outputPath = process.argv[4] || process.env.ALLOW_EXECUTION_LEDGER_ENTRY_PATH || join(root, "work/execution-evidence-ledger-entry.json");

if (!evidencePath) {
  console.error("Usage: npm run execution-evidence-ledger-entry -- <filled-evidence.json> [existing-ledger.json] [output-preview.json]");
  process.exit(1);
}

try {
  const evidence = await readJson(resolvePath(evidencePath));
  const defaultLedgerPath = defaultLedgerPathFor(evidence);
  const ledgerPath = explicitLedgerPath || defaultLedgerPath;
  const existingLedger = ledgerPath ? await readJson(resolvePath(ledgerPath), { fallback: { records: [] } }) : { records: [] };
  const report = await buildExecutionEvidenceLedgerEntry({
    evidence,
    existingLedger
  });
  const target = resolvePath(outputPath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    evidencePath: resolvePath(evidencePath),
    ledgerPath: ledgerPath ? resolvePath(ledgerPath) : null,
    previewPath: target,
    ...publicExecutionEvidenceLedgerEntryReport(report)
  }, null, 2));
  process.exitCode = report.valid ? 0 : 1;
} catch (error) {
  console.error(`Execution evidence ledger entry failed: ${error.message}`);
  process.exit(1);
}

function defaultLedgerPathFor(evidence) {
  const actionType = evidence?.approvalPacket?.actionType || evidence?.approval?.packet?.actionType || evidence?.actionType;
  if (actionType === "x_post") return join(root, "ops/x_post_execution_records.json");
  if (actionType === "merchant_outreach") return join(root, "ops/outreach_execution_records.json");
  return "";
}

async function readJson(path, options = {}) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (options.fallback !== undefined) return options.fallback;
    throw error;
  }
}

function resolvePath(path) {
  return resolve(root, path);
}
