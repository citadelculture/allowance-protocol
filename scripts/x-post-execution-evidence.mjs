#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildXPostExecutionEvidenceReport } from "../src/xPostExecutionEvidence.mjs";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const evidencePath = process.argv[2] || join(root, "ops/x_post_execution_template.json");

try {
  const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
  const report = await buildXPostExecutionEvidenceReport(evidence);
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
  console.error(`X post execution evidence validation failed: ${error.message}`);
  process.exit(1);
}
