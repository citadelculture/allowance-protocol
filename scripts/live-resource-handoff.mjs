#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildLiveResourceHandoffReport,
  publicLiveResourceHandoffReport
} from "../src/liveResourceHandoff.mjs";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const manifestPath = process.argv[2] || process.env.ALLOW_LIVE_RESOURCE_HANDOFF_PATH || join(root, "ops/live_resource_handoff.template.json");

try {
  const source = await readFile(manifestPath, "utf8");
  const report = buildLiveResourceHandoffReport(JSON.parse(source));
  console.log(JSON.stringify({
    manifestPath,
    ...publicLiveResourceHandoffReport(report)
  }, null, 2));
  process.exitCode = report.valid ? 0 : 1;
} catch (error) {
  const report = buildLiveResourceHandoffReport(null, {
    sourceErrors: [`Unable to read live resource handoff manifest ${manifestPath}: ${error.message}`]
  });
  console.log(JSON.stringify({
    manifestPath,
    ...publicLiveResourceHandoffReport(report)
  }, null, 2));
  process.exit(1);
}
