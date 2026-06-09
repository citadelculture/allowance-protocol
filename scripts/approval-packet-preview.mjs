#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildApprovalPacketPreview,
  publicApprovalPacketPreviewReport
} from "../src/approvalPacketPreview.mjs";
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
const decisionPath = resolve(process.argv[2] || process.env.ALLOW_APPROVAL_DECISION_PATH || join(root, "work/approval-decision.template.json"));
const workspaceDir = resolve(process.env.ALLOW_EXTERNAL_ACTION_WORKSPACE_DIR || join(root, "work/external-action-workspace"));
const requestedOutputPath = process.argv[3] || process.env.ALLOW_APPROVAL_PACKET_PREVIEW_PATH || "";
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
  const approvalRequest = publicActionTimeApprovalRequestReport(buildActionTimeApprovalRequest({
    approvalPreflight,
    draftPacket: draftPacket.value,
    packetPath: approvalPreflight.action?.packetPath,
    evidenceTemplatePath: approvalPreflight.action?.evidenceTemplatePath
  }));
  const decision = await readDecision(decisionPath);
  const report = await buildApprovalPacketPreview({
    approvalDecision: decision.value,
    approvalRequest,
    draftPacket: draftPacket.value,
    draftPacketSource: draftPacket.source,
    packetPath: approvalPreflight.action?.packetPath
  });
  const reasons = [...report.reasons, ...draftPacket.reasons, ...decision.reasons];
  const valid = report.valid && draftPacket.reasons.length === 0 && decision.reasons.length === 0;
  const target = resolve(requestedOutputPath || join(root, "work/approved-packets", `${safeFileName(report.approvalId || "approved-packet")}.approved.preview.json`));

  if (valid && report.approvedPacket) {
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, `${JSON.stringify(report.approvedPacket, null, 2)}\n`, "utf8");
  }

  console.log(JSON.stringify({
    ...publicApprovalPacketPreviewReport({
      ...report,
      valid,
      reasons
    }),
    decisionPath,
    previewPath: valid ? target : null
  }, null, 2));
  process.exitCode = valid ? 0 : 1;
} catch (error) {
  console.error(`Approval packet preview failed: ${error.message}`);
  process.exit(1);
}

async function readDecision(path) {
  try {
    return {
      value: JSON.parse(await readFile(path, "utf8")),
      reasons: []
    };
  } catch (error) {
    return {
      value: null,
      reasons: [`Unable to read approval decision ${path}: ${error.message}`]
    };
  }
}

async function readDraftPacket(workspaceDir, packetPath) {
  if (!packetPath) {
    return {
      value: null,
      source: "",
      reasons: ["Approval preflight did not name a packet path"]
    };
  }
  try {
    const target = resolve(workspaceDir, packetPath);
    if (!target.startsWith(`${workspaceDir}/`) && target !== workspaceDir) {
      return {
        value: null,
        source: "",
        reasons: [`Refusing to read packet outside workspace: ${packetPath}`]
      };
    }
    const source = await readFile(target, "utf8");
    return {
      value: JSON.parse(source),
      source,
      reasons: []
    };
  } catch (error) {
    return {
      value: null,
      source: "",
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

function safeFileName(value) {
  return String(value || "approved-packet").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "approved-packet";
}
