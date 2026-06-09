import { access } from "node:fs/promises";
import { isCrediblePilotEvidence, loadReceiptRecords, summarizeReceiptRecords } from "./receiptStore.mjs";

export async function loadReceiptRecordsFromPaths(paths = []) {
  const records = [];
  const loadedPaths = [];
  const missingPaths = [];

  for (const path of paths.filter(Boolean)) {
    try {
      await access(path);
      records.push(...(await loadReceiptRecords(path)));
      loadedPaths.push(path);
    } catch {
      missingPaths.push(path);
    }
  }

  return {
    records,
    loadedPaths,
    missingPaths
  };
}

export function deriveLaunchMetrics(baseMetrics = {}, receiptRecords = [], options = {}) {
  const summary = summarizeReceiptRecords(receiptRecords);
  const crediblePilotRecords = receiptRecords.filter(isCrediblePilotEvidence);
  const agentIds = unique(receiptRecords.map((record) => record.receipt?.agentId).filter(Boolean));
  const credibleAgentIds = unique(crediblePilotRecords.map((record) => record.receipt?.agentId).filter(Boolean));
  const merchantsWithSuccessfulUpstream = unique(
    crediblePilotRecords
      .filter((record) => record.decision === "allow" && String(record.upstreamStatus || "").startsWith("2"))
      .map((record) => record.merchantId || record.receipt?.merchantId)
      .filter(Boolean)
  );
  const credibleMerchantsWithReceipts = unique(
    crediblePilotRecords
      .map((record) => record.merchantId || record.receipt?.merchantId)
      .filter(Boolean)
  );
  const deniedMerchants = new Set(
    crediblePilotRecords
      .filter((record) => record.decision === "deny")
      .map((record) => record.merchantId || record.receipt?.merchantId)
      .filter(Boolean)
  );
  const pilotMerchantsWithEvidence = merchantsWithSuccessfulUpstream.filter((merchantId) => deniedMerchants.has(merchantId));

  return {
    date: baseMetrics.date || new Date().toISOString().slice(0, 10),
    policyDecisions: Number(baseMetrics.policyDecisions || 0) + summary.total,
    approvedReceipts: Number(baseMetrics.approvedReceipts || 0) + Number(summary.byDecision.allow || 0),
    deniedReceipts: Number(baseMetrics.deniedReceipts || 0) + Number(summary.byDecision.deny || 0),
    blockedValueUsd: roundMoney(Number(baseMetrics.blockedValueUsd || 0) + Number(summary.blockedValueUsd || 0)),
    integratedMerchants: Number(baseMetrics.integratedMerchants || 0),
    activeAgents: Math.max(Number(baseMetrics.activeAgents || 0), agentIds.length),
    publicBuildDays: Number(baseMetrics.publicBuildDays || 0),
    pilotEvidence: {
      receiptLogs: options.loadedPaths || [],
      policyDecisions: summary.total,
      crediblePolicyDecisions: crediblePilotRecords.length,
      merchantsWithReceipts: Object.keys(summary.byMerchant),
      credibleMerchantsWithReceipts,
      merchantsWithSuccessfulUpstream,
      pilotMerchantsWithEvidence,
      activeAgentsWithCredibleEvidence: credibleAgentIds.length,
      upstreamFailures: Object.values(summary.byUpstreamError).reduce((sum, count) => sum + count, 0),
      topReasons: summary.topReasons,
      evidence: {
        byEnvironment: summary.byEvidenceEnvironment,
        byRail: summary.byEvidenceRail,
        merchantApprovedReceipts: summary.merchantApprovedReceipts,
        crediblePilotReceipts: summary.crediblePilotReceipts
      }
    }
  };
}

export function receiptLogPathsFromEnv(env = {}, fallbackPaths = []) {
  const envPaths = String(env.ALLOW_RECEIPT_LOGS || env.ALLOW_RECEIPT_LOG || "")
    .split(",")
    .map((path) => path.trim())
    .filter(Boolean);
  return envPaths.length ? envPaths : fallbackPaths;
}

function unique(values) {
  return [...new Set(values)];
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}
