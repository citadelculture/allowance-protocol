#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildExternalActionApprovalReport } from "../src/externalActionApproval.mjs";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const packetPath = process.argv[2] || join(root, "ops/external_action_template.json");

try {
  const packet = JSON.parse(await readFile(packetPath, "utf8"));
  const report = await buildExternalActionApprovalReport(packet);
  console.log(
    JSON.stringify(
      {
        packetPath,
        ...report
      },
      null,
      2
    )
  );
  process.exitCode = report.valid ? 0 : 1;
} catch (error) {
  console.error(`External action approval failed: ${error.message}`);
  process.exit(1);
}
