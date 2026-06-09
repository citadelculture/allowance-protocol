#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildActionTimeApprovalRequest,
  publicActionTimeApprovalRequestReport
} from "../src/actionTimeApprovalRequest.mjs";
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
const workspaceDir = resolve(process.argv[2] || process.env.ALLOW_EXTERNAL_ACTION_WORKSPACE_DIR || join(root, "work/external-action-workspace"));
const outputPath = process.argv[3] || process.env.ALLOW_APPROVAL_REQUEST_PATH || join(root, "work/approval-request.md");
const handoffBriefPath = process.env.ALLOW_LAUNCH_HANDOFF_BRIEF_PATH || join(root, "work/launch-handoff-brief.md");

try {
  const launchHandoffBrief = await readLaunchHandoffBrief(handoffBriefPath);
  const externalActionReviewBrief = publicExternalActionReviewBriefReport(await buildExternalActionReviewBrief(workspaceDir, {
    root
  }));
  const approvalRunbook = publicApprovalRunbookReport(buildApprovalRunbook({
    externalActionReviewBrief,
    launchHandoffBrief
  }));
  const approvalPreflight = publicApprovalPreflightReport(buildApprovalPreflight({
    externalActionReviewBrief,
    approvalRunbook,
    launchHandoffBrief
  }));
  const draftPacket = await readDraftPacket(workspaceDir, approvalPreflight.action?.packetPath);
  const report = buildActionTimeApprovalRequest({
    approvalPreflight,
    draftPacket: draftPacket.value,
    packetPath: approvalPreflight.action?.packetPath,
    evidenceTemplatePath: approvalPreflight.action?.evidenceTemplatePath
  });

  const target = resolve(outputPath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${report.markdown}\n`, "utf8");
  console.log(JSON.stringify({
    ...publicActionTimeApprovalRequestReport({
      ...report,
      reasons: [...report.reasons, ...draftPacket.reasons]
    }),
    requestPath: target
  }, null, 2));
  process.exitCode = report.valid && draftPacket.reasons.length === 0 ? 0 : 1;
} catch (error) {
  console.error(`Approval request failed: ${error.message}`);
  process.exit(1);
}

async function readDraftPacket(workspaceDir, packetPath) {
  if (!packetPath) {
    return {
      value: null,
      reasons: ["Approval preflight did not name a packet path"]
    };
  }
  try {
    const target = resolve(workspaceDir, packetPath);
    if (!target.startsWith(`${workspaceDir}/`) && target !== workspaceDir) {
      return {
        value: null,
        reasons: [`Refusing to read packet outside workspace: ${packetPath}`]
      };
    }
    return {
      value: JSON.parse(await readFile(target, "utf8")),
      reasons: []
    };
  } catch (error) {
    return {
      value: null,
      reasons: [`Unable to read draft packet ${packetPath}: ${error.message}`]
    };
  }
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
