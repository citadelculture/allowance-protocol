import { buildPilotEvidenceReport } from "./pilotEvidence.mjs";
import { buildPilotTrafficExecutionEvidenceReport } from "./pilotTrafficExecutionEvidence.mjs";

export const PIPELINE_INTEGRATION_STATUSES = ["not_started", "testing", "integrated"];

export async function buildPilotIntegrationStateReport(input = {}, options = {}) {
  const prospects = Array.isArray(input.prospects) ? input.prospects : [];
  const directory = input.merchantDirectory || {};
  const merchants = Array.isArray(directory.merchants) ? directory.merchants : [];
  const executionRecords = recordsFromInput(input.executionRecords ?? input.records);
  const receiptRecords = Array.isArray(input.receiptRecords) ? input.receiptRecords : [];
  const receiptSourceErrors = Array.isArray(options.receiptSourceErrors)
    ? options.receiptSourceErrors
    : Array.isArray(options.sourceErrors)
      ? options.sourceErrors
      : [];
  const reasons = [];
  const warnings = [];
  const directoryMerchantIds = new Set(merchants.map((merchant) => merchant.id).filter(Boolean));
  const executionEntries = await validateExecutionRecords(executionRecords, receiptRecords, {
    ...options,
    sourceErrors: receiptSourceErrors
  });

  for (const entry of executionEntries) {
    reasons.push(...entry.reasons.map((reason) => `${entry.evidenceId}: ${reason}`));
    warnings.push(...entry.warnings.map((warning) => `${entry.evidenceId}: ${warning}`));
    if (entry.valid && directoryMerchantIds.size > 0 && entry.merchantId && !directoryMerchantIds.has(entry.merchantId)) {
      warnings.push(`${entry.evidenceId}: execution merchantId is not present in merchant directory`);
    }
  }

  const validExecutions = executionEntries.filter((entry) => entry.valid);
  const executionCoverage = coverageFromExecutions(validExecutions);
  const claimedMerchantIds = claimedMerchantIdsFromState(prospects, merchants);
  const pilotEvidenceByMerchant = pilotEvidenceReportsFor(
    unique([...claimedMerchantIds, ...validExecutions.map((entry) => entry.merchantId).filter(Boolean)]),
    receiptRecords,
    options
  );
  const prospectsReport = prospects.map((prospect) =>
    prospectStateReport(prospect, {
      directoryMerchantIds,
      executionCoverage,
      pilotEvidenceByMerchant
    })
  );
  const directoryReport = merchants.map((merchant) =>
    merchantStateReport(merchant, {
      executionCoverage,
      pilotEvidenceByMerchant
    })
  );

  for (const prospect of prospectsReport) {
    reasons.push(...prospect.reasons.map((reason) => `${prospect.prospectId}: ${reason}`));
    warnings.push(...prospect.warnings.map((warning) => `${prospect.prospectId}: ${warning}`));
  }
  for (const merchant of directoryReport) {
    reasons.push(...merchant.reasons.map((reason) => `${merchant.merchantId}: ${reason}`));
    warnings.push(...merchant.warnings.map((warning) => `${merchant.merchantId}: ${warning}`));
  }

  const stateClaimsRequireEvidence =
    prospectsReport.some((prospect) => prospect.current.integrationStatus === "integrated") ||
    directoryReport.some((merchant) => merchant.current.status === "live");
  if (stateClaimsRequireEvidence && receiptSourceErrors.length > 0) {
    reasons.push(...receiptSourceErrors.map((reason) => `Receipt source: ${reason}`));
  }

  return {
    generatedAt: new Date().toISOString(),
    valid: reasons.length === 0,
    status: statusForReport({ reasons, validExecutions, prospectsReport, directoryReport }),
    counts: {
      prospects: prospects.length,
      merchants: merchants.length,
      executionRecords: executionEntries.length,
      validExecutionRecords: validExecutions.length,
      invalidExecutionRecords: executionEntries.length - validExecutions.length,
      integratedProspects: prospectsReport.filter((prospect) => prospect.current.integrationStatus === "integrated").length,
      liveMerchants: directoryReport.filter((merchant) => merchant.current.status === "live").length,
      merchantsWithAllowedExecution: [...executionCoverage.values()].filter((coverage) => coverage.hasAllowedDeliveryExecution).length,
      merchantsWithDeniedExecution: [...executionCoverage.values()].filter((coverage) => coverage.hasDeniedGuardExecution).length,
      merchantsWithFullPilotEvidence: [...pilotEvidenceByMerchant.values()].filter((report) => report.valid).length
    },
    byIntegrationStatus: statusCounts(prospectsReport.map((prospect) => prospect.current.integrationStatus)),
    byDirectoryStatus: statusCounts(directoryReport.map((merchant) => merchant.current.status)),
    executionEntries,
    prospects: prospectsReport,
    merchants: directoryReport,
    coverageByMerchant: Object.fromEntries(
      [...new Set([...executionCoverage.keys(), ...pilotEvidenceByMerchant.keys()])]
        .sort()
        .map((merchantId) => [merchantId, coverageSummary(merchantId, executionCoverage, pilotEvidenceByMerchant)])
    ),
    reasons: unique(reasons),
    warnings: unique(warnings),
    nextAction: nextActionForReport({ reasons, validExecutions, prospectsReport, directoryReport }),
    evidenceBoundary: {
      startsPilotTraffic: false,
      approvesExternalAction: false,
      movesFunds: false,
      signsWalletPayloads: false,
      storesSecrets: false,
      countsAsCompletedPilot: false,
      approvesPublicClaims: false,
      marksProspectIntegrated: false,
      marksMerchantLive: false,
      marksTokenReady: false
    }
  };
}

