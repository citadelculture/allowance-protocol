import { isCrediblePilotEvidence, summarizeReceiptRecords } from "./receiptStore.mjs";

export function buildPilotEvidenceReport(records = [], options = {}) {
  const requiredMerchantId = String(options.merchantId || "").trim();
  const minimumActiveAgents = Number(options.minimumActiveAgents || 1);
  const allRecords = requiredMerchantId
    ? records.filter((record) => merchantIdFor(record) === requiredMerchantId)
    : records;
  const summary = summarizeReceiptRecords(allRecords);
  const credibleRecords = allRecords.filter(isCrediblePilotEvidence);
  const credibleSummary = summarizeReceiptRecords(credibleRecords);
  const merchants = [...new Set(credibleRecords.map(merchantIdFor).filter(Boolean))];
  const merchantsWithAllowed2xx = merchants.filter((merchantId) =>
    credibleRecords.some((record) => merchantIdFor(record) === merchantId && isAllow(record) && is2xx(record.upstreamStatus))
  );
  const merchantsWithDenied = merchants.filter((merchantId) =>
    credibleRecords.some((record) => merchantIdFor(record) === merchantId && isDeny(record))
  );
  const pilotMerchants = merchantsWithAllowed2xx.filter((merchantId) => merchantsWithDenied.includes(merchantId));
  const activeAgents = [...new Set(credibleRecords.map((record) => record.receipt?.agentId || record.agentId).filter(Boolean))];
  const reasons = [];
  const warnings = [];

  if (allRecords.length === 0) reasons.push("No receipt records found");
  if (requiredMerchantId && !allRecords.length) reasons.push(`No receipt records found for merchant ${requiredMerchantId}`);
  if (credibleRecords.length === 0) reasons.push("No merchant-approved testnet or mainnet receipt evidence found");
  if (merchantsWithAllowed2xx.length === 0) reasons.push("No credible allowed receipt with successful upstream response");
  if (merchantsWithDenied.length === 0) reasons.push("No credible denied receipt proving the guard blocks unsafe intent");
  if (pilotMerchants.length === 0) reasons.push("No merchant has both credible allowed delivery and credible denied guard evidence");
  if (activeAgents.length < minimumActiveAgents) {
    reasons.push(`Credible pilot needs at least ${minimumActiveAgents} active agent${minimumActiveAgents === 1 ? "" : "s"}`);
  }
  if (credibleSummary.byUpstreamError && Object.keys(credibleSummary.byUpstreamError).length > 0) {
    warnings.push("Credible receipts include upstream errors");
  }

  return {
    valid: reasons.length === 0,
    reasons,
    warnings,
    summary,
    credibleSummary,
    acceptanceSignals: acceptanceSignalsFromSummary(summary),
    credibleAcceptanceSignals: {
      ...acceptanceSignalsFromSummary(credibleSummary),
      crediblePilotReceipts: credibleSummary.crediblePilotReceipts,
      activeAgents: activeAgents.length,
      merchantsWithAllowed2xx,
      merchantsWithDenied,
      pilotMerchants
    },
    required: {
      merchantId: requiredMerchantId || null,
      minimumActiveAgents
    }
  };
}

function acceptanceSignalsFromSummary(summary = {}) {
  return {
    hasAllowedReceipt: Boolean(summary.byDecision?.allow),
    hasDeniedReceipt: Boolean(summary.byDecision?.deny),
    hasSuccessfulUpstream: Object.keys(summary.byUpstreamStatus || {}).some((status) => status.startsWith("2")),
    hasUpstreamFailure: Object.keys(summary.byUpstreamError || {}).length > 0,
    blockedValueUsd: summary.blockedValueUsd || 0
  };
}

function merchantIdFor(record = {}) {
  return record.merchantId || record.receipt?.merchantId || "";
}

function isAllow(record = {}) {
  return (record.decision || record.receipt?.decision) === "allow";
}

function isDeny(record = {}) {
  return (record.decision || record.receipt?.decision) === "deny";
}

function is2xx(status) {
  return String(status || "").startsWith("2");
}
