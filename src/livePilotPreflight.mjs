import { normalizeGatewayConfig } from "./gateway.mjs";
import { verifyProductionPolicy } from "./policyAudit.mjs";
import {
  summarizePilotBinding,
  validatePilotBinding,
  verifyPilotWalletControlSignatureAsync
} from "./pilotBinding.mjs";
import { validateDisputePacket } from "./disputeProcess.mjs";
import { CREDIBLE_PILOT_ENVIRONMENTS, normalizeReceiptEvidence } from "./receiptStore.mjs";

export async function buildLivePilotPreflight(input = {}, options = {}) {
  const binding = input.binding || {};
  const policy = input.policy || null;
  const gatewayConfig = input.gatewayConfig || null;
  const disputePacket = input.disputePacket || {};
  const sourceErrors = options.sourceErrors || [];
  const policyAudit = await verifyProductionPolicy(policy);
  const bindingValidation = validatePilotBinding(binding, {
    policy,
    requirePolicy: true
  });
  const walletControl =
    options.walletControlResult ||
    (await verifyPilotWalletControlSignatureAsync(binding, options.walletControlVerifier || {}));
  const gateway = validateLiveGatewayConfig(gatewayConfig, binding, policy);
  const dispute = validatePrePilotDisputePacket(disputePacket, binding);
  const runtime = validateLivePilotRuntime(options.env || {});
  const checks = [
    preflightCheck("sources.loaded", sourceErrors.length === 0, "Required preflight source files loaded", sourceErrors),
    preflightCheck("policy.production", policyAudit.valid, "Production policy verifies", policyAudit.reasons),
    preflightCheck("binding.valid", bindingValidation.valid, "Pilot binding validates against signed policy", bindingValidation.reasons),
    preflightCheck("binding.wallet_control", walletControl.valid, "Agent wallet control signature verifies", walletControl.reasons),
    preflightCheck("gateway.live", gateway.valid, "Gateway config is merchant-approved and live-pilot ready", gateway.reasons),
    preflightCheck("dispute.valid", dispute.valid, "Dispute packet is valid for pilot support path", dispute.reasons),
    preflightCheck("runtime.safe", runtime.valid, "Runtime env has production and secret-safety flags", runtime.reasons)
  ];
  const reasons = [
    ...sourceErrors,
    ...policyAudit.reasons.map((reason) => `policy: ${reason}`),
    ...bindingValidation.reasons.map((reason) => `binding: ${reason}`),
    ...walletControl.reasons.map((reason) => `walletControl: ${reason}`),
    ...gateway.reasons.map((reason) => `gateway: ${reason}`),
    ...dispute.reasons.map((reason) => `dispute: ${reason}`),
    ...runtime.reasons.map((reason) => `runtime: ${reason}`)
  ];
  const warnings = [
    ...policyAudit.warnings.map((warning) => `policy: ${warning}`),
    ...bindingValidation.warnings.map((warning) => `binding: ${warning}`),
    ...walletControl.warnings.map((warning) => `walletControl: ${warning}`),
    ...gateway.warnings.map((warning) => `gateway: ${warning}`),
    ...dispute.warnings.map((warning) => `dispute: ${warning}`),
    ...runtime.warnings.map((warning) => `runtime: ${warning}`)
  ];

  return {
    generatedAt: new Date().toISOString(),
    valid: reasons.length === 0,
    status: reasons.length === 0 ? "ready_for_merchant_approved_pilot" : "action_required",
    checks,
    reasons: [...new Set(reasons)],
    warnings: [...new Set(warnings)],
    binding: summarizePilotBinding(binding, { policy }),
    policy: {
      valid: policyAudit.valid,
      policyId: policyAudit.policyId,
      fingerprint: policyAudit.fingerprint,
      controller: policyAudit.controller,
      recoveredController: policyAudit.recoveredController,
      signatureMode: policyAudit.signatureMode,
      verifierMode: policyAudit.verifierMode
    },
    walletControl,
    gateway,
    dispute,
    runtime,
    evidenceBoundary: {
      startsPilotTraffic: false,
      movesFunds: false,
      countsAsPilotEvidence: false,
      readyPilotRequiresReceiptsAfterThis: [
        "one merchant-approved allowed 2xx receipt",
        "one merchant-approved denied guard receipt",
        "pilot-report passes for the merchant receipt log"
      ]
    },
    nextAction:
      reasons.length === 0
        ? "Run one merchant-approved protected endpoint test, then validate the receipt log with npm run pilot-report"
        : "Fix failed preflight checks before sending any merchant-approved pilot traffic"
  };
}

