import { buildOutreachStateReport } from "./outreachState.mjs";
import { buildXPostStateReport } from "./xPostState.mjs";

export const STATE_UPDATE_PREVIEW_STATUSES = [
  "ready_to_apply",
  "no_state_changes",
  "needs_state_fixes",
  "unsupported_action_type"
];

const TARGETS = {
  x_post: {
    targetStatePath: "launch/x_posts.json",
    stateValidationCommand: "npm run x-post-state -- ops/x_post_execution_records.json",
    currentKey: "launchPosts",
    projectedKey: "projectedLaunchPosts",
    watchedFields: ["status"],
    buildStateReport: ({ executionLedger, launchPosts }, options) =>
      buildXPostStateReport({ launchPosts, executionRecords: executionLedger }, options)
  },
  merchant_outreach: {
    targetStatePath: "ops/prospects.json",
    stateValidationCommand: "npm run outreach-state -- ops/outreach_execution_records.json",
    currentKey: "prospects",
    projectedKey: "projectedProspects",
    watchedFields: ["contactStatus", "outreachStatus", "interviewStatus", "integrationStatus"],
    buildStateReport: ({ executionLedger, prospects, contactCandidates, interviews }, options) =>
      buildOutreachStateReport(
        {
          prospects,
          evidenceRecords: executionLedger,
          contactCandidates,
          interviews
        },
        options
      )
  }
};

export async function buildStateUpdatePreview(input = {}, options = {}) {
  const generatedAt = options.generatedAt || new Date().toISOString();
  const ledgerEntryReport = input.ledgerEntryReport || null;
  const actionType = detectActionType(input, ledgerEntryReport);
  const target = TARGETS[actionType] || null;
  const reasons = [];
  const warnings = [];
  let executionLedger = input.executionLedger || null;
  let stateReport = null;
  let projectedState = [];
  let changes = [];

  if (!target) {
    reasons.push(`Unsupported state update action type: ${actionType || "unknown"}`);
  } else {
    const sourceCheck = validateCanonicalStateInput(input, target);
    reasons.push(...sourceCheck.reasons);

    if (ledgerEntryReport) {
      if (ledgerEntryReport.valid !== true) {
        reasons.push(`Ledger entry preview is not valid: ${ledgerEntryReport.status || "unknown"}`);
      }
      if (!ledgerEntryReport.appendPreview) {
        reasons.push("Ledger entry preview is missing appendPreview");
      }
      executionLedger = ledgerEntryReport.appendPreview || executionLedger;
    }
    if (!executionLedger) {
      reasons.push("Missing execution ledger or ledger entry append preview");
    }

    if (reasons.length === 0) {
      stateReport = await target.buildStateReport(
        {
          executionLedger,
          launchPosts: input.launchPosts,
          prospects: input.prospects,
          contactCandidates: input.contactCandidates,
          interviews: input.interviews
        },
        options.stateOptions || {}
      );
      reasons.push(...(stateReport.reasons || []));
      warnings.push(...(stateReport.warnings || []));
      projectedState = cloneJson(stateReport[target.projectedKey] || []);
      changes = diffById(input[target.currentKey] || [], projectedState, target.watchedFields);
    }
  }

  const valid = Boolean(target && reasons.length === 0 && (!stateReport || stateReport.valid !== false));
  const status = statusFor({ target, valid, changes });

  return {
    generatedAt,
    valid,
    status,
    actionType,
    sourceLedgerPreview: ledgerEntryReport
      ? {
          status: ledgerEntryReport.status || null,
          evidenceId: ledgerEntryReport.evidenceId || null,
          targetLedgerPath: ledgerEntryReport.targetLedgerPath || null,
          existingRecords: ledgerEntryReport.counts?.existingRecords ?? null,
          appendedRecords: ledgerEntryReport.counts?.appendedRecords ?? null
        }
      : null,
    targetStatePath: target?.targetStatePath || null,
    stateValidationCommand: target?.stateValidationCommand || null,
    counts: {
      currentItems: target ? (input[target.currentKey] || []).length : 0,
      projectedItems: projectedState.length,
      changedItems: changes.length
    },
    changes,
    projectedState,
    stateReport,
    reasons: unique(reasons),
    warnings: unique(warnings),
    nextAction: nextActionFor({ status, target }),
    evidenceBoundary: {
      readsLocalPreview: true,
      readsCanonicalState: true,
      writesLocalPreview: false,
      mutatesCanonicalState: false,
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

export function publicStateUpdatePreviewReport(report = {}) {
  return {
    ...report,
    projectedState: undefined,
    stateReport: undefined
  };
}

function detectActionType(input, ledgerEntryReport) {
  return String(
    input.actionType ||
      ledgerEntryReport?.actionType ||
      ledgerEntryReport?.record?.approvalPacket?.actionType ||
      ledgerEntryReport?.record?.approval?.packet?.actionType ||
      ""
  ).trim();
}

function validateCanonicalStateInput(input, target) {
  const reasons = [];
  if (!Array.isArray(input[target.currentKey])) {
    reasons.push(`Missing canonical state array: ${target.currentKey}`);
  }
  if (target.currentKey === "prospects") {
    if (!Array.isArray(input.contactCandidates)) reasons.push("Missing canonical state array: contactCandidates");
    if (!Array.isArray(input.interviews)) reasons.push("Missing canonical state array: interviews");
  }
  return { reasons };
}

function statusFor({ target, valid, changes }) {
  if (!target) return "unsupported_action_type";
  if (!valid) return "needs_state_fixes";
  if (changes.length === 0) return "no_state_changes";
  return "ready_to_apply";
}

function nextActionFor({ status, target }) {
  if (status === "ready_to_apply") {
    return `Review this preview, append the validated ledger record, apply only the shown changes to ${target.targetStatePath}, then run ${target.stateValidationCommand}.`;
  }
  if (status === "no_state_changes") {
    return `Canonical state already matches the evidence projection; rerun ${target.stateValidationCommand} after any ledger append.`;
  }
  if (status === "unsupported_action_type") {
    return "Use the matching state reconciler directly until this preview supports the action type.";
  }
  return "Fix the ledger-entry preview or state reconciler errors before changing canonical state.";
}

function diffById(currentItems, projectedItems, watchedFields) {
  const currentById = new Map(currentItems.map((item) => [String(item?.id || ""), item]).filter(([id]) => id));
  const projectedById = new Map(projectedItems.map((item) => [String(item?.id || ""), item]).filter(([id]) => id));
  const changes = [];

  for (const [id, projected] of projectedById) {
    const current = currentById.get(id);
    if (!current) {
      changes.push({
        type: "add",
        id,
        fields: watchedFields
          .filter((field) => projected[field] !== undefined)
          .map((field) => ({ field, from: undefined, to: projected[field] }))
      });
      continue;
    }

    const fields = watchedFields
      .filter((field) => !sameJson(current[field], projected[field]))
      .map((field) => ({
        field,
        from: current[field] ?? null,
        to: projected[field] ?? null
      }));
    if (fields.length > 0) {
      changes.push({
        type: "update",
        id,
        fields
      });
    }
  }

  for (const [id, current] of currentById) {
    if (!projectedById.has(id)) {
      changes.push({
        type: "remove",
        id,
        fields: watchedFields
          .filter((field) => current[field] !== undefined)
          .map((field) => ({ field, from: current[field], to: undefined }))
      });
    }
  }

  return changes;
}

function sameJson(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
