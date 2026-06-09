#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildApprovalPreflight,
  publicApprovalPreflightReport
} from "../src/approvalPreflight.mjs";
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
const outputPath = process.argv[3] || process.env.ALLOW_APPROVAL_PREFLIGHT_PATH || join(root, "work/approval-preflight.md");
const handoffBriefPath = process.env.ALLOW_LAUNCH_HANDOFF_BRIEF_PATH || join(root, "work/launch-handoff-brief.md");

try {
  const launchHandoffBrief = await readLaunchHandoffBrief(handoffBriefPath);
  const externalActionReviewBrief = publicExternalActionReviewBriefReport(await buildExternalActionReviewBrief(resolve(workspaceDir), {
    root
  }));
  const approvalRunbook = publicApprovalRunbookReport(buildApprovalRunbook({
    externalActionReviewBrief,
    launchHandoffBrief
  }));
  const report = buildApprovalPreflight({
    externalActionReviewBrief,
    approvalRunbook,
    launchHandoffBrief
  });
  const target = resolve(outputPath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${report.markdown}\n`, "utf8");
  console.log(JSON.stringify({
    ...publicApprovalPreflightReport(report),
    preflightPath: target
  }, null, 2));
  process.exitCode = report.valid ? 0 : 1;
} catch (error) {
  console.error(`Approval preflight failed: ${error.message}`);
  process.exit(1);
}

async function readLaunchHandoffBrief(path) {
  try {
    const text = await readFile(path, "utf8");
    return {
      valid: !/^## Handoff Needs Fixes/m.test(text),
      status: text.match(/^Status: ([^\n]+)/m)?.[1] || null,
      launchSequenceStatus: text.match(/^Launch sequence: ([^\n]+)/m)?.[1] || null,
      currentStage: {
        id: nullIfPlaceholder(text.match(/^- Stage: `([^`]+)`/m)?.[1]),
        status: nullIfPlaceholder(text.match(/^- Status: `([^`]+)`/m)?.[1]),
        externalActionType: nullIfPlaceholder(text.match(/^- External action type: `([^`]+)`/m)?.[1]),
        nextAction: text.match(/^- Next action: ([^\n]+)/m)?.[1] || null
      }
    };
  } catch (error) {
    return {
      valid: false,
      status: "missing_handoff_brief",
      launchSequenceStatus: null,
      currentStage: null,
      reasons: [`Unable to read launch handoff brief: ${error.message}`]
    };
  }
}

function nullIfPlaceholder(value) {
  return value && value !== "none" && value !== "unknown" ? value : null;
}