export function validateLiveGatewayConfig(configInput = {}, binding = {}, policy = {}) {
  const reasons = [];
  const warnings = [];
  let config = null;

  try {
    config = normalizeGatewayConfig(configInput || {});
  } catch (error) {
    return {
      valid: false,
      reasons: [`Gateway config invalid: ${error.message}`],
      warnings,
      route: null,
      evidence: null
    };
  }

  const merchantId = binding?.pilot?.merchantId || "";
  const route = config.routes.find((item) => item.merchantId === merchantId);
  const evidence = normalizeReceiptEvidence(route?.evidence || config.evidence);
  const settlement = route?.settlement || config.settlement || {};
  const approval = settlement.merchantApproval || route?.merchantApproval || {};

  if (!merchantId) reasons.push("Pilot binding must include pilot.merchantId");
  if (!route) reasons.push(`Gateway config has no route for pilot merchant ${merchantId || "unknown"}`);
  if (!config.receipts?.path) reasons.push("Gateway config must write receipts to a configured path");
  if (isLocalUrl(config.upstream?.baseUrl)) reasons.push("Live pilot upstream.baseUrl must not be localhost");
  if (!CREDIBLE_PILOT_ENVIRONMENTS.has(evidence.environment)) {
    reasons.push("Gateway evidence environment must be testnet or mainnet");
  }
  if (evidence.merchantApproved !== true) reasons.push("Gateway evidence must set merchantApproved=true");
  if (binding?.pilot?.network && evidence.network && evidence.network !== binding.pilot.network) {
    reasons.push("Gateway evidence network must match pilot binding network");
  }
  if (route && Number(route.amountUsd) > Number(policy?.perTxCapUsd || 0)) {
    reasons.push("Gateway route amountUsd exceeds policy perTxCapUsd");
  }
  if (policy?.allowedMerchants && merchantId && !policy.allowedMerchants.includes(merchantId)) {
    reasons.push("Policy allowedMerchants does not include pilot merchant");
  }
  if (settlement.required !== true) reasons.push("Live pilot gateway route must require settlement proof");
  if (!settlement.proofType) reasons.push("Live pilot gateway route must declare settlement.proofType");
  if (evidence.rail === "x402" && !String(settlement.proofType || "").toLowerCase().includes("x402")) {
    reasons.push("x402 pilot evidence must use an x402 settlement proof type");
  }
  if (evidence.rail === "x402" && !settlement.paymentRequirements) {
    reasons.push("x402 pilot route must include paymentRequirements");
  }
  if (approval.approved !== true) reasons.push("Live pilot payment requirements need merchant approval");
  if (!approval.approvalRef && !approval.evidenceRef && !approval.source) {
    reasons.push("Live pilot merchant approval needs approvalRef, evidenceRef, or source");
  }
  if (approval.approvedAt && !isValidDate(approval.approvedAt)) {
    reasons.push("Live pilot merchant approval approvedAt must be a valid date");
  }
  if (approval.merchantId && merchantId && approval.merchantId !== merchantId) {
    reasons.push("Live pilot merchant approval merchantId must match binding merchant");
  }
  if (!route?.rateLimit && !config.rateLimit) warnings.push("Gateway has no explicit rate limit for pilot traffic");

  return {
    valid: reasons.length === 0,
    reasons,
    warnings,
    gateway: config.name,
    upstream: {
      baseUrl: config.upstream.baseUrl,
      timeoutMs: config.upstream.timeoutMs
    },
    receiptPath: config.receipts.path || null,
    route: route
      ? {
          pathPrefix: route.pathPrefix,
          merchantId: route.merchantId,
          amountUsd: route.amountUsd
        }
      : null,
    evidence,
    settlement: {
      required: settlement.required === true,
      proofType: settlement.proofType || null,
      paymentRequirementsPresent: Boolean(settlement.paymentRequirements),
      merchantApproval: {
        approved: approval.approved === true,
        merchantId: approval.merchantId || null,
        approvedAt: approval.approvedAt || null,
        source: approval.approvalRef || approval.evidenceRef || approval.source || null
      }
    }
  };
}

