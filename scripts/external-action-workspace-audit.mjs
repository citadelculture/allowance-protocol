#!/usr/bin/env node

import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildExternalActionWorkspaceAuditReport } from "../src/externalActionWorkspaceAudit.mjs";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const workspaceDir = process.argv[2] || process.env.ALLOW_EXTERNAL_ACTION_WORKSPACE_DIR || join(root, "work/external-action-workspace");

try {
  const report = await buildExternalActionWorkspaceAuditReport(resolve(workspaceDir), {
    root
  });
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.valid ? 0 : 1;
} catch (error) {
  console.error(`External action workspace audit failed: ${error.message}`);
  process.exit(1);
}
