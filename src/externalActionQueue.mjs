export const EXTERNAL_ACTION_QUEUE_ITEM_STATUSES = [
  "ready_for_approval",
  "needs_packet_fixes",
  "blocked",
  "not_ready",
  "complete"
];

export const EXTERNAL_ACTION_QUEUE_STATUSES = [
  "has_ready_actions",
  "needs_packet_fixes",
  "blocked_by_evidence",
  "not_ready",
  "empty",
  "complete"
];

export function buildExternalActionQueueReport(input = {}, options = {}) {
  const launchSequence = input.launchSequence || {};
  const stages = Array.isArray(launchSequence.stages) ? launchSequence.stages : [];
  const stageMap = new Map(stages.map((stage, index) => [stage.id, { ...stage, index }]));
  const currentStageId = launchSequence.currentStage || null;
  const actionPacks = normalizeActionPacks(input.actionPacks || []);
  const coveredStageIds = new Set(actionPacks.map((pack) => pack.stageId).filter(Boolean));
  const duplicateIds = duplicateApprovalIds(actionPacks);

  const packItems = actionPacks.flatMap((pack, packIndex) =>
    itemsForPack(pack, stageMap.get(pack.stageId), {
      duplicateIds,
      currentStageId,
      packIndex
    })
  );
  const placeholderItems = stages
    .map((stage, index) => ({ ...stage, index }))
    .filter((stage) => stage.externalActionType && !coveredStageIds.has(stage.id))
    .map((stage) => placeholderForStage(stage));
  const items = [...packItems, ...placeholderItems].sort(compareItems);
  const reasons = items.flatMap((item) => item.reasons.map((reason) => `${item.id}: ${reason}`));
  const warnings = items.flatMap((item) => item.warnings.map((warning) => `${item.id}: ${warning}`));
  const readyItems = items.filter((item) => item.status === "ready_for_approval");
  const primary = readyItems.find((item) => item.isCurrentStage) || readyItems[0] || null;

  return {
    generatedAt: options.generatedAt || new Date().toISOString(),
    valid: !items.some((item) => item.status === "not_ready"),
    status: queueStatus(items),
    readinessStatus: input.readiness?.status || launchSequence.readinessStatus || null,
    launchSequenceStatus: launchSequence.status || null,
    currentStage: launchSequence.currentStage || null,
    counts: {
      total: items.length,
      readyForApproval: readyItems.length,
      needsPacketFixes: items.filter((item) => item.status === "needs_packet_fixes").length,
      blocked: items.filter((item) => item.status === "blocked").length,
      notReady: items.filter((item) => item.status === "not_ready").length,
      complete: items.filter((item) => item.status === "complete").length
    },
    byActionType: countBy(items, "actionType"),
    byStatus: countBy(items, "status"),
    primaryAction: primary
      ? {
          id: primary.id,
          stageId: primary.stageId,
          actionType: primary.actionType,
          approvalId: primary.approvalId,
          title: primary.title,
          approvalCommand: primary.approvalCommand,
          nextAction: primary.nextAction
        }
      : null,
    items,
    reasons: unique(reasons),
    warnings: unique(warnings),
    nextAction: nextActionForQueue(items, primary),
    evidenceBoundary: {
      postsContent: false,
      sendsOutreach: false,
      signsWalletPayloads: false,
      deploysContracts: false,
      startsPilotTraffic: false,
      promotesMerchant: false,
      movesFunds: false,
      storesSecrets: false,
      marksApproved: false,
      requiresHumanApproval: true,
      finalExternalActionApprovalRequired: true
    }
  };
}

function normalizeActionPacks(actionPacks) {
  if (Array.isArray(actionPacks)) return actionPacks.filter(Boolean);
  if (!actionPacks || typeof actionPacks !== "object") return [];
  return Object.values(actionPacks).filter(Boolean);
}

function itemsForPack(pack, stage, options = {}) {
  const report = pack.report || {};
  const packets = Array.isArray(report.packets) ? report.packets : [];
  const packetItems = packets.length > 0
    ? packets.map((packet, index) => itemForPacket(pack, report, packet, stage, index, options))
    : [itemForMissingPacket(pack, report, stage, options)];
  return packetItems;
}

