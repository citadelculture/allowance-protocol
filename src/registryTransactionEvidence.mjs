export const REGISTRY_TRANSACTION_ACTION_TYPES = [
  "registry_policy_create",
  "registry_lifecycle_update",
  "registry_receipt_write"
];

export const REGISTRY_TRANSACTION_STATUSES = ["pending", "confirmed", "failed", "reverted"];
export const REGISTRY_TRANSACTION_RECEIPT_STATUSES = ["success", "failed", "reverted", "pending"];
export const REGISTRY_LIFECYCLE_RESULT_ACTIONS = ["set_policy_active", "set_merchant_allowed"];

const ZERO_BYTES32 = `0x${"0".repeat(64)}`;

export function buildRegistryTransactionEvidenceReport(evidence = {}, options = {}) {
  const reasons = [];
  const warnings = [];
  const requireConfirmed = options.requireConfirmed !== false;

  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    return {
      valid: false,
      reasons: ["Registry transaction evidence must be a JSON object"],
      warnings: [],
      evidenceBoundary: boundary()
    };
  }

  reasons.push(...unsafeInputReasons(evidence));

  const tx = evidence.transaction || {};
  const intent = evidence.intent || {};
  const result = evidence.result || {};
  const actionType = String(evidence.actionType || "").trim();
  const status = String(evidence.status || "").trim();
  const registryAddress = normalizeAddress(evidence.registryAddress);
  const from = normalizeAddress(tx.from || evidence.submittedBy);
  const to = normalizeAddress(tx.to);
  const chainId = positiveInteger(evidence.chainId, "chainId", reasons);

  requireText(reasons, evidence.evidenceId, "evidenceId");
  requireKnown(reasons, actionType, REGISTRY_TRANSACTION_ACTION_TYPES, "actionType");
  requireKnown(reasons, status, REGISTRY_TRANSACTION_STATUSES, "status");
  requireText(reasons, evidence.generatedAt, "generatedAt");
  requireText(reasons, evidence.network, "network");
  requireText(reasons, evidence.approvalRef, "approvalRef");
  if (evidence.generatedAt && !isValidDate(evidence.generatedAt)) reasons.push("generatedAt must be a valid date");

  if (!registryAddress) reasons.push("registryAddress must be a 20-byte EVM address");
  else if (registryAddress === false) reasons.push("registryAddress must be a 20-byte EVM address");

  requireHash(reasons, tx.txHash || evidence.txHash, "transaction.txHash");
  requireKnown(reasons, tx.status, REGISTRY_TRANSACTION_RECEIPT_STATUSES, "transaction.status");
  if (!from) reasons.push("transaction.from must be a 20-byte EVM address");
  else if (from === false) reasons.push("transaction.from must be a 20-byte EVM address");
  if (!to) reasons.push("transaction.to must be a 20-byte EVM address");
  else if (to === false) reasons.push("transaction.to must be a 20-byte EVM address");
  if (to && registryAddress && to !== false && registryAddress !== false && to !== registryAddress) {
    reasons.push("transaction.to must match registryAddress");
  }

  if (status === "confirmed") {
    if (String(tx.status || "") !== "success") reasons.push("confirmed evidence requires transaction.status=success");
    positiveInteger(tx.blockNumber, "transaction.blockNumber", reasons);
    requireText(reasons, tx.blockTimestamp, "transaction.blockTimestamp");
    if (tx.blockTimestamp && !isValidDate(tx.blockTimestamp)) reasons.push("transaction.blockTimestamp must be a valid date");
  }
  if (requireConfirmed && status !== "confirmed") reasons.push("Registry transaction evidence must be confirmed");

  requireHash(reasons, intent.writeIntentHash, "intent.writeIntentHash");
  requireText(reasons, intent.functionName, "intent.functionName");
  if (intent.calldataSha256) requireSha256(reasons, intent.calldataSha256, "intent.calldataSha256");

  const actionReport = validateActionResult(actionType, intent, result, reasons);

  return {
    valid: reasons.length === 0,
    evidenceId: evidence.evidenceId || null,
    actionType: actionType || null,
    status: status || null,
    generatedAt: evidence.generatedAt || null,
    approvalRef: evidence.approvalRef || null,
    registryAddress: registryAddress || null,
    chainId,
    network: evidence.network || null,
    transaction: {
      txHash: tx.txHash || evidence.txHash || null,
      status: tx.status || null,
      from: from || null,
      to: to || null,
      blockNumber: tx.blockNumber || null,
      blockTimestamp: tx.blockTimestamp || null,
      explorerUrl: tx.explorerUrl || null
    },
    intent: {
      writeIntentHash: intent.writeIntentHash || null,
      functionName: intent.functionName || null,
      calldataSha256: intent.calldataSha256 || null
    },
    result: actionReport,
    reasons: unique(reasons),
    warnings: unique(warnings),
    evidenceBoundary: boundary()
  };
}

