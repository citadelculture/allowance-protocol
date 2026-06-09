#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildStateUpdatePreview,
  publicStateUpdatePreviewReport
} from "../src/stateUpdatePreview.mjs";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const ledgerEntryPreviewPath =
  process.argv[2] ||
  process.env.ALLOW_EXECUTION_LEDGER_ENTRY_PATH ||
  join(root, "work/execution-evidence-ledger-entry.json");
const outputPath =
  process.argv[3] ||
  process.env.ALLOW_STATE_UPDATE_PREVIEW_PATH ||
  join(root, "work/state-update-preview.json");

try {
  const ledgerEntryReport = await readJson(resolvePath(ledgerEntryPreviewPath));
  const actionType = ledgerEntryReport.actionType;
  const canonicalState = await canonicalStateFor(actionType);
  const report = await buildStateUpdatePreview({
    actionType,
    ledgerEntryReport,
    ...canonicalState
  });
  const target = resolvePath(outputPath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    ledgerEntryPreviewPath: resolvePath(ledgerEntryPreviewPath),
    stateUpdatePreviewPath: target,
    ...publicStateUpdatePreviewReport(report)
  }, null, 2));
  process.exitCode = report.valid ? 0 : 1;
} catch (error) {
  console.error(`State update preview failed: ${error.message}`);
  process.exit(1);
}

async function canonicalStateFor(actionType) {
  if (actionType === "x_post") {
    return {
      launchPosts: await readJson(join(root, "launch/x_posts.json"))
    };
  }
  if (actionType === "merchant_outreach") {
    return {
      prospects: await readJson(join(root, "ops/prospects.json")),
      contactCandidates: await readJson(join(root, "ops/contact_candidates.json")),
      interviews: await readJson(join(root, "ops/interviews.json"))
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