function itemForPacket(pack, report, packet, stage, index, options = {}) {
  const status = statusForPack(report, packet, stage);
  const duplicate = packet?.approvalId && options.duplicateIds?.has(packet.approvalId);
  const reasons = [
    ...stageReasons(stage, status),
    ...packReasons(report, status),
    duplicate ? `Duplicate approvalId ${packet.approvalId}` : null,
    packet?.status && packet.status !== "draft" ? "Queued external action packet must remain draft until approval time" : null
  ].filter(Boolean);
  const warnings = Array.isArray(report.warnings) ? report.warnings : [];

  return {
    id: `${pack.stageId || "stage"}:${packet?.approvalId || index}`,
    stageId: pack.stageId || null,
    stageTitle: stage?.title || pack.stageTitle || null,
    stageIndex: Number.isInteger(stage?.index) ? stage.index : Number.MAX_SAFE_INTEGER,
    packIndex: Number.isInteger(options.packIndex) ? options.packIndex : Number.MAX_SAFE_INTEGER,
    itemIndex: index,
    isCurrentStage: Boolean(stage?.id && stage.id === options.currentStageId),
    source: pack.source || null,
    actionType: packet?.actionType || pack.actionType || stage?.externalActionType || null,
    status: duplicate ? "not_ready" : status,
    approvalId: packet?.approvalId || null,
    packetStatus: packet?.status || null,
    title: packet?.action?.summary || pack.title || stage?.title || null,
    destination: packet?.action?.destination || null,
    channel: packet?.action?.channel || null,
    sourceCommand: pack.sourceCommand || null,
    approvalCommand: packet?.approvalId ? `npm run external-action-approval -- <approved-${slug(packet.approvalId)}.json>` : null,
    executionMode: packet?.action?.executionMode || null,
    automated: packet?.action?.automated === true,
    blockers: blockersForStage(stage),
    reasons: unique(reasons),
    warnings: unique(warnings),
    nextAction: nextActionForItem(status, pack, stage, packet),
    evidenceBoundary: itemBoundary(packet?.actionType || pack.actionType || stage?.externalActionType)
  };
}

function itemForMissingPacket(pack, report, stage, options = {}) {
  const status = stageIsBlocked(stage) ? "blocked" : report.valid === false ? "needs_packet_fixes" : "not_ready";
  const reasons = [
    ...stageReasons(stage, status),
    ...packReasons(report, status),
    status === "not_ready" ? "Action pack did not produce any draft packets" : null
  ].filter(Boolean);

  return {
    id: `${pack.stageId || "stage"}:missing_packet`,
    stageId: pack.stageId || null,
    stageTitle: stage?.title || pack.stageTitle || null,
    stageIndex: Number.isInteger(stage?.index) ? stage.index : Number.MAX_SAFE_INTEGER,
    packIndex: Number.isInteger(options.packIndex) ? options.packIndex : Number.MAX_SAFE_INTEGER,
    itemIndex: 0,
    isCurrentStage: Boolean(stage?.id && stage.id === options.currentStageId),
    source: pack.source || null,
    actionType: pack.actionType || stage?.externalActionType || null,
    status,
    approvalId: null,
    packetStatus: null,
    title: pack.title || stage?.title || "Missing external action packet",
    destination: null,
    channel: null,
    sourceCommand: pack.sourceCommand || null,
    approvalCommand: null,
    executionMode: null,
    automated: false,
    blockers: blockersForStage(stage),
    reasons: unique(reasons),
    warnings: unique(report.warnings || []),
    nextAction: nextActionForItem(status, pack, stage),
    evidenceBoundary: itemBoundary(pack.actionType || stage?.externalActionType)
  };
}

function placeholderForStage(stage) {
  const status = stage.status === "complete" ? "complete" : stage.status === "not_ready" ? "not_ready" : "blocked";
  return {
    id: `${stage.id}:pending_packet`,
    stageId: stage.id,
    stageTitle: stage.title,
    stageIndex: Number.isInteger(stage.index) ? stage.index : Number.MAX_SAFE_INTEGER,
    packIndex: Number.MAX_SAFE_INTEGER,
    itemIndex: 0,
    isCurrentStage: false,
    source: "launch_sequence",
    actionType: stage.externalActionType || null,
    status,
    approvalId: null,
    packetStatus: null,
    title: stage.title,
    destination: null,
    channel: null,
    sourceCommand: firstCommand(stage.commands),
    approvalCommand: status === "complete" ? null : "npm run external-action-approval -- <approved-packet.json>",
    executionMode: null,
    automated: false,
    blockers: blockersForStage(stage),
    reasons: stageReasons(stage, status),
    warnings: [],
    nextAction: status === "complete" ? "Complete" : stage.nextAction || "Wait for required evidence before preparing this action packet",
    evidenceBoundary: itemBoundary(stage.externalActionType)
  };
}

