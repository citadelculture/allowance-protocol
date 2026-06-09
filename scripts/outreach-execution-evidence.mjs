#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildOutreachExecutionEvidenceReport } from "../src/outreachExecutionEvidence.mjs";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const evidencePath = process.argv[2] || join(root, "ops/outreach_execution_template.json");

try {
  const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
  const report = await buildOutreachExecutionEvidenceReport(evidence);
  console.log(
    JSON.stringify(
      {
        evidencePath,
        ...report
      },
      null,
      2
    )
  );
  process.exitCode = report.valid ? 0 : 1;
} catch (error) {
  console.error(`Outreach execution evidence validation failed: ${error.message}`);
  process.exit(1);
}