async function validateExecutionRecords(records, receiptRecords, options) {
  const entries = [];
  const seenEvidenceIds = new Set();

  for (const [index, record] of records.entries()) {
    const report = await buildPilotTrafficExecutionEvidenceReport(record, {
      receiptRecords,
      sourceErrors: options.sourceErrors || [],
      approvalOptions: options.approvalOptions || {}
    });
    const evidenceId = report.evidenceId || record?.evidenceId || `executionRecord[${index}]`;
    const entryReasons = [...report.reasons];
    if (seenEvidenceIds.has(evidenceId)) entryReasons.push(`Duplicate evidenceId: ${evidenceId}`);
    if (evidenceId) seenEvidenceIds.add(evidenceId);

    entries.push({
      index,
      evidenceId,
      valid: report.valid && entryReasons.length === 0,
      status: report.status,
      merchantId: report.merchantId,
      pilotStep: report.pilotStep,
      approvalRef: report.approvalRef,
      receiptIds: report.receipts?.matchedReceiptIds || [],
      receiptLogPath: report.receipts?.receiptLogPath || null,
      reasons: unique(entryReasons),
      warnings: report.warnings,
      evidenceBoundary: report.evidenceBoundary
    });
  }

  return entries;
}

function prospectStateReport(prospect, context) {
  const reasons = [];
  const warnings = [];
  const statusValue = String(prospect.integrationStatus || "not_started");
  const integrationStatus = PIPELINE_INTEGRATION_STATUSES.includes(statusValue) ? statusValue : "not_started";
  const merchantId = merchantIdForProspect(prospect);
  const coverage = coverageSummary(merchantId, context.executionCoverage, context.pilotEvidenceByMerchant);

  if (!PIPELINE_INTEGRATION_STATUSES.includes(statusValue)) reasons.push("Invalid integrationStatus");
  if (integrationStatus === "integrated") {
    requireText(reasons, merchantId, "merchantId");
    if (merchantId && context.directoryMerchantIds.size > 0 && !context.directoryMerchantIds.has(merchantId)) {
      reasons.push(`integrationStatus=integrated references unknown merchantId ${merchantId}`);
    }
    requireCompletedPilotEvidence(reasons, "integrationStatus=integrated", coverage);
  }
  if (integrationStatus === "testing" && merchantId && coverage.evidenceIds.length === 0) {
    warnings.push("integrationStatus=testing has no validated pilot traffic execution evidence yet");
  }

  return {
    prospectId: prospect.id || null,
    name: prospect.name || null,
    current: {
      integrationStatus,
      merchantId: merchantId || null
    },
    evidence: coverage,
    projected: {
      ...prospect,
      integrationStatus
    },
    reasons,
    warnings
  };
}

function merchantStateReport(merchant, context) {
  const reasons = [];
  const warnings = [];
  const merchantId = String(merchant.id || "").trim();
  const status = String(merchant.status || "unknown");
  const coverage = coverageSummary(merchantId, context.executionCoverage, context.pilotEvidenceByMerchant);

  if (status === "live") {
    requireCompletedPilotEvidence(reasons, "status=live", coverage);
  }
  if (status === "pilot_ready" && coverage.evidenceIds.length > 0 && !coverage.hasFullPilotEvidence) {
    warnings.push("pilot_ready merchant has partial pilot execution evidence but not a full pilot-report pass yet");
  }

  return {
    merchantId: merchantId || null,
    name: merchant.name || null,
    current: {
      status
    },
    evidence: coverage,
    reasons,
    warnings
  };
}

