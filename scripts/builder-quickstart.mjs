#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildBuilderQuickstartReport,
  publicBuilderQuickstartReport
} from "../src/builderQuickstart.mjs";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const inputPath = process.argv[2] || process.env.ALLOW_BUILDER_QUICKSTART_PATH || join(root, "ops/builder_quickstart.template.json");

try {
  const source = await readFile(inputPath, "utf8");
  const report = buildBuilderQuickstartReport(JSON.parse(source));
  console.log(JSON.stringify({
    inputPath,
    ...publicBuilderQuickstartReport(report)
  }, null, 2));
  process.exitCode = report.valid ? 0 : 1;
} catch (error) {
  const report = buildBuilderQuickstartReport(null, {
    sourceErrors: [`Unable to read builder quickstart input ${inputPath}: ${error.message}`]
  });
  console.log(JSON.stringify({
    inputPath,
    ...publicBuilderQuickstartReport(report)
  }, null, 2));
  process.exit(1);
}
