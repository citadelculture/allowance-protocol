import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildExternalActionWorkspaceAuditReport } from "./externalActionWorkspaceAudit.mjs";

export const EXTERNAL_ACTION_REVIEW_BRIEF_STATUSES = [
  "ready_for_packet_review",
  "needs_workspace_fixes",
  "no_ready_packets",
  "missing_manifest"
];

const APPROVAL_FLAGS = [
  "humanWillExecute",
  "automationDisabled",
  "exactActionReviewed",
  "externalSideEffectAcknowledged",
  "noPrivateKeys",
  "noCustodyOrEscrow",
  "noTokenPitch",
  "noMarketManipulation",
  "legalEthicsReviewed"
];

export async function buildExternalActionReviewBrief(workspaceDir, options = {}) {
  const root = resolve(options.root || process.cwd());
  const workspaceRoot = resolve(root, workspaceDir || "work/external-action-workspace");
  const generatedAt = options.generatedAt || new Date().toISOString();
  const audit = options.audit || await buildExternalActionWorkspaceAuditReport(workspaceRoot, {
    root,
    generatedAt
  });
  const reasons = [...(audit.reasons || [])];
  const warnings = [...(audit.warnings || [])];
  const manifestRead = await readJson(resolve(workspaceRoot, "manifest.json"));
  const manifest = manifestRead.ok ? manifestRead.value : null;

  if (!manifestRead.ok) reasons.push(`Unable to read review workspace manifest: ${manifestRead.reason}`);

  const actions = [];
  for (const [index, entry] of (manifest?.draftPackets || []).entries()) {
    actions.push(await actionSummaryForEntry({
      index,
      entry,
      manifest,
      audit,
      workspaceRoot
    }));
  }

  const valid = audit.valid === true && manifestRead.ok;
  const status = !manifestRead.ok || audit.status === "missing_manifest"
    ? "missing_manifest"
    : !audit.valid
      ? "needs_workspace_fixes"
      : actions.length > 0
        ? "ready_for_packet_review"
        : "no_ready_packets";
  const markdown = buildMarkdownBrief({
    generatedAt,
    workspaceRoot,
    valid,
    status,
    audit,
    manifest,
    actions,
    reasons,
    warnings
  });

  return {
    generatedAt,
    valid,
    status,
    workspaceDir: workspaceRoot,
    audit: {
      status: audit.status,
      valid: audit.valid,
      counts: audit.counts,
      reasons: audit.reasons || [],
      warnings: audit.warnings || []
    },
    counts: {
      reviewActions: actions.length,
      draftPackets: manifest?.draftPackets?.length || 0,
      evidenceTemplates: manifest?.executionEvidenceTemplates?.length || 0,
      xPosts: actions.filter((action) => action.actionType === "x_post").length,
      merchantOutreach: actions.filter((action) => action.actionType === "merchant_outreach").length,
      needsPacketFixes: manifest?.needsPacketFixes?.length || 0,
      blocked: manifest?.blocked?.length || 0,
      notReady: manifest?.notReady?.length || 0
    },
    actions,
    markdown,
    reasons: unique(reasons),
    warnings: unique(warnings),
    nextAction: valid
      ? "Use the review brief to inspect draft packets, then approve and execute only with explicit human action."
      : "Fix or regenerate the external action workspace before using the review brief.",
    evidenceBoundary: {
      readsLocalWorkspaceFiles: true,
      writesFiles: false,
      postsContent: false,
      sendsOutreach: false,
      signsWalletPayloads: false,
      deploysContracts: false,
      startsPilotTraffic: false,
      promotesMerchant: false,
      movesFunds: false,
      storesSecrets: false,
      approvesExternalAction: false,
      requiresHumanApproval: true
    }
  };
}

export function publicExternalActionReviewBriefReport(report = {}) {
  return {
    ...report,
    markdown: undefined
  };
}

async function actionSummaryForEntry({ index, entry, manifest, audit, workspaceRoot }) {
  const packetRead = await readJson(resolve(workspaceRoot, entry.path || ""));
  const packet = packetRead.ok ? packetRead.value : {};
  const auditFile = (audit.files || []).find((file) => file.path === entry.path) || null;
  const evidenceEntry = (manifest.executionEvidenceTemplates || []).find((file) => file.approvalId === entry.approvalId) || null;
  const evidenceAuditFile = evidenceEntry
    ? (audit.files || []).find((file) => file.path === evidenceEntry.path) || null
    : null;
  const trueApprovalFlags = APPROVAL_FLAGS.filter((flag) => packet.approvals?.[flag] === true);
  const falseApprovalFlags = APPROVAL_FLAGS.filter((flag) => packet.approvals?.[flag] === false);
  const exactText = packet.action?.exactText || packet.payload?.post?.text || packet.payload?.outreachDraft?.message || "";

  return {
    index: index + 1,
    approvalId: entry.approvalId || packet.approvalId || null,
    stageId: entry.stageId || null,
    actionType: entry.actionType || packet.actionType || null,
    title: entry.title || packet.action?.summary || entry.approvalId || null,
    packetPath: entry.path || null,
    packetAuditStatus: auditFile?.status || "not_checked",
    packetHashMatches: auditFile?.hashMatches ?? null,
    packetStatus: packet.status || null,
    approvalCommand: entry.approvalCommand || null,
    evidenceTemplatePath: evidenceEntry?.path || entry.evidenceTemplatePath || null,
    evidenceTemplateAuditStatus: evidenceAuditFile?.status || (evidenceEntry ? "not_checked" : "missing"),
    evidenceValidationCommand: evidenceEntry?.validationCommand || entry.validationCommand || null,
    channel: packet.action?.channel || entry.channel || null,
    destination: packet.action?.destination || entry.destination || null,
    summary: packet.action?.summary || null,
    executionMode: packet.action?.executionMode || null,
    automated: packet.action?.automated ?? null,
    exactText,
    exactTextChars: exactText.length,
    approvalFlags: {
      required: APPROVAL_FLAGS.length,
      falseCount: falseApprovalFlags.length,
      trueCount: trueApprovalFlags.length,
      trueFlags: trueApprovalFlags
    },
    reasons: [
      ...(packetRead.ok ? [] : [`Unable to read packet JSON: ${packetRead.reason}`]),
      ...(auditFile?.reasons || [])
    ],
    warnings: auditFile?.warnings || []
  };
}

