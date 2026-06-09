#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildCanonicalUpdateSet,
  publicCanonicalUpdateSetReport
} from "../src/canonicalUpdateSet.mjs";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const ledgerEntryPreviewPath =
  process.argv[2] ||
  process.env.ALLOW_EXECUTION_LEDGER_ENTRY_PATH ||
  join(root, "work/execution-evidence-ledger-entry.json");
const stateUpdatePreviewPath =
  process.argv[3] ||
  process.env.ALLOW_STATE_UPDATE_PREVIEW_PATH ||
  join(root, "work/state-update-preview.json");
const outputPath =
  process.argv[4] ||
  process.env.ALLOW_CANONICAL_UPDATE_SET_PATH ||
  join(root, "work/canonical-update-set.json");

try {
  const ledgerEntryReport = await readJson(resolvePath(ledgerEntryPreviewPath));
  const stateUpdatePreview = await readJson(resolvePath(stateUpdatePreviewPath));
  const actionType = ledgerEntryReport.actionType || stateUpdatePreview.actionType;
  const canonicalFiles = await canonicalFilesFor(actionType);
  const report = buildCanonicalUpdateSet({
    actionType,
    ledgerEntryReport,
    stateUpdatePreview,
    ...canonicalFiles
  });
  const target = resolvePath(outputPath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    ledgerEntryPreviewPath: resolvePath(ledgerEntryPreviewPath),
    stateUpdatePreviewPath: resolvePath(stateUpdatePreviewPath),
    canonicalUpdateSetPath: target,
    ...publicCanonicalUpdateSetReport(report)
  }, null, 2));
  process.exitCode = report.valid ? 0 : 1;
} catch (error) {
  console.error(`Canonical update set failed: ${error.message}`);
  process.exit(1);
}

async function canonicalFilesFor(actionType) {
  if (actionType === "x_post") {
    return {
      currentLedger: await readJson(join(root, "ops/x_post_execution_records.json")),
      currentState: await readJson(join(root, "launch/x_posts.json"))
    };
  }
  if (actionType === "merchant_outreach") {
    return {
      currentLedger: await readJson(join(root, "ops/outreach_execution_records.json")),
      currentState: await readJson(join(root, "ops/prospects.json"))
    };
  }
  return {};
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function resolvePath(path) {
  return resolve(root, path);
}