export function validatePrePilotDisputePacket(packet = {}, binding = {}) {
  const validation = validateDisputePacket(packet);
  const reasons = [...validation.reasons];
  const warnings = [...validation.warnings];
  const merchantId = binding?.pilot?.merchantId || "";

  if (merchantId && packet?.merchantId && packet.merchantId !== merchantId) {
    reasons.push("Dispute packet merchantId must match pilot binding merchantId");
  }
  if (packet?.status === "resolved" || packet?.status === "rejected" || packet?.status === "withdrawn") {
    warnings.push("Dispute packet is already closed; confirm this is the intended support path");
  }

  return {
    valid: reasons.length === 0,
    reasons,
    warnings,
    merchantId: packet?.merchantId || null,
    status: packet?.status || null,
    receiptCount: Array.isArray(packet?.receiptIds) ? packet.receiptIds.length : 0,
    evidenceRefCount: Array.isArray(packet?.evidenceRefs) ? packet.evidenceRefs.length : 0,
    redactionFlags: validation.redactionFlags.map((flag) => flag.id)
  };
}

export function validateLivePilotRuntime(env = {}) {
  const reasons = [];
  const warnings = [];

  if (env.ALLOW_PRODUCTION !== "1" && env.NODE_ENV !== "production") {
    reasons.push("ALLOW_PRODUCTION=1 or NODE_ENV=production is required for live pilot runtime");
  }
  if (env.ALLOW_REQUIRE_AGENT_SIGNATURE !== "1") {
    reasons.push("ALLOW_REQUIRE_AGENT_SIGNATURE=1 is required for live pilot runtime");
  }
  if (env.ALLOW_USE_FIXTURE === "1") reasons.push("ALLOW_USE_FIXTURE=1 is not allowed for live pilot runtime");
  if (env.ALLOW_CONTROLLER_PRIVATE_KEY) reasons.push("ALLOW_CONTROLLER_PRIVATE_KEY must not be present in live runtime");
  if (env.ALLOW_AGENT_PRIVATE_KEY) reasons.push("ALLOW_AGENT_PRIVATE_KEY must not be present in live runtime");
  if (!env.ALLOW_POLICY_PATH && !env.ALLOW_POLICY_JSON) warnings.push("Runtime policy source was not provided in env");

  return {
    valid: reasons.length === 0,
    reasons,
    warnings,
    checks: {
      production: env.ALLOW_PRODUCTION === "1" || env.NODE_ENV === "production",
      requireAgentSignature: env.ALLOW_REQUIRE_AGENT_SIGNATURE === "1",
      fixtureEnabled: env.ALLOW_USE_FIXTURE === "1",
      controllerPrivateKeyPresent: Boolean(env.ALLOW_CONTROLLER_PRIVATE_KEY),
      agentPrivateKeyPresent: Boolean(env.ALLOW_AGENT_PRIVATE_KEY),
      policySourceConfigured: Boolean(env.ALLOW_POLICY_PATH || env.ALLOW_POLICY_JSON)
    }
  };
}

function preflightCheck(id, condition, message, details = []) {
  return {
    id,
    status: condition ? "pass" : "fail",
    message,
    details
  };
}

function isValidDate(value) {
  return Number.isFinite(new Date(value).getTime());
}

function isLocalUrl(value) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === "localhost" || hostname === "0.0.0.0" || hostname === "::1" || hostname.startsWith("127.") || hostname.endsWith(".local");
  } catch {
    return false;
  }
}