function validateActionResult(actionType, intent, result, reasons) {
  if (actionType === "registry_policy_create") {
    requireKnown(reasons, intent.functionName, ["createPolicy"], "intent.functionName");
    requireHash(reasons, result.expectedPolicyId, "result.expectedPolicyId");
    requireHash(reasons, result.policyId, "result.policyId");
    if (isHash(result.expectedPolicyId) && isHash(result.policyId) && normalizeHash(result.expectedPolicyId) !== normalizeHash(result.policyId)) {
      reasons.push("result.policyId must match result.expectedPolicyId");
    }
    requireKnown(reasons, result.eventName, ["PolicyCreated"], "result.eventName");
    return {
      eventName: result.eventName || null,
      expectedPolicyId: normalizeHash(result.expectedPolicyId),
      policyId: normalizeHash(result.policyId)
    };
  }

  if (actionType === "registry_receipt_write") {
    requireKnown(reasons, intent.functionName, ["recordReceipt"], "intent.functionName");
    requireHash(reasons, result.expectedReceiptId, "result.expectedReceiptId");
    requireHash(reasons, result.receiptId, "result.receiptId");
    if (isHash(result.expectedReceiptId) && isHash(result.receiptId) && normalizeHash(result.expectedReceiptId) !== normalizeHash(result.receiptId)) {
      reasons.push("result.receiptId must match result.expectedReceiptId");
    }
    requireKnown(reasons, result.eventName, ["ReceiptRecorded"], "result.eventName");
    return {
      eventName: result.eventName || null,
      expectedReceiptId: normalizeHash(result.expectedReceiptId),
      receiptId: normalizeHash(result.receiptId)
    };
  }

  if (actionType === "registry_lifecycle_update") {
    requireKnown(reasons, result.action, REGISTRY_LIFECYCLE_RESULT_ACTIONS, "result.action");
    requireHash(reasons, result.policyId, "result.policyId");
    if (result.action === "set_policy_active") {
      requireKnown(reasons, intent.functionName, ["setPolicyActive"], "intent.functionName");
      requireKnown(reasons, result.eventName, ["PolicyActiveSet"], "result.eventName");
      const active = booleanField(result.active, "result.active", reasons);
      return {
        action: result.action || null,
        eventName: result.eventName || null,
        policyId: normalizeHash(result.policyId),
        active
      };
    }
    if (result.action === "set_merchant_allowed") {
      requireKnown(reasons, intent.functionName, ["setMerchantAllowed"], "intent.functionName");
      requireHash(reasons, result.merchantId, "result.merchantId");
      const allowed = booleanField(result.allowed, "result.allowed", reasons);
      requireText(reasons, result.stateCheckRef, "result.stateCheckRef");
      return {
        action: result.action || null,
        policyId: normalizeHash(result.policyId),
        merchantId: normalizeHash(result.merchantId),
        allowed,
        stateCheckRef: result.stateCheckRef || null
      };
    }
  }

  return null;
}

function unsafeInputReasons(value, path = []) {
  if (!value || typeof value !== "object") return [];
  const reasons = [];
  for (const [key, child] of Object.entries(value)) {
    const childPath = [...path, key];
    if (/(private.?key|mnemonic|seed.?phrase|recovery.?phrase|password|bearer.?token|api.?key|secret)/i.test(key)) {
      reasons.push(`Registry transaction evidence must not include secret field ${childPath.join(".")}`);
    }
    if (/^(signedTransaction|rawTransaction)$/i.test(key) && child) {
      reasons.push("Registry transaction evidence must not include signed or raw transaction bytes");
    }
    if (child && typeof child === "object") reasons.push(...unsafeInputReasons(child, childPath));
  }
  return reasons;
}

function booleanField(value, field, reasons) {
  if (value === true || value === false) return value;
  if (value === "true") return true;
  if (value === "false") return false;
  reasons.push(`${field} must be true or false`);
  return null;
}

function positiveInteger(value, field, reasons) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    reasons.push(`${field} must be a positive integer`);
    return null;
  }
  return number;
}

function normalizeAddress(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  return /^0x[0-9a-fA-F]{40}$/.test(text) ? text.toLowerCase() : false;
}

function requireText(reasons, value, field) {
  if (!String(value || "").trim()) reasons.push(`Missing ${field}`);
}

function requireKnown(reasons, value, allowed, field) {
  if (!allowed.includes(String(value || ""))) reasons.push(`Invalid ${field}`);
}

function requireHash(reasons, value, field) {
  if (!isHash(value)) reasons.push(`${field} must be a nonzero 32-byte hex hash`);
  else if (normalizeHash(value) === ZERO_BYTES32) reasons.push(`${field} must not be zero`);
}

function requireSha256(reasons, value, field) {
  if (!/^[0-9a-f]{64}$/.test(String(value || "").trim().toLowerCase())) {
    reasons.push(`${field} must be a SHA-256 hex digest without 0x prefix`);
  }
}

function isHash(value) {
  return /^0x[0-9a-fA-F]{64}$/.test(String(value || ""));
}

function normalizeHash(value) {
  return isHash(value) ? String(value).toLowerCase() : null;
}

function isValidDate(value) {
  return Number.isFinite(new Date(value).getTime());
}

function unique(values) {
  return [...new Set(values)];
}

function boundary() {
  return {
    fetchesChainData: false,
    signsTransaction: false,
    broadcastsTransaction: false,
    movesFunds: false,
    storesSecrets: false,
    verifiesPublicTransactionEvidence: true
  };
}