function requireCompletedPilotEvidence(reasons, label, coverage) {
  if (!coverage.merchantId) return;
  if (!coverage.hasAllowedDeliveryExecution) {
    reasons.push(`${label} requires valid allowed_delivery pilot traffic execution evidence`);
  }
  if (!coverage.hasDeniedGuardExecution) {
    reasons.push(`${label} requires valid denied_guard pilot traffic execution evidence`);
  }
  if (!coverage.hasFullPilotEvidence) {
    reasons.push(`${label} requires pilot-report evidence with allowed and denied merchant-approved receipts`);
  }
}

function coverageFromExecutions(entries) {
  const coverage = new Map();
  for (const entry of entries) {
    if (!entry.merchantId) continue;
    if (!coverage.has(entry.merchantId)) {
      coverage.set(entry.merchantId, {
        merchantId: entry.merchantId,
        steps: new Set(),
        evidenceIds: [],
        receiptIds: []
      });
    }
    const item = coverage.get(entry.merchantId);
    if (entry.pilotStep) item.steps.add(entry.pilotStep);
    item.evidenceIds.push(entry.evidenceId);
    item.receiptIds.push(...entry.receiptIds);
  }
  return coverage;
}

function pilotEvidenceReportsFor(merchantIds, receiptRecords, options) {
  return new Map(
    merchantIds.map((merchantId) => [
      merchantId,
      buildPilotEvidenceReport(receiptRecords, {
        merchantId,
        minimumActiveAgents: options.minimumActiveAgents || 1
      })
    ])
  );
}

function coverageSummary(merchantId, executionCoverage, pilotEvidenceByMerchant) {
  const id = String(merchantId || "").trim();
  const execution = executionCoverage.get(id);
  const pilotReport = pilotEvidenceByMerchant.get(id);
  return {
    merchantId: id || null,
    hasAllowedDeliveryExecution: Boolean(execution?.steps.has("allowed_delivery")),
    hasDeniedGuardExecution: Boolean(execution?.steps.has("denied_guard")),
    hasFullPilotEvidence: Boolean(pilotReport?.valid),
    evidenceIds: unique(execution?.evidenceIds || []),
    receiptIds: unique(execution?.receiptIds || []),
    pilotMerchants: pilotReport?.credibleAcceptanceSignals?.pilotMerchants || [],
    pilotReportStatus: pilotReport?.valid ? "pass" : pilotReport ? "needs_evidence" : "not_checked",
    pilotReportReasons: pilotReport?.valid ? [] : pilotReport?.reasons || []
  };
}

function claimedMerchantIdsFromState(prospects, merchants) {
  return unique([
    ...prospects
      .filter((prospect) => prospect.integrationStatus === "integrated")
      .map(merchantIdForProspect)
      .filter(Boolean),
    ...merchants
      .filter((merchant) => merchant.status === "live")
      .map((merchant) => merchant.id)
      .filter(Boolean)
  ]);
}

function merchantIdForProspect(prospect = {}) {
  return String(
    prospect.merchantId ||
      prospect.integrationMerchantId ||
      prospect.directoryMerchantId ||
      prospect.integration?.merchantId ||
      prospect.merchant?.id ||
      ""
  ).trim();
}

function recordsFromInput(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object" && Array.isArray(value.records)) return value.records;
  return [];
}

function statusForReport({ reasons, validExecutions, prospectsReport, directoryReport }) {
  if (reasons.length > 0) return "needs_state_fixes";
  if (
    prospectsReport.some((prospect) => prospect.current.integrationStatus === "integrated") ||
    directoryReport.some((merchant) => merchant.current.status === "live")
  ) {
    return "state_backed_by_pilot_evidence";
  }
  if (validExecutions.length > 0) return "has_pilot_execution_evidence";
  return "no_pilot_execution_evidence_yet";
}

function nextActionForReport({ reasons, validExecutions, prospectsReport, directoryReport }) {
  if (reasons.length > 0) return "Fix integration or directory state before claiming a completed pilot";
  const testing = prospectsReport.find((prospect) => prospect.current.integrationStatus === "testing");
  if (testing) return `Complete allowed and denied live pilot execution evidence for ${testing.name || testing.prospectId}`;
  if (validExecutions.length > 0) return "Run npm run pilot-report and keep prospects/directories aligned to validated evidence";
  if (directoryReport.some((merchant) => merchant.current.status === "pilot_ready")) {
    return "Run merchant-approved pilot traffic only after live-pilot preflight and approved action packets";
  }
  return "Keep prospects not_started until merchant-approved pilot evidence exists";
}

function statusCounts(values) {
  return values.reduce((acc, value) => {
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function requireText(reasons, value, field) {
  if (!String(value || "").trim()) reasons.push(`Missing ${field}`);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
