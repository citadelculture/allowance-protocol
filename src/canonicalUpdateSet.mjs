import { createHash } from "node:crypto";

export const CANONICAL_UPDATE_SET_STATUSES = [
  "ready_to_review",
  "needs_update_fixes",
  "unsupported_action_type"
];

const TARGETS = {
  x_post: {
    ledgerPath: "ops/x_post_execution_records.json",
    statePath: "launch/x_posts.json",
    stateValidationCommand: "npm run x-post-state -- ops/x_post_execution_records.json"
  },
  merchant_outreach: {
    ledgerPath: "ops/outreach_execution_records.json",
    statePath: "ops/prospects.json",
    stateValidationCommand: "npm run outreach-state -- ops/outreach_execution_records.json"
  }
};

export function buildCanonicalUpdateSet(input = {}, options = {}) {
  const generatedAt = options.generatedAt || new Date().toISOString();
  const ledgerEntryReport = input.ledgerEntryReport || null;
  const stateUpdatePreview = input.stateUpdatePreview || null;
  const actionType = detectActionType(input, ledgerEntryReport, stateUpdatePreview);
  const target = TARGETS[actionType] || null;
  const reasons = [];
  const warnings = [];

  if (!target) {
    reasons.push(`Unsupported canonical update action type: ${actionType || "unknown"}`);
  }

  if (!ledgerEntryReport || typeof ledgerEntryReport !== "object") {
    reasons.push("Missing execution evidence ledger-entry preview");
  } else {
    if (ledgerEntryReport.valid !== true) {
      reasons.push(`Ledger entry preview is not valid: ${ledgerEntryReport.status || "unknown"}`);
    }
    if (!ledgerEntryReport.appendPreview) {
      reasons.push("Ledger entry preview is missing appendPreview");
    }
    if (target && ledgerEntryReport.targetLedgerPath !== target.ledgerPath) {
      reasons.push(`Ledger entry preview target mismatch: expected ${target.ledgerPath}`);
    }
  }

  if (!stateUpdatePreview || typeof stateUpdatePreview !== "object") {
    reasons.push("Missing state update preview");
  } else {
    if (stateUpdatePreview.valid !== true) {
      reasons.push(`State update preview is not valid: ${stateUpdatePreview.status || "unknown"}`);
    }
    if (!Array.isArray(stateUpdatePreview.projectedState)) {
      reasons.push("State update preview is missing projectedState; use the full local preview JSON");
    }
    if (target && stateUpdatePreview.targetStatePath !== target.statePath) {
      reasons.push(`State update preview target mismatch: expected ${target.statePath}`);
    }
  }

  if (input.currentLedger === undefined) reasons.push("Missing current canonical ledger JSON");
  if (!Array.isArray(input.currentState)) reasons.push("Missing current canonical state array");

  const proposedLedger = ledgerEntryReport?.appendPreview ? cloneJson(ledgerEntryReport.appendPreview) : null;
  const proposedState = Array.isArray(stateUpdatePreview?.projectedState)
    ? cloneJson(stateUpdatePreview.projectedState)
    : null;

  if (proposedLedger && input.currentLedger !== undefined) {
    const expectedCurrentLedger = ledgerBeforeAppend(proposedLedger);
    if (!expectedCurrentLedger) {
      reasons.push("Ledger append preview must contain at least one appended record");
    } else if (!sameJson(input.currentLedger, expectedCurrentLedger)) {
      reasons.push("Current canonical ledger no longer matches the base used by the append preview");
    }
  }

  if (Array.isArray(input.currentState) && proposedState) {
    reasons.push(...statePreviewMismatchReasons(input.currentState, proposedState, stateUpdatePreview?.changes || []));
  }

  const files = target
    ? [
        buildFileUpdate({
          role: "execution_ledger",
          path: target.ledgerPath,
          currentValue: input.currentLedger,
          proposedValue: proposedLedger,
          summary: "Append the validated execution evidence record"
        }),
        buildFileUpdate({
          role: "canonical_state",
          path: target.statePath,
          currentValue: input.currentState,
          proposedValue: proposedState,
          changes: stateUpdatePreview?.changes || [],
          summary: stateUpdatePreview?.changes?.length
            ? "Apply only the previewed state field changes"
            : "No canonical state field changes are required"
        })
      ]
    : [];

  const valid = Boolean(target && reasons.length === 0);
  const status = statusFor({ target, valid });

  return {
    generatedAt,
    valid,
    status,
    actionType,
    targetLedgerPath: target?.ledgerPath || null,
    targetStatePath: target?.statePath || null,
    files,
    counts: {
      fileUpdates: files.length,
      changedFiles: files.filter((file) => file.changed).length,
      stateChanges: Array.isArray(stateUpdatePreview?.changes) ? stateUpdatePreview.changes.length : 0
    },
    commands: target
      ? {
          validateStateAfterApply: target.stateValidationCommand,
          rebuildLedgerPreview: "npm run execution-evidence-ledger-entry -- <filled-evidence.json>",
          rebuildStatePreview: "npm run state-update-preview -- work/execution-evidence-ledger-entry.json"
        }
      : {},
    reviewChecklist: checklistFor({ target, stateUpdatePreview }),
    reasons: unique(reasons),
    warnings: unique(warnings),
    nextAction: nextActionFor({ status, target }),
    evidenceBoundary: {
      readsLocalPreviews: true,
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

export function publicCanonicalUpdateSetReport(report = {}) {
  return {
    ...report,
    files: Array.isArray(report.files)
      ? report.files.map((file) => ({
          ...file,
          currentJson: undefined,
          proposedJson: undefined
        }))
      : report.files
  };
}

function detectActionType(input, ledgerEntryReport, stateUpdatePreview) {
  return String(input.actionType || ledgerEntryReport?.actionType || stateUpdatePreview?.actionType || "").trim();
}

function ledgerBeforeAppend(appendPreview) {
  const records = recordsFromLedger(appendPreview);
  if (records.length === 0) return null;
  if (Array.isArray(appendPreview)) return records.slice(0, -1);
  return {
    ...appendPreview,
    records: records.slice(0, -1)
  };
}

function recordsFromLedger(ledger) {
  if (Array.isArray(ledger)) return ledger;
  if (ledger && typeof ledger === "object" && Array.isArray(ledger.records)) return ledger.records;
  return [];
}

function statePreviewMismatchReasons(currentState, projectedState, changes) {
  const reasons = [];
  const currentById = new Map(currentState.map((item) => [String(item?.id || ""), item]).filter(([id]) => id));
  const projectedById = new Map(projectedState.map((item) => [String(item?.id || ""), item]).filter(([id]) => id));

  for (const change of changes) {
    const id = String(change?.id || "");
    if (!id) {
      reasons.push("State update preview contains a change without an id");
      continue;
    }
    const current = currentById.get(id);
    if (change.type === "add") {
      if (current) reasons.push(`${id}: state preview expected a new item, but it already exists`);
      continue;
    }
    if (!current) {
      reasons.push(`${id}: current canonical state is missing the item referenced by the state preview`);
      continue;
    }
    for (const fieldChange of change.fields || []) {
      if (!sameJson(current[fieldChange.field], fieldChange.from ?? null)) {
        reasons.push(`${id}: current ${fieldChange.field} no longer matches preview base value`);
      }
    }
  }

  if (changes.length === 0 && !sameJson(currentState, projectedState)) {
    reasons.push("State update preview says no changes, but current canonical state differs from projectedState");
  }

  for (const [id] of projectedById) {
    if (!currentById.has(id) && !changes.some((change) => change.type === "add" && change.id === id)) {
      reasons.push(`${id}: projected state contains an unaccounted new item`);
    }
  }

  return reasons;
}

function buildFileUpdate({ role, path, currentValue, proposedValue, changes = [], summary }) {
  const currentJson = currentValue === undefined ? "" : jsonFileText(currentValue);
  const proposedJson = proposedValue === null ? "" : jsonFileText(proposedValue);
  return {
    role,
    path,
    summary,
    changed: currentJson !== proposedJson,
    currentSha256: sha256Hex(currentJson),
    proposedSha256: sha256Hex(proposedJson),
    currentBytes: Buffer.byteLength(currentJson),
    proposedBytes: Buffer.byteLength(proposedJson),
    changes,
    currentJson,
    proposedJson
  };
}

function checklistFor({ target, stateUpdatePreview }) {
  if (!target) return [];
  return [
    `Confirm the execution evidence preview is valid for ${target.ledgerPath}`,
    `Confirm the state preview is valid for ${target.statePath}`,
    "Review every file hash and changed field in this update set",
    `After any manual canonical edit, run ${target.stateValidationCommand}`,
    "Do not claim execution, outreach, usage, integration, or token readiness from this preview alone"
  ].concat(
    stateUpdatePreview?.status === "no_state_changes"
      ? [`No ${target.statePath} field change is expected; only the ledger append may be needed`]
      : []
  );
}

function statusFor({ target, valid }) {
  if (!target) return "unsupported_action_type";
  if (!valid) return "needs_update_fixes";
  return "ready_to_review";
}

function nextActionFor({ status, target }) {
  if (status === "ready_to_review") {
    return `Review this update set, apply only the proposed ${target.ledgerPath} and ${target.statePath} JSON changes, then run ${target.stateValidationCommand}.`;
  }
  if (status === "unsupported_action_type") {
    return "Use the matching ledger and state validators directly until canonical update sets support this action type.";
  }
  return "Fix the ledger-entry preview, state update preview, or stale canonical file inputs before editing canonical files.";
}

function jsonFileText(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256Hex(text) {
  return `sha256:${createHash("sha256").update(text).digest("hex")}`;
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
