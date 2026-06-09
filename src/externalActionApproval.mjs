import { validateDeploymentManifest } from "./deploymentReadiness.mjs";
import { buildLivePilotPreflight } from "./livePilotPreflight.mjs";
import { buildMerchantPromotionReport } from "./merchantPromotion.mjs";
import { validateOutreachDraft } from "./outreachApproval.mjs";
import { buildPolicySigningPacket } from "./policySigningPacket.mjs";
import { buildRegistryLifecycleIntent } from "./registryLifecycleIntent.mjs";
import { buildRegistryPolicyIntent } from "./registryPolicyIntent.mjs";
import { buildReceiptRegistryIntent } from "./receiptRegistryIntent.mjs";
import { validateXPost } from "./socialLaunch.mjs";

export const EXTERNAL_ACTION_TYPES = [
  "x_post",
  "merchant_outreach",
  "controller_policy_signature",
  "contract_deployment",
  "registry_lifecycle_update",
  "registry_policy_create",
  "registry_receipt_write",
  "live_pilot",
  "merchant_promotion"
];

export const EXTERNAL_ACTION_STATUSES = ["draft", "approved", "executed", "rejected", "withdrawn"];

const REQUIRED_APPROVAL_FLAGS = [
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

const SENSITIVE_TEXT_PATTERNS = [
  { id: "private_key", pattern: /\b0x[0-9a-fA-F]{64}\b/, reason: "External action packet text must not include private keys" },
  { id: "seed_phrase", pattern: /\b(?:seed phrase|mnemonic|recovery phrase)\b/i, reason: "External action packet text must not include wallet seed or recovery phrase material" },
  { id: "bearer_token", pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b/i, reason: "External action packet text must not include bearer tokens" },
  { id: "api_key", pattern: /\b(api[_-]?key|secret|password)\s*[:=]\s*\S+/i, reason: "External action packet text must not include API keys, secrets, or passwords" }
];

export async function buildExternalActionApprovalReport(packet = {}, options = {}) {
  const reasons = [];
  const warnings = [];
  const requireApproved = options.requireApproved !== false;

  if (!packet || typeof packet !== "object" || Array.isArray(packet)) {
    return {
      valid: false,
      reasons: ["External action approval packet must be a JSON object"],
      warnings: [],
      redactionFlags: [],
      typeReport: null,
      evidenceBoundary: boundary()
    };
  }

  const action = packet.action || {};
  const approvals = packet.approvals || {};
  const actionType = String(packet.actionType || "").trim();

  requireText(reasons, packet.approvalId, "approvalId");
  requireKnown(reasons, actionType, EXTERNAL_ACTION_TYPES, "actionType");
  requireKnown(reasons, packet.status, EXTERNAL_ACTION_STATUSES, "status");
  requireText(reasons, packet.requestedBy, "requestedBy");
  requireText(reasons, packet.requestedAt, "requestedAt");
  requireText(reasons, action.summary, "action.summary");
  requireKnown(reasons, action.executionMode, ["human_only"], "action.executionMode");

  if (packet.requestedAt && !isValidDate(packet.requestedAt)) reasons.push("requestedAt must be a valid date");
  if (requireApproved && packet.status !== "approved") reasons.push("External action must be approved before execution");
  if (packet.status === "approved") {
    requireText(reasons, packet.approvedBy, "approvedBy");
    requireText(reasons, packet.approvedAt, "approvedAt");
    if (packet.approvedAt && !isValidDate(packet.approvedAt)) reasons.push("approvedAt must be a valid date");
  }
  if (packet.status === "executed") reasons.push("Executed action packets are historical records, not pre-execution approvals");
  if (action.automated === true) reasons.push("External action must not be marked automated");

  for (const flag of REQUIRED_APPROVAL_FLAGS) {
    if (approvals[flag] !== true) reasons.push(`approvals.${flag} must be true`);
  }

  const redactionFlags = sensitiveFlags(textForSensitiveScan(packet));
  reasons.push(...redactionFlags.map((flag) => flag.reason));

  const typeReport = await typeSpecificReport(actionType, packet.payload || {}, action, options);
  reasons.push(...typeReport.reasons.map((reason) => `${actionType}: ${reason}`));
  warnings.push(...typeReport.warnings.map((warning) => `${actionType}: ${warning}`));

  return {
    valid: reasons.length === 0,
    approvalId: packet.approvalId || null,
    actionType: actionType || null,
    status: packet.status || null,
    requestedBy: packet.requestedBy || null,
    approvedBy: packet.approvedBy || null,
    action: {
      summary: action.summary || null,
      channel: action.channel || null,
      destination: action.destination || null,
      executionMode: action.executionMode || null
    },
    typeReport,
    redactionFlags,
    reasons: unique(reasons),
    warnings: unique(warnings),
    evidenceBoundary: boundary()
  };
}

async function typeSpecificReport(actionType, payload, action, options) {
  if (actionType === "x_post") return xPostReport(payload, action, options);
  if (actionType === "merchant_outreach") return outreachReport(payload, action, options);
  if (actionType === "controller_policy_signature") return controllerPolicySignatureReport(payload, action);
  if (actionType === "contract_deployment") return deploymentReport(payload);
  if (actionType === "registry_lifecycle_update") return registryLifecycleUpdateReport(payload, action);
  if (actionType === "registry_policy_create") return registryPolicyCreateReport(payload, action);
  if (actionType === "registry_receipt_write") return registryReceiptWriteReport(payload, action);
  if (actionType === "live_pilot") return livePilotReport(payload, action, options);
  if (actionType === "merchant_promotion") return merchantPromotionReport(payload, options);
  return {
    valid: false,
    reasons: ["Unsupported actionType"],
    warnings: []
  };
}

function xPostReport(payload = {}, action = {}, options = {}) {
  const post = payload.post || {};
  const validation = validateXPost(post, {
    validEvidenceRefs: options.validEvidenceRefs || payload.validEvidenceRefs,
    requireExperimentalDisclosure: options.requireExperimentalDisclosure || payload.requireExperimentalDisclosure
  });
  const reasons = [...validation.reasons];
  const warnings = [...validation.warnings];

  if (post.status !== "draft_only") reasons.push("X post payload must remain draft_only until a human posts it");
  if (action.channel !== "x") reasons.push("action.channel must be x for X posts");
  requireText(reasons, action.destination, "action.destination");
  if (action.destination && !/^@[A-Za-z0-9_]{1,30}$/.test(String(action.destination))) {
    reasons.push("action.destination must be the X account handle");
  }
  if (String(action.exactText || "") !== String(post.text || "")) {
    reasons.push("action.exactText must exactly match payload.post.text");
  }

  return {
    valid: reasons.length === 0,
    reasons,
    warnings,
    post: {
      id: post.id || null,
      length: validation.length,
      remaining: validation.remaining,
      claimFlags: validation.claimFlags
    }
  };
}

function outreachReport(payload = {}, action = {}, options = {}) {
  const draft = payload.outreachDraft || {};
  const validation = validateOutreachDraft(draft, options.outreachOptions || {});
  const reasons = [...validation.reasons];
  const warnings = [...validation.warnings];

  if (action.channel && action.channel !== draft.channel) reasons.push("action.channel must match outreachDraft.channel");
  if (action.destination && action.destination !== draft.destination) reasons.push("action.destination must match outreachDraft.destination");
  if (action.subject && action.subject !== draft.subject) reasons.push("action.subject must match outreachDraft.subject");
  if (String(action.exactText || "") !== String(draft.message || "")) {
    reasons.push("action.exactText must exactly match outreachDraft.message");
  }

  return {
    valid: reasons.length === 0,
    reasons,
    warnings,
    draft: {
      prospectId: draft.prospectId || null,
      candidateId: draft.candidateId || null,
      destination: draft.destination || null
    }
  };
}

function controllerPolicySignatureReport(payload = {}, action = {}) {
  const controller = payload.controller || action.walletAddress || "";
  const signing = buildPolicySigningPacket(payload.policyTemplate || {}, {
    controller,
    policyId: payload.policyId,
    agentId: payload.agentId
  });
  const reasons = [...signing.reasons];
  const warnings = [...signing.warnings];

  requireText(reasons, action.walletAddress, "action.walletAddress");
  requireText(reasons, payload.policyFingerprint, "payload.policyFingerprint");
  if (!payload.typedData || typeof payload.typedData !== "object" || Array.isArray(payload.typedData)) {
    reasons.push("payload.typedData must include the exact EIP-712 typed data for wallet review");
  }
  if (payload.policyFingerprint && payload.policyFingerprint !== signing.fingerprint) {
    reasons.push("payload.policyFingerprint must match signing packet fingerprint");
  }
  if (payload.typedData && stableStringify(payload.typedData) !== stableStringify(signing.typedData)) {
    reasons.push("payload.typedData must match generated policy signing packet typedData");
  }
  if (action.walletAddress && signing.controller && !sameAddress(action.walletAddress, signing.controller)) {
    reasons.push("action.walletAddress must match signing packet controller");
  }
  if (String(action.command || "").includes("ALLOW_CONTROLLER_PRIVATE_KEY")) {
    reasons.push("action.command must not use ALLOW_CONTROLLER_PRIVATE_KEY");
  }

  return {
    valid: reasons.length === 0,
    reasons,
    warnings,
    signing: {
      valid: signing.valid,
      policyId: signing.policyId,
      controller: signing.controller,
      fingerprint: signing.fingerprint,
      status: signing.status
    }
  };
}

function deploymentReport(payload = {}) {
  const validation = validateDeploymentManifest(payload.deploymentManifest || {}, {
    requireMainnet: payload.requireMainnet === true
  });

  return {
    valid: validation.valid,
    reasons: validation.reasons,
    warnings: validation.warnings
  };
}

function registryLifecycleUpdateReport(payload = {}, action = {}) {
  const report = buildRegistryLifecycleIntent(payload.lifecycle || payload, {
    ...(payload.registry || {}),
    deploymentManifest: payload.deploymentManifest || payload.deployment,
    requireDeployedRegistry: true
  });
  const reasons = [...report.reasons];
  const warnings = [...report.warnings];

  requireText(reasons, action.walletAddress, "action.walletAddress");
  requireText(reasons, action.destination, "action.destination");
  if (action.channel && action.channel !== "wallet") reasons.push("action.channel must be wallet for registry lifecycle updates");
  if (action.destination && report.contract.address && !sameAddress(action.destination, report.contract.address)) {
    reasons.push("action.destination must match registry contract address");
  }
  if (action.walletAddress && report.contract.controller && !sameAddress(action.walletAddress, report.contract.controller)) {
    reasons.push("action.walletAddress must match registry policy controller");
  }

  return {
    valid: reasons.length === 0,
    reasons,
    warnings,
    registry: {
      valid: report.valid,
      status: report.status,
      action: report.registry.action,
      functionName: report.registry.functionName,
      contractAddress: report.contract.address,
      chainId: report.contract.chainId,
      controller: report.contract.controller,
      writeIntentHash: report.registry.writeIntentHash,
      hasCalldata: Boolean(report.registry.calldata)
    }
  };
}

function registryPolicyCreateReport(payload = {}, action = {}) {
  const report = buildRegistryPolicyIntent(payload.policy || payload.policyTemplate || {}, {
    ...(payload.registry || {}),
    deploymentManifest: payload.deploymentManifest || payload.deployment,
    requireDeployedRegistry: true,
    allowZeroSettlementToken: payload.allowZeroSettlementToken === true
  });
  const reasons = [...report.reasons];
  const warnings = [...report.warnings];

  requireText(reasons, action.walletAddress, "action.walletAddress");
  requireText(reasons, action.destination, "action.destination");
  if (action.channel && action.channel !== "wallet") reasons.push("action.channel must be wallet for registry policy creation");
  if (action.destination && report.contract.address && !sameAddress(action.destination, report.contract.address)) {
    reasons.push("action.destination must match registry contract address");
  }
  if (action.walletAddress && report.contract.controller && !sameAddress(action.walletAddress, report.contract.controller)) {
    reasons.push("action.walletAddress must match registry policy controller");
  }

  return {
    valid: reasons.length === 0,
    reasons,
    warnings,
    registry: {
      valid: report.valid,
      status: report.status,
      contractAddress: report.contract.address,
      chainId: report.contract.chainId,
      controller: report.contract.controller,
      sourcePolicyId: report.sourcePolicy.policyId,
      expectedPolicyId: report.registry.expectedPolicyId,
      writeIntentHash: report.registry.writeIntentHash,
      hasCalldata: Boolean(report.registry.calldata)
    }
  };
}

function registryReceiptWriteReport(payload = {}, action = {}) {
  const report = buildReceiptRegistryIntent(payload.receiptRecord || payload.record || payload.receipt || {}, {
    ...(payload.registry || {}),
    deploymentManifest: payload.deploymentManifest || payload.deployment,
    requireAllowedDecision: payload.requireAllowedDecision !== false,
    requireCredibleEvidence: payload.requireCredibleEvidence !== false,
    requireMerchantApproval: payload.requireMerchantApproval !== false,
    requireDeployedRegistry: true
  });
  const reasons = [...report.reasons];
  const warnings = [...report.warnings];

  requireText(reasons, action.walletAddress, "action.walletAddress");
  requireText(reasons, action.destination, "action.destination");
  if (action.channel && action.channel !== "wallet") reasons.push("action.channel must be wallet for registry receipt writes");
  if (action.destination && report.contract.address && !sameAddress(action.destination, report.contract.address)) {
    reasons.push("action.destination must match registry contract address");
  }
  if (action.walletAddress && report.contract.recorder && !sameAddress(action.walletAddress, report.contract.recorder)) {
    reasons.push("action.walletAddress must match registry recorder address");
  }

  return {
    valid: reasons.length === 0,
    reasons,
    warnings,
    registry: {
      valid: report.valid,
      status: report.status,
      contractAddress: report.contract.address,
      chainId: report.contract.chainId,
      recorder: report.contract.recorder,
      sourceReceiptId: report.sourceReceipt.id,
      writeIntentHash: report.registry.writeIntentHash,
      expectedReceiptId: report.registry.expectedReceiptId,
      hasCalldata: Boolean(report.registry.calldata)
    }
  };
}

async function livePilotReport(payload = {}, action = {}, options = {}) {
  const report = await buildLivePilotPreflight(payload.preflight || payload, {
    env: payload.runtimeEnv || {},
    sourceErrors: payload.sourceErrors || [],
    walletControlResult: payload.walletControlResult,
    walletControlVerifier: options.walletControlVerifier
  });
  const reasons = [...report.reasons];
  const warnings = [...report.warnings];
  const request = payload.request || {};
  const step = String(payload.pilotStep || request.step || "").trim();
  const route = report.gateway?.route || {};

  requireKnown(reasons, step, ["allowed_delivery", "denied_guard"], "payload.pilotStep");
  requireText(reasons, action.channel, "action.channel");
  requireText(reasons, action.destination, "action.destination");
  requireText(reasons, action.command, "action.command");
  if (action.channel && action.channel !== "gateway") reasons.push("action.channel must be gateway for live pilot traffic");
  if (request.command && String(action.command || "") !== String(request.command || "")) {
    reasons.push("action.command must exactly match payload.request.command");
  }
  if (request.destination && action.destination && action.destination !== request.destination) {
    reasons.push("action.destination must match payload.request.destination");
  }
  if (request.merchantId && route.merchantId && request.merchantId !== route.merchantId) {
    reasons.push("payload.request.merchantId must match preflight gateway route merchantId");
  }
  if (request.route?.pathPrefix && route.pathPrefix && request.route.pathPrefix !== route.pathPrefix) {
    reasons.push("payload.request.route.pathPrefix must match preflight gateway route");
  }
  if (request.receiptPath && report.gateway?.receiptPath && request.receiptPath !== report.gateway.receiptPath) {
    reasons.push("payload.request.receiptPath must match preflight gateway receipt path");
  }
  if (step === "allowed_delivery" && !String(request.expectedOutcome || "").includes("allowed")) {
    reasons.push("allowed_delivery request must expect an allowed receipt outcome");
  }
  if (step === "denied_guard" && !String(request.expectedOutcome || "").includes("denied")) {
    reasons.push("denied_guard request must expect a denied guard receipt outcome");
  }

  return {
    valid: reasons.length === 0,
    reasons,
    warnings,
    preflightStatus: report.status,
    checks: report.checks,
    request: {
      step: step || null,
      merchantId: request.merchantId || null,
      expectedOutcome: request.expectedOutcome || null,
      receiptPath: request.receiptPath || null
    }
  };
}

async function merchantPromotionReport(payload = {}, options = {}) {
  const report = await buildMerchantPromotionReport(payload.merchantPromotion || payload, {
    minimumActiveAgents: payload.minimumActiveAgents || options.minimumActiveAgents || 1,
    requireExperimentalDisclosure: payload.requireExperimentalDisclosure || options.requireExperimentalDisclosure,
    recoverMerchantSigner: options.recoverMerchantSigner
  });

  return {
    valid: report.valid,
    reasons: report.reasons,
    warnings: report.warnings,
    promotionId: report.promotionId,
    merchantId: report.merchantId
  };
}

function textForSensitiveScan(packet = {}) {
  const action = packet.action || {};
  return [
    packet.approvalId,
    packet.requestedBy,
    packet.approvedBy,
    action.summary,
    action.destination,
    action.subject,
    action.exactText,
    action.command,
    ...(Array.isArray(packet.notes) ? packet.notes : [])
  ]
    .filter(Boolean)
    .join("\n");
}

function sensitiveFlags(text = "") {
  const flags = [];
  for (const item of SENSITIVE_TEXT_PATTERNS) {
    if (item.pattern.test(text)) flags.push({ id: item.id, reason: item.reason });
  }
  return flags;
}

function requireText(reasons, value, field) {
  if (!String(value || "").trim()) reasons.push(`Missing ${field}`);
}

function requireKnown(reasons, value, allowed, field) {
  if (!allowed.includes(String(value || ""))) reasons.push(`Invalid ${field}`);
}

function isValidDate(value) {
  return Number.isFinite(new Date(value).getTime());
}

function sameAddress(a, b) {
  return String(a || "").toLowerCase() === String(b || "").toLowerCase();
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function unique(values) {
  return [...new Set(values)];
}

function boundary() {
  return {
    executesAction: false,
    postsContent: false,
    sendsOutreach: false,
    signsWalletPayloads: false,
    deploysContracts: false,
    startsPilotTraffic: false,
    movesFunds: false,
    storesSecrets: false,
    requiresHumanExecution: true
  };
}