function buildMarkdownBrief({ generatedAt, workspaceRoot, valid, status, audit, manifest, actions, reasons, warnings }) {
  const lines = [
    "# Allow External Action Review Brief",
    "",
    `Generated: ${generatedAt}`,
    `Workspace: ${workspaceRoot}`,
    `Status: ${status}`,
    `Audit: ${audit.status} (${audit.valid ? "valid" : "invalid"})`,
    "",
    "## Safety Boundary",
    "",
    "- This brief is local review material only.",
    "- No packet is approved by this brief.",
    "- No content is posted, outreach is sent, wallet payload is signed, contract is deployed, pilot traffic is started, merchant is promoted, or funds are moved.",
    "- Every external action still requires an explicitly approved packet and post-execution evidence.",
    ""
  ];

  if (!valid) {
    lines.push("## Workspace Needs Fixes", "");
    for (const reason of unique(reasons)) lines.push(`- ${reason}`);
    if (warnings.length > 0) {
      lines.push("", "## Warnings", "");
      for (const warning of unique(warnings)) lines.push(`- ${warning}`);
    }
    return lines.join("\n");
  }

  lines.push(
    "## Review Queue",
    "",
    `- Draft packets: ${manifest?.draftPackets?.length || 0}`,
    `- Evidence templates: ${manifest?.executionEvidenceTemplates?.length || 0}`,
    `- Packet fixes needed: ${manifest?.needsPacketFixes?.length || 0}`,
    `- Blocked future actions: ${manifest?.blocked?.length || 0}`,
    ""
  );

  if (actions.length === 0) {
    lines.push("No draft packets are ready for review.");
  } else {
    for (const action of actions) {
      lines.push(
        `### ${action.index}. ${action.title || action.approvalId}`,
        "",
        `- Approval id: \`${action.approvalId}\``,
        `- Type: \`${action.actionType}\``,
        `- Stage: \`${action.stageId || "unknown"}\``,
        `- Destination: \`${action.destination || "unknown"}\``,
        `- Packet: \`${action.packetPath}\` (${action.packetAuditStatus})`,
        `- Evidence template: \`${action.evidenceTemplatePath || "none"}\` (${action.evidenceTemplateAuditStatus})`,
        `- Approval flags true: ${action.approvalFlags.trueCount}/${action.approvalFlags.required}`,
        `- Approval command: \`${action.approvalCommand || "none"}\``
      );
      if (action.evidenceValidationCommand) {
        lines.push(`- Evidence validation: \`${action.evidenceValidationCommand}\``);
      }
      if (action.exactText) {
        lines.push("", "Exact action text:", "", fencedText(action.exactText), "");
      } else {
        lines.push("");
      }
    }
  }

  appendSummarySection(lines, "Packet Fixes Needed", manifest?.needsPacketFixes || [], "reasons");
  appendSummarySection(lines, "Blocked Future Actions", manifest?.blocked || [], "blockers");
  appendSummarySection(lines, "Not Ready", manifest?.notReady || [], "blockers");

  lines.push(
    "",
    "## Final Reminder",
    "",
    "Run `npm run external-action-workspace-audit` before review and `npm run external-action-approval -- <approved-packet.json>` before any human executes an external action."
  );

  return lines.join("\n");
}

function appendSummarySection(lines, title, items, detailKey) {
  if (!items.length) return;
  lines.push("", `## ${title}`, "");
  for (const item of items) {
    const details = Array.isArray(item[detailKey]) ? item[detailKey].join("; ") : "";
    lines.push(`- ${item.id || item.approvalId || item.stageId}: ${details || item.nextAction || item.status || "pending"}`);
  }
}

function fencedText(text) {
  return ["```text", String(text || "").replace(/```/g, "'''"), "```"].join("\n");
}

async function readJson(path) {
  try {
    return { ok: true, value: JSON.parse(await readFile(path, "utf8")) };
  } catch (error) {
    return { ok: false, reason: error.message };
  }
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
