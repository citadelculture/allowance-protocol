import { createHash } from "node:crypto";
import { buildExternalActionQueueReport } from "./externalActionQueue.mjs";

export const EXTERNAL_ACTION_WORKSPACE_STATUSES = [
  "ready_for_review",
  "no_ready_actions",
  "invalid_queue"
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

export function buildExternalActionWorkspaceReport(input = {}, options = {}) {
  const generatedAt = options.generatedAt || new Date().toISOString();
  const outputDir = options.outputDir || "work/external-action-workspace";
  const packetDir = options.packetDir || "packets";
  const queue = input.queue || buildExternalActionQueueReport(input, { generatedAt });
  const packetByApprovalId = packetsByApprovalId(input.actionPacks || []);
  const readyItems = (queue.items || []).filter((item) => item.status === "ready_for_approval");
  const reasons = [];
  const warnings = [...(queue.warnings || [])];

  const packetFiles = readyItems.map((item, index) => {
    const packet = packetByApprovalId.get(item.approvalId);
    if (!packet) reasons.push(`${item.id}: Missing draft packet for ${item.approvalId}`);
    if (packet?.status && packet.status !== "draft") {
      reasons.push(`${item.id}: Workspace packet must remain draft until final approval`);
    }
    const trueFlags = APPROVAL_FLAGS.filter((flag) => packet?.approvals?.[flag] === true);
    if (trueFlags.length > 0) {
      reasons.push(`${item.id}: Draft workspace packet must not prefill approval flags: ${trueFlags.join(", ")}`);
    }

    const content = stringifyJson(packet || {});
    const path = `${packetDir}/${String(index + 1).padStart(2, "0")}-${slug(item.approvalId || item.id)}.draft.json`;
    return {
      kind: "draft_packet",
      path,
      approvalId: item.approvalId,
      stageId: item.stageId,
      actionType: item.actionType,
      title: item.title,
      destination: item.destination,
      channel: item.channel,
      status: item.status,
      sha256: sha256(content),
      bytes: Buffer.byteLength(content, "utf8"),
      approvalCommand: `npm run external-action-approval -- ${outputDir}/${path}`,
      evidenceTemplatePath: evidenceTemplatePathFor(index, item),
      evidenceCommand: evidenceCommandFor(item.actionType),
      content
    };
  });
  const evidenceFiles = readyItems
    .map((item, index) => {
      const packet = packetByApprovalId.get(item.approvalId);
      const template = executionEvidenceTemplateFor(item, packet);
      if (!template) return null;
      const content = stringifyJson(template);
      const path = evidenceTemplatePathFor(index, item);
      return {
        kind: "execution_evidence_template",
        path,
        approvalId: item.approvalId,
        stageId: item.stageId,
        actionType: item.actionType,
        title: item.title,
        status: "template_only",
        sha256: sha256(content),
        bytes: Buffer.byteLength(content, "utf8"),
        validationCommand: evidenceValidationCommandFor(item.actionType, `${outputDir}/${path}`),
        content
      };
    })
    .filter(Boolean);

  const manifest = buildManifest({
    generatedAt,
    outputDir,
    queue,
    packetFiles,
    evidenceFiles,
    readyItems,
    reasons,
    warnings
  });
  const checklist = buildChecklist({ generatedAt, outputDir, queue, packetFiles, evidenceFiles });
  const manifestContent = stringifyJson(manifest);
  const checklistContent = `${checklist}\n`;
  const files = [
    {
      kind: "manifest",
      path: "manifest.json",
      sha256: sha256(manifestContent),
      bytes: Buffer.byteLength(manifestContent, "utf8"),
      content: manifestContent
    },
    {
      kind: "checklist",
      path: "REVIEW_CHECKLIST.md",
      sha256: sha256(checklistContent),
      bytes: Buffer.byteLength(checklistContent, "utf8"),
      content: checklistContent
    },
    ...packetFiles,
    ...evidenceFiles
  ];

  const valid = queue.valid !== false && reasons.length === 0;
  return {
    generatedAt,
    valid,
    status: !queue.valid ? "invalid_queue" : readyItems.length > 0 ? "ready_for_review" : "no_ready_actions",
    outputDir,
    counts: {
      files: files.length,
      draftPackets: packetFiles.length,
      evidenceTemplates: evidenceFiles.length,
      readyForApproval: readyItems.length,
      needsPacketFixes: queue.counts?.needsPacketFixes || 0,
      blocked: queue.counts?.blocked || 0,
      notReady: queue.counts?.notReady || 0
    },
    manifestPath: `${outputDir}/manifest.json`,
    checklistPath: `${outputDir}/REVIEW_CHECKLIST.md`,
    packetDir: `${outputDir}/${packetDir}`,
    primaryAction: queue.primaryAction || null,
    files,
    manifest,
    checklist,
    reasons: unique(reasons),
    warnings: unique(warnings),
    nextAction: nextActionForWorkspace(queue, packetFiles),
    evidenceBoundary: {
      writesLocalDraftFiles: true,
      writesLocalEvidenceTemplates: true,
      postsContent: false,
      sendsOutreach: false,
      signsWalletPayloads: false,
      deploysContracts: false,
      startsPilotTraffic: false,
      promotesMerchant: false,
      movesFunds: false,
      storesSecrets: false,
      approvesExternalAction: false,
      requiresHumanApproval: true,
      finalExternalActionApprovalRequired: true
    }
  };
}

export function publicExternalActionWorkspaceReport(report = {}) {
  return {
    ...report,
    files: (report.files || []).map(({ content, ...file }) => file),
    checklist: undefined,
    manifest: report.manifest
  };
}

function buildManifest({ generatedAt, outputDir, queue, packetFiles, evidenceFiles, readyItems, reasons, warnings }) {
  return {
    artifact: "allow_external_action_workspace",
    generatedAt,
    outputDir,
    queue: {
      status: queue.status,
      valid: queue.valid,
      readinessStatus: queue.readinessStatus,
      launchSequenceStatus: queue.launchSequenceStatus,
      currentStage: queue.currentStage,
      counts: queue.counts,
      primaryAction: queue.primaryAction,
      nextAction: queue.nextAction
    },
    draftPackets: packetFiles.map(({ content, ...file }) => file),
    executionEvidenceTemplates: evidenceFiles.map(({ content, ...file }) => file),
    needsPacketFixes: (queue.items || [])
      .filter((item) => item.status === "needs_packet_fixes")
      .map(summaryForItem),
    blocked: (queue.items || [])
      .filter((item) => item.status === "blocked")
      .map(summaryForItem),
    notReady: (queue.items || [])
      .filter((item) => item.status === "not_ready")
      .map(summaryForItem),
    readyItems: readyItems.map(summaryForItem),
    reasons: unique(reasons),
    warnings: unique(warnings),
    instructions: [
      "Review each draft packet before editing it.",
      "To approve a packet, set status to approved, fill approvedBy and approvedAt, and set every approval flag to true.",
      "Run npm run external-action-approval against the edited packet before any human performs the action.",
      "After the human performs the exact action, fill the matching evidence template and collect post-execution evidence with the matching validator.",
      "Do not paste private keys, seed phrases, API secrets, or bearer tokens into any workspace file."
    ],
    evidenceBoundary: {
      writesLocalDraftFiles: true,
      writesLocalEvidenceTemplates: true,
      postsContent: false,
      sendsOutreach: false,
      signsWalletPayloads: false,
      deploysContracts: false,
      startsPilotTraffic: false,
      promotesMerchant: false,
      movesFunds: false,
      storesSecrets: false,
      approvesExternalAction: false
    }
  };
}

function buildChecklist({ generatedAt, outputDir, queue, packetFiles, evidenceFiles }) {
  const lines = [
    "# Allow External Action Review Checklist",
    "",
    `Generated: ${generatedAt}`,
    `Workspace: ${outputDir}`,
    `Queue status: ${queue.status}`,
    "",
    "## Before Any External Action",
    "",
    "- Confirm the exact text, destination, account, wallet, or endpoint.",
    "- Edit only the copied draft packet after review.",
    "- Set `status` to `approved`, fill `approvedBy` and `approvedAt`, and set every approval flag to `true`.",
    "- Run `npm run external-action-approval -- <approved-packet.json>` and keep the passing output.",
    "- Have a human perform exactly the approved action.",
    "- Fill the matching evidence template and run the post-execution evidence validator before updating state or making claims.",
    "- Never add private keys, seed phrases, bearer tokens, API secrets, or passwords.",
    "",
    "## Draft Packets",
    ""
  ];

  if (packetFiles.length === 0) {
    lines.push("- No packets are ready for review.");
  } else {
    for (const file of packetFiles) {
      lines.push(`- ${file.approvalId}: \`${file.path}\``);
      lines.push(`  Approval: \`${file.approvalCommand}\``);
      if (file.evidenceTemplatePath) lines.push(`  Evidence template: \`${file.evidenceTemplatePath}\``);
      if (file.evidenceCommand) lines.push(`  Evidence: \`${file.evidenceCommand}\``);
    }
  }

  if (evidenceFiles.length > 0) {
    lines.push("", "## Evidence Templates", "");
    for (const file of evidenceFiles) {
      lines.push(`- ${file.approvalId}: \`${file.path}\``);
    }
  }

  const needsFixes = (queue.items || []).filter((item) => item.status === "needs_packet_fixes");
  const blocked = (queue.items || []).filter((item) => item.status === "blocked");
  if (needsFixes.length > 0) {
    lines.push("", "## Packet Fixes Needed", "");
    for (const item of needsFixes) lines.push(`- ${item.id}: ${item.reasons.join("; ") || item.nextAction}`);
  }
  if (blocked.length > 0) {
    lines.push("", "## Blocked Future Actions", "");
    for (const item of blocked) lines.push(`- ${item.id}: ${item.blockers.join("; ") || item.nextAction}`);
  }

  return lines.join("\n");
}

function executionEvidenceTemplateFor(item, packet) {
  if (!packet) return null;
  if (item.actionType === "x_post") return xPostExecutionTemplate(item, packet);
  if (item.actionType === "merchant_outreach") return outreachExecutionTemplate(item, packet);
  return null;
}

function xPostExecutionTemplate(item, packet) {
  if (!packet) return null;
  const post = packet.payload?.post || {};
  return {
    evidenceId: `${item.approvalId}_execution`,
    generatedAt: "",
    executionStatus: "posted",
    approvalRef: `external-action:${item.approvalId}`,
    approvalPacket: packet,
    post,
    posted: {
      postedAt: "",
      postedBy: "",
      accountHandle: packet.action?.destination || item.destination || "",
      postUrl: "",
      exactText: packet.action?.exactText || post.text || "",
      humanExecuted: false,
      accountOwnerApproved: false,
      automationUsed: false
    },
    proof: {
      type: "post_permalink",
      ref: "",
      capturedAt: "",
      redacted: false
    },
    notes: [
      "Template only. Fill after a human posts the final approved x_post packet.",
      "This must fail until approvalPacket is final approved and posted/proof fields are complete.",
      "Do not include account cookies, private DMs, bearer tokens, API keys, seed phrases, or wallet secrets."
    ]
  };
}

function outreachExecutionTemplate(item, packet) {
  if (!packet) return null;
  const draft = packet.payload?.outreachDraft || {};
  return {
    evidenceId: `${item.approvalId}_execution`,
    generatedAt: "",
    outreachStatus: "sent",
    approvalRef: `external-action:${item.approvalId}`,
    candidateId: draft.candidateId || "",
    prospectId: draft.prospectId || "",
    approvalPacket: packet,
    outreachDraft: draft,
    sent: {
      sentAt: "",
      sentBy: "",
      channel: packet.action?.channel || draft.channel || item.channel || "",
      destination: packet.action?.destination || draft.destination || item.destination || "",
      subject: packet.action?.subject || draft.subject || "",
      exactText: packet.action?.exactText || draft.message || "",
      humanExecuted: false,
      accountOwnerApproved: false,
      automationUsed: false
    },
    proof: {
      type: "manual_log",
      ref: "",
      capturedAt: "",
      redacted: false
    },
    response: {
      status: "none",
      receivedAt: "",
      summary: "",
      scheduledAt: "",
      interviewId: ""
    },
    links: {
      candidateId: draft.candidateId || "",
      prospectId: draft.prospectId || "",
      interviewId: ""
    },
    notes: [
      "Template only. Fill after a human sends the final approved merchant_outreach packet.",
      "This must fail until approvalPacket is final approved and sent/proof fields are complete.",
      "This evidence record does not count as an interview or pilot integration."
    ]
  };
}

function packetsByApprovalId(actionPacks) {
  const packets = new Map();
  for (const pack of normalizeActionPacks(actionPacks)) {
    for (const packet of pack.report?.packets || []) {
      if (packet?.approvalId && !packets.has(packet.approvalId)) packets.set(packet.approvalId, packet);
    }
  }
  return packets;
}

function normalizeActionPacks(actionPacks) {
  if (Array.isArray(actionPacks)) return actionPacks.filter(Boolean);
  if (!actionPacks || typeof actionPacks !== "object") return [];
  return Object.values(actionPacks).filter(Boolean);
}

function summaryForItem(item) {
  return {
    id: item.id,
    stageId: item.stageId,
    actionType: item.actionType,
    approvalId: item.approvalId,
    status: item.status,
    title: item.title,
    destination: item.destination,
    channel: item.channel,
    reasons: item.reasons,
    blockers: item.blockers,
    nextAction: item.nextAction
  };
}

function nextActionForWorkspace(queue, packetFiles) {
  if (packetFiles.length > 0) {
    return `Review ${packetFiles[0].path}, fill approval fields in a copy, then run external-action-approval before execution.`;
  }
  return queue.nextAction || "No ready draft packets are available for review.";
}

function evidenceCommandFor(actionType) {
  if (actionType === "x_post") return "npm run x-post-execution-evidence -- ops/x_post_execution_template.json";
  if (actionType === "merchant_outreach") return "npm run outreach-execution-evidence -- ops/outreach_execution_template.json";
  if (actionType === "controller_policy_signature") return "npm run controller-signing-execution-evidence -- ops/controller_signing_execution_template.json";
  if (actionType === "live_pilot") return "npm run pilot-traffic-execution-evidence -- ops/pilot_traffic_execution_template.json <receipt-log-path>";
  return null;
}

function evidenceValidationCommandFor(actionType, path) {
  if (actionType === "x_post") return `npm run x-post-execution-evidence -- ${path}`;
  if (actionType === "merchant_outreach") return `npm run outreach-execution-evidence -- ${path}`;
  if (actionType === "controller_policy_signature") return `npm run controller-signing-execution-evidence -- ${path}`;
  if (actionType === "live_pilot") return `npm run pilot-traffic-execution-evidence -- ${path} <receipt-log-path>`;
  return null;
}

function evidenceTemplatePathFor(index, item) {
  const suffix = item.actionType === "x_post"
    ? "x-post-execution"
    : item.actionType === "merchant_outreach"
      ? "outreach-execution"
      : "execution";
  return `evidence/${String(index + 1).padStart(2, "0")}-${slug(item.approvalId || item.id)}.${suffix}.template.json`;
}

function stringifyJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256(content) {
  return `0x${createHash("sha256").update(content).digest("hex")}`;
}

function slug(value) {
  const text = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return text || "external-action";
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
