#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildOutreachApprovalReport, validateOutreachDrafts } from "../src/outreachApproval.mjs";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const draftPath = process.argv[2] || "";

try {
  const report = draftPath
    ? await reportFromDraftPath(draftPath)
    : await reportFromPipeline();

  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.valid ? 0 : 1;
} catch (error) {
  console.error(`Outreach approval failed: ${error.message}`);
  process.exit(1);
}

async function reportFromPipeline() {
  const [candidates, prospects] = await Promise.all([
    readJson(join(root, "ops/contact_candidates.json")),
    readJson(join(root, "ops/prospects.json"))
  ]);
  return buildOutreachApprovalReport(candidates, prospects);
}

async function reportFromDraftPath(path) {
  const value = await readJson(resolve(root, path));
  const drafts = Array.isArray(value) ? value : value.drafts || [value];
  const validation = validateOutreachDrafts(drafts);
  return {
    path,
    generatedAt: new Date().toISOString(),
    valid: validation.valid,
    count: validation.count,
    validCount: validation.validCount,
    reasons: validation.reasons,
    warnings: validation.warnings,
    entries: validation.entries,
    drafts
  };
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}
