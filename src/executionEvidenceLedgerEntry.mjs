import { buildOutreachExecutionEvidenceReport } from "./outreachExecutionEvidence.mjs";
import { buildXPostExecutionEvidenceReport } from "./xPostExecutionEvidence.mjs";

export const EXECUTION_EVIDENCE_LEDGER_STATUSES = [
  "ready_to_append",
  "needs_evidence_fixes",
  "duplicate_evidence",
  "unsupported_action_type"
];

const TARGETS = {
  x_post: {
    ledgerPath: "ops/x_post_execution_records.json",
    stateCommand: "npm run x-post-state -- ops/x_post_execution_records.json",
    validator: buildXPostExecutionEvidenceReport
  },
  merchant_outreach: {
    ledgerPath: "ops/outreach_execution_records.json",
    stateCommand: "npm run outreach-state -- ops/outreach_execution_records.json",
    validator: buildOutreachExecutionEvidenceReport
  }
};

export async function buildExecutionEvidenceLedgerEntry(input = {}, options = {}) {
  const generatedAt = options.generatedAt || new Date().toISOString();
  const evidence = input.evidence || {};
  const actionType = detectActionType(evidence, options.actionType);
  const target = TARGETS[actionType] || null;
  const existingLedger = input.existingLedger || {};
  const reasons = [];
  const warnings = [];
  let evidenceReport = null;

  if (!target) {
    reasons.push(`Unsupported execution evidence action type: ${actionType || "unknown"}`);
  } else {
    evidenceReport = await target.validator(evidence, options.validationOptions || {});
    reasons.push(...(evidenceReport.reasons || []));
    warnings.push(...(evidenceReport.warnings || []));
  }

  const existingRecords = recordsFromLedger(existingLedger);
  if (input.existingLedger && !Array.isArray(existingLedger.records)) {
    reasons.push("Existing ledger must be an object with a records array");
  }

  const evidenceId = evidenceReport?.evidenceId || evidence.evidenceId || null;
  const duplicate = evidenceId && existingRecords.some((record) => String(record?.evidenceId || "") === String(evidenceId));
  if (duplicate) reasons.push(`Evidence id already exists in target ledger: ${evidenceId}`);

  const validEvidence = evidenceReport?.valid === true;
  const valid = Boolean(target && validEvidence && !duplicate && reasons.length === 0);
  const status = statusFor({ target, validEvidence, duplicate, reasons });
  const record = valid ? cloneJson(evidence) : null;
  const appendPreview = valid
    ? {
        ...existingLedger,
        records: [...existingRecords, record],
        notes: Array.isArray(existingLedger.notes) ? existingLedger.notes : []
      }
    : null;

  return {
    generatedAt,
    valid,
    status,
    actionType,
    evidenceId,
    targetLedgerPath: target?.ledgerPath || null,
    evidenceReport,
    record,
    appendPreview,
    counts: {
      existingRecords: existingRecords.length,
      appendedRecords: valid ? existingRecords.length + 1 : existingRecords.length
    },
    reasons: unique(reasons),
    warnings: unique(warnings),
    nextAction: nextActionFor({ valid, status, target }),
    commands: target
      ? {
          validateEvidence: evidenceCommandFor(actionType),
          validateStateAfterAppend: target.stateCommand
        }
      : {},
    evidenceBoundary: {
      readsLocalEvidence: true,
      writesLocalPreview: false,
      appendsCanonicalLedger: false,
      postsContent: false,
      sendsOutreach: false,
      schedulesInterviews: false,
      signsWalletPayloads: false,
      deploysContracts: false,
      startsPilotTraffic: false,
      promotesMerchant: false,
      movesFunds: false,
      storesSecrets: false,
      approvesExternalAction: false,
      marksExecuted: false,
      marksTokenReady: false
    }
  };
}

export function publicExecutionEvidenceLedgerEntryReport(report = {}) {
  return {
    ...report,
    record: undefined,
    appendPreview: undefined
  };
}

function detectActionType(evidence, fallback) {
  return String(
    fallback ||
      evidence?.approvalPacket?.actionType ||
      evidence?.approval?.packet?.actionType ||
      evidence?.actionType ||
      ""
  ).trim();
}

function recordsFromLedger(ledger) {
  if (Array.isArray(ledger)) return ledger;
  if (ledger && typeof ledger === "object" && Array.isArray(ledger.records)) return ledger.records;
  return [];
}

function statusFor({ target, validEvidence, duplicate, reasons }) {
  if (!target) return "unsupported_action_type";
  if (duplicate) return "duplicate_evidence";
  if (!validEvidence || reasons.length > 0) return "needs_evidence_fixes";
  return "ready_to_append";
}

function nextActionFor({ valid, status, target }) {
  if (valid) {
    return `Append the validated record to ${target.ledgerPath}, then run ${target.stateCommand}.`;
  }
  if (status === "duplicate_evidence") return "Do not append duplicate evidence; inspect the existing ledger record.";
  if (status === "unsupported_action_type") return "Use the specific execution evidence validator for this action type until ledger-entry support exists.";
  return "Fix the execution evidence and rerun the ledger-entry builder before appending anything.";
}

function evidenceCommandFor(actionType) {
  if (actionType === "x_post") return "npm run x-post-execution-evidence -- <filled-x-post-evidence.json>";
  if (actionType === "merchant_outreach") return "npm run outreach-execution-evidence -- <filled-outreach-evidence.json>";
  return "npm run <matching-execution-evidence-validator> -- <filled-evidence.json>";
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
