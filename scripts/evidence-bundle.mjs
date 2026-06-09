#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildEvidenceBundleReport } from "../src/evidenceBundle.mjs";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const manifestPath = process.argv[2] || join(root, "ops/evidence_bundle_template.json");

try {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const report = await buildEvidenceBundleReport(root, manifest, {
    scanPrivate: process.env.ALLOW_SCAN_PRIVATE_EVIDENCE === "1"
  });
  console.log(
    JSON.stringify(
      {
        manifestPath,
        ...report
      },
      null,
      2
    )
  );
  process.exitCode = report.valid ? 0 : 1;
} catch (error) {
  console.error(`Evidence bundle validation failed: ${error.message}`);
  process.exit(1);
}
