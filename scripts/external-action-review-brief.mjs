#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildExternalActionReviewBrief,
  publicExternalActionReviewBriefReport
} from "../src/externalActionReviewBrief.mjs";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const workspaceDir = process.argv[2] || process.env.ALLOW_EXTERNAL_ACTION_WORKSPACE_DIR || join(root, "work/external-action-workspace");
const outputPath = process.argv[3] || process.env.ALLOW_EXTERNAL_ACTION_REVIEW_BRIEF_PATH || join(root, "work/external-action-review-brief.md");

try {
  const report = await buildExternalActionReviewBrief(resolve(workspaceDir), {
    root
  });
  const target = resolve(outputPath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${report.markdown}\n`, "utf8");
  console.log(JSON.stringify({
    ...publicExternalActionReviewBriefReport(report),
    briefPath: target
  }, null, 2));
  process.exitCode = report.valid ? 0 : 1;
} catch (error) {
  console.error(`External action review brief failed: ${error.message}`);
  process.exit(1);
}
