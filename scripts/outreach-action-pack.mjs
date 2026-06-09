#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildOutreachActionPack } from "../src/outreachActionPack.mjs";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const draftPath = process.argv[2] || "";

try {
  const report = draftPath
    ? await reportFromDraftPath(draftPath)
    : await reportFromPipeline();

  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.valid ? 0 : 1;
} catch (error) {
  console.error(`Outreach action pack failed: ${error.message}`);
  process.exit(1);
}

async function reportFromPipeline() {
  const [candidates, prospects] = await Promise.all([
    readJson(join(root, "ops/contact_candidates.json")),
    readJson(join(root, "ops/prospects.json"))
  ]);
  return buildOutreachActionPack(
    {
      candidates,
      prospects
    },
    optionsFromEnv()
  );
}

async function reportFromDraftPath(path) {
  const value = await readJson(resolve(root, path));
  const drafts = Array.isArray(value) ? value : value.drafts || [value];
  return buildOutreachActionPack(
    {
      drafts
    },
    optionsFromEnv()
  );
}

function optionsFromEnv() {
  return {
    requestedBy: process.env.ALLOW_EXTERNAL_ACTION_REQUESTED_BY || "allow-operator",
    requestedAt: process.env.ALLOW_EXTERNAL_ACTION_REQUESTED_AT,
    approvalIdPrefix: process.env.ALLOW_OUTREACH_APPROVAL_ID_PREFIX
  };
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}
