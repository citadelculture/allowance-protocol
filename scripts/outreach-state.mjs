#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildOutreachStateReport } from "../src/outreachState.mjs";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const recordsPath = process.argv[2] || join(root, "ops/outreach_execution_records.json");

try {
  const [prospects, contactCandidates, interviews, recordsValue] = await Promise.all([
    readJson(join(root, "ops/prospects.json")),
    readJson(join(root, "ops/contact_candidates.json")),
    readJson(join(root, "ops/interviews.json")),
    readJson(recordsPath)
  ]);
  const report = await buildOutreachStateReport({
    prospects,
    contactCandidates,
    interviews,
    evidenceRecords: recordsValue
  });

  console.log(
    JSON.stringify(
      {
        recordsPath,
        ...report
      },
      null,
      2
    )
  );
  process.exitCode = report.valid ? 0 : 1;
} catch (error) {
  console.error(`Outreach state validation failed: ${error.message}`);
  process.exit(1);
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}
