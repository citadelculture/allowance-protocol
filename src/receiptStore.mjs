import { mkdir, readFile, appendFile } from "node:fs/promises";
import { dirname } from "node:path";

export const RECEIPT_EVIDENCE_ENVIRONMENTS = ["local", "testnet", "mainnet"];
export const CREDIBLE_PILOT_ENVIRONMENTS = new Set(["testnet", "mainnet"]);

export function createMemoryReceiptStore(initialRecords = []) {
  const records = initialRecords;
  return {
    records,
    async record(entry) {
      records.push(normalizeReceiptRecord(entry));
    }
  };
}

export function createJsonlReceiptStore(path) {
  if (!path) throw new Error("createJsonlReceiptStore requires a path");

  return {
    path,
    async record(entry) {
      await mkdir(dirname(path), { recursive: true });
      await appendFile(path, `${JSON.stringify(normalizeReceiptRecord(entry))}\n`, "utf8");
    }
  };
}

export async function loadReceiptRecords(path) {
  const raw = await readFile(path, "utf8");
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export function summarizeReceiptRecords(records = []) {
  const summary = records.reduce(
    (acc, record) => {
      const receipt = record.receipt || {};
      const decision = record.decision || receipt.decision || "unknown";
      const merchantId = record.merchantId || receipt.merchantId || "unknown";
      const reason = (record.reasons || [])[0] || "none";
      const amount = Number(receipt.amountUsd || record.amountUsd || 0);
      const evidence = normalizeReceiptEvidence(record.evidence);

      acc.total += 1;
      acc.byDecision[decision] = (acc.byDecision[decision] || 0) + 1;
      acc.byMerchant[merchantId] = (acc.byMerchant[merchantId] || 0) + 1;
      acc.byEvidenceEnvironment[evidence.environment] = (acc.byEvidenceEnvironment[evidence.environment] || 0) + 1;
      acc.byEvidenceRail[evidence.rail] = (acc.byEvidenceRail[evidence.rail] || 0) + 1;
      if (evidence.merchantApproved) acc.merchantApprovedReceipts += 1;
      if (isCrediblePilotEvidence({ evidence })) acc.crediblePilotReceipts += 1;
      acc.topReasons[reason] = (acc.topReasons[reason] || 0) + 1;
      if (decision === "deny") acc.blockedValueUsd += amount;
      if (record.upstreamStatus) {
        acc.byUpstreamStatus[String(record.upstreamStatus)] =
          (acc.byUpstreamStatus[String(record.upstreamStatus)] || 0) + 1;
      }
      if (record.upstreamError) {
        acc.byUpstreamError[record.upstreamError] = (acc.byUpstreamError[record.upstreamError] || 0) + 1;
      }
      return acc;
    },
    {
      total: 0,
      byDecision: {},
      byMerchant: {},
      byEvidenceEnvironment: {},
      byEvidenceRail: {},
      topReasons: {},
      byUpstreamStatus: {},
      byUpstreamError: {},
      merchantApprovedReceipts: 0,
      crediblePilotReceipts: 0,
      blockedValueUsd: 0
    }
  );

  return {
    ...summary,
    blockedValueUsd: roundMoney(summary.blockedValueUsd)
  };
}

export function normalizeReceiptRecord(entry = {}) {
  const receipt = entry.receipt || {};
  return {
    recordedAt: entry.recordedAt || new Date().toISOString(),
    source: entry.source || "allow",
    merchantId: entry.merchantId || receipt.merchantId || null,
    decision: entry.decision || receipt.decision || null,
    route: entry.route || null,
    upstreamStatus: entry.upstreamStatus || null,
    upstreamError: entry.upstreamError || null,
    reasons: entry.reasons || [],
    warnings: entry.warnings || [],
    evidence: normalizeReceiptEvidence(entry.evidence || entry),
    receipt
  };
}

export function normalizeReceiptEvidence(evidence = {}) {
  evidence = evidence || {};
  const environment = normalizeEvidenceEnvironment(evidence.environment || evidence.env || "local");
  return {
    environment,
    merchantApproved: Boolean(evidence.merchantApproved),
    rail: evidence.rail || evidence.paymentRail || "unknown",
    network: evidence.network || "",
    settlement: evidence.settlement || "",
    label: evidence.label || ""
  };
}

export function isCrediblePilotEvidence(record = {}) {
  const evidence = normalizeReceiptEvidence(record.evidence);
  return CREDIBLE_PILOT_ENVIRONMENTS.has(evidence.environment) && evidence.merchantApproved;
}

function normalizeEvidenceEnvironment(value) {
  const environment = String(value || "local").toLowerCase();
  return RECEIPT_EVIDENCE_ENVIRONMENTS.includes(environment) ? environment : "local";
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}