function statusForPack(report, packet, stage) {
  if (stage?.status === "not_ready") return "not_ready";
  if (stageIsBlocked(stage)) return "blocked";
  if (report.valid === false) return "needs_packet_fixes";
  if (!packet || packet.status !== "draft") return "not_ready";
  if (stage?.status === "complete") return "complete";
  return "ready_for_approval";
}

function stageIsBlocked(stage) {
  return ["blocked", "waiting_for_evidence"].includes(String(stage?.status || ""));
}

function stageReasons(stage, status) {
  if (!stage) return status === "not_ready" ? ["Launch sequence stage is missing"] : [];
  if (status === "complete") return [];
  const reasons = [];
  if (stage.status === "not_ready") reasons.push(...(stage.openGates || []).map((gate) => `Open readiness gate ${gate}`));
  if (stageIsBlocked(stage)) reasons.push(...blockersForStage(stage));
  return unique(reasons);
}

function packReasons(report, status) {
  if (status === "blocked" || status === "complete") return [];
  return Array.isArray(report.reasons) ? report.reasons : [];
}

function blockersForStage(stage) {
  const blockers = Array.isArray(stage?.blockers) ? stage.blockers : [];
  const openGates = Array.isArray(stage?.openGates) ? stage.openGates.map((gate) => `Open readiness gate ${gate}`) : [];
  return unique([...blockers, ...openGates]);
}

function nextActionForItem(status, pack, stage, packet = null) {
  if (status === "ready_for_approval") {
    return packet?.approvalId
      ? `Review ${packet.approvalId}, fill approval fields, then run external-action-approval before any human executes it`
      : "Review the draft packet and run external-action-approval before any human executes it";
  }
  if (status === "needs_packet_fixes") return pack.report?.nextAction || pack.nextAction || "Fix the action packet before approval";
  if (status === "blocked") return stage?.nextAction || "Wait for evidence gates before preparing this external action";
  if (status === "complete") return "Complete";
  return "Fix queue or readiness errors before approval";
}

function duplicateApprovalIds(actionPacks) {
  const seen = new Set();
  const duplicates = new Set();
  for (const pack of actionPacks) {
    for (const packet of pack.report?.packets || []) {
      if (!packet?.approvalId) continue;
      if (seen.has(packet.approvalId)) duplicates.add(packet.approvalId);
      seen.add(packet.approvalId);
    }
  }
  return duplicates;
}

function queueStatus(items) {
  if (items.length === 0) return "empty";
  if (items.some((item) => item.status === "not_ready")) return "not_ready";
  if (items.some((item) => item.status === "ready_for_approval")) return "has_ready_actions";
  if (items.some((item) => item.status === "needs_packet_fixes")) return "needs_packet_fixes";
  if (items.some((item) => item.status === "blocked")) return "blocked_by_evidence";
  return "complete";
}

function nextActionForQueue(items, primary) {
  if (primary) return primary.nextAction;
  const fix = items.find((item) => item.status === "needs_packet_fixes");
  if (fix) return fix.nextAction;
  const blocked = items.find((item) => item.status === "blocked");
  if (blocked) return blocked.nextAction;
  const notReady = items.find((item) => item.status === "not_ready");
  if (notReady) return notReady.nextAction;
  return "No queued external actions need approval right now";
}

function compareItems(a, b) {
  if (a.stageIndex !== b.stageIndex) return a.stageIndex - b.stageIndex;
  if (a.packIndex !== b.packIndex) return a.packIndex - b.packIndex;
  if (a.itemIndex !== b.itemIndex) return a.itemIndex - b.itemIndex;
  return String(a.approvalId || a.id).localeCompare(String(b.approvalId || b.id));
}

function itemBoundary(actionType) {
  return {
    postsContent: actionType === "x_post" ? false : false,
    sendsOutreach: actionType === "merchant_outreach" ? false : false,
    signsWalletPayloads: actionType === "controller_policy_signature" ? false : false,
    deploysContracts: actionType === "contract_deployment" ? false : false,
    startsPilotTraffic: actionType === "live_pilot" ? false : false,
    promotesMerchant: actionType === "merchant_promotion" ? false : false,
    movesFunds: false,
    storesSecrets: false,
    approvesExternalAction: false,
    requiresHumanApproval: true
  };
}

function countBy(items, field) {
  return items.reduce((acc, item) => {
    const value = item[field] || "unknown";
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function firstCommand(commands) {
  return Array.isArray(commands) ? commands[0] || null : null;
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
