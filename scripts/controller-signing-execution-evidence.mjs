#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildControllerSigningExecutionEvidenceReport } from "../src/controllerSigningExecutionEvidence.mjs";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const evidencePath = process.argv[2] || join(root, "ops/controller_signing_execution_template.json");

try {
  const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
  const report = await buildControllerSigningExecutionEvidenceReport(evidence);

  console.log(
    JSON.stringify(
      {
        path: evidencePath,
        ...report
      },
      null,
      2
    )
  );
  process.exitCode = report.valid ? 0 : 1;
} catch (error) {
  console.error(`Controller signing execution evidence failed: ${error.message}`);
  process.exit(1);
}
