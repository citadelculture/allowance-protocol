#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildRegistryTransactionEvidenceReport } from "../src/registryTransactionEvidence.mjs";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const evidencePath = process.argv[2] || join(root, "ops/registry_transaction_evidence_template.json");

try {
  const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
  const report = buildRegistryTransactionEvidenceReport(evidence, {
    requireConfirmed: evidence.requireConfirmed !== false
  });

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
  console.error(`Registry transaction evidence validation failed: ${error.message}`);
  process.exit(1);
}
