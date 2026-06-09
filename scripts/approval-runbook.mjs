#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildApprovalRunbook,
  publicApprovalRunbookReport
} from "../src/approvalRunbook.mjs";
import {
  buildExternalActionReviewBrief,
  publicExternalActionReviewBriefReport
} from "../src/externalActionReviewBrief.mjs";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const workspaceDir = process.argv[2] || process.env.ALLOW_EXTERNAL_ACTION_WORKSPACE_DIR || join(root, "work/external-action-workspace");
const outputPath = process.argv[3] || process.env.ALLOW_APPROVAL_RUNBOOK_PATH || join(root, "work/approval-runbook.md");
const handoffBriefPath = process.env.ALLOW_LAUNCH_HANDOFF_BRIEF_PATH || join(root, "work/launch-handoff-brief.md");

try {
  const currentStage = process.env.ALLOW_CURRENT_STAGE || await readCurrentStage(handoffBriefPath);
  const externalActionReviewBrief = publicExternalActionReviewBriefReport(await buildExternalActionReviewBrief(resolve(workspaceDir), {
    root
  }));
  const report = buildApprovalRunbook({
    externalActionReviewBrief,
    launchSequence: {
      currentStage
    }
  });
  const target = resolve(outputPath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${report.markdown}\n`, "utf8");
  console.log(JSON.stringify({
    ...publicApprovalRunbookReport(report),
    runbookPath: target
  }, null, 2));
  process.exitCode = report.valid ? 0 : 1;
} catch (error) {
  console.error(`Approval runbook failed: ${error.message}`);
  process.exit(1);
}

async function readCurrentStage(path) {
  try {
    const text = await readFile(path, "utf8");
    return text.match(/^- Stage: `([^`]+)`/m)?.[1] || null;
  } catch {
    return null;
  }
}
