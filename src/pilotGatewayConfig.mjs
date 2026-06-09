import { normalizeGatewayConfig } from "./gateway.mjs";
import { buildPilotAuthorizationReport } from "./pilotAuthorization.mjs";

const DEFAULT_FORWARD_HEADERS = [
  "accept",
  "content-type",
  "user-agent",
  "payment-signature",
  "x-payment",
  "x-allow-nonce",
  "x-intent-nonce",
  "x-allow-metadata"
];

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

export function buildPilotGatewayConfigReport(packet = {}, context = {}, options = {}) {
  const authorization = buildPilotAuthorizationReport(packet, context, options.authorizationOptions || {});
  const paymentRequirements = options.paymentRequirements ?? options.x402PaymentRequirements ?? null;
  const paymentReport = validatePilotGatewayPaymentRequirements(paymentRequirements, {
    required: authorization.paymentRail === "x402",
    expectedNetwork: authorization.network,
    paymentRail: authorization.paymentRail
  });
  const gatewayConfig = buildPilotGatewayConfigDraft(packet, authorization, paymentReport, options);
  const configValidation = validatePilotGatewayConfigDraft(gatewayConfig);
  const reasons = unique([
    ...authorization.reasons.map((reason) => `authorization: ${reason}`),
    ...paymentReport.reasons,
    ...configValidation.reasons
  ]);
  const warnings = unique([
    ...authorization.warnings.map((warning) => `authorization: ${warning}`),
    ...paymentReport.warnings,
    ...configValidation.warnings
  ]);
  const status = statusForGatewayReport({
    authorization,
    paymentReport,
    configValidation,
    reasons
  });

  return {
    generatedAt: new Date().toISOString(),
    valid: status === "ready_for_live_pilot_preflight" && reasons.length === 0,
    status,
    authorization: {
      valid: authorization.valid,
      authorizationId: authorization.authorizationId,
      approvalRef: authorization.approvalRef,
      merchantId: authorization.merchantId,
      environment: authorization.environment,
      network: authorization.network,
      paymentRail: authorization.paymentRail,
      reasons: authorization.reasons,
      warnings: authorization.warnings
    },
    paymentRequirements: {
      valid: paymentReport.valid,
      required: paymentReport.required,
      present: paymentReport.present,
      network: paymentReport.paymentRequirements?.network || null,
      asset: paymentReport.paymentRequirements?.asset || null,
      amount: paymentReport.paymentRequirements?.amount || null,
      payTo: paymentReport.paymentRequirements?.payTo || null,
      reasons: paymentReport.reasons,
      warnings: paymentReport.warnings
    },
    gatewayConfig,
    configValidation,
    reasons,
    warnings,
    commands: {
      livePilotPreflight:
        "npm run live-pilot-preflight -- ops/pilot_binding.template.json ops/signed-policy.local.json <authorized-gateway-config.json> ops/dispute_template.json",
      x402Smoke: "npm run x402-smoke -- <authorized-gateway-config.json>"
    },
    evidenceBoundary: {
      startsGateway: false,
      startsPilotTraffic: false,
      movesFunds: false,
      signsWalletPayloads: false,
      countsAsPilotEvidence: false,
      approvesPublicClaims: false,
      marksMerchantLive: false,
      storesSecrets: false,
      marksTokenReady: false
    },
    nextAction: nextActionForStatus(status)
  };
}

export function buildPilotGatewayConfigDraft(packet = {}, authorization = {}, paymentReport = {}, options = {}) {
  const merchant = packet.merchant || {};
  const pilot = packet.pilot || {};
  const endpoint = parseUrl(pilot.testEndpoint || authorization.scope?.testEndpoint || "");
  const merchantId = merchant.merchantId || authorization.merchantId || "";
  const pathPrefix = pilot.pathPrefix || authorization.scope?.pathPrefix || endpoint?.pathname || "/";
  const network = pilot.network || authorization.network || "";
  const paymentRail = pilot.paymentRail || authorization.paymentRail || "";
  const maxRequests = Number(pilot.maxRequests || authorization.scope?.maxRequests || 0);
  const amountUsd = Number(pilot.amountUsd || authorization.scope?.amountUsd || 0);
  const approvalRef = authorization.approvalRef || (packet.authorizationId ? `pilot-authorization:${packet.authorizationId}` : "");
  const paymentReady = paymentReport.valid === true;
  const rateLimit = maxRequests > 0 ? { max: Math.floor(maxRequests), windowMs: Number(options.rateLimitWindowMs || 86_400_000) } : null;
  const settlement = {
    required: true,
    chain: chainLabelForNetwork(network),
    asset: options.asset || "USDC",
    proofType: paymentRail === "x402" ? "x402-facilitator" : "manual-usdc-receipt",
    merchantApproval: {
      approved: authorization.valid === true && paymentReady,
      merchantId,
      approvedAt: merchant.approvedAt || null,
      approvalRef,
      source: "pilot_authorization"
    }
  };

  if (paymentRail === "x402" && paymentReport.paymentRequirements) {
    settlement.paymentRequirements = paymentReport.paymentRequirements;
  }
  if (options.facilitator && typeof options.facilitator === "object") {
    settlement.facilitator = redactedFacilitatorConfig(options.facilitator);
  }

  const config = {
    name: `allow-${merchantId || "merchant"}-authorized-pilot`,
    listen: {
      host: "127.0.0.1",
      port: Number(options.port || 4190)
    },
    upstream: {
      baseUrl: endpoint?.origin || "",
      timeoutMs: Number(options.timeoutMs || 10_000)
    },
    receipts: {
      path: pilot.receiptLogPath || authorization.scope?.receiptLogPath || ""
    },
    evidence: {
      environment: pilot.environment || authorization.environment || "",
      merchantApproved: authorization.valid === true,
      rail: paymentRail,
      network,
      label: pilot.evidenceLabel || packet.evidence?.label || `authorized-pilot-${merchantId || "merchant"}`
    },
    settlement,
    forwardHeaders: options.forwardHeaders || DEFAULT_FORWARD_HEADERS,
    routes: [
      {
        pathPrefix,
        merchantId,
        amountUsd,
        metadataHeader: "x-allow-metadata",
        resourceTemplate: "path_and_query"
      }
    ]
  };

  if (rateLimit) config.rateLimit = rateLimit;
  if (rateLimit) config.routes[0].rateLimit = rateLimit;

  return config;
}

export function validatePilotGatewayPaymentRequirements(input = null, options = {}) {
  const required = options.required === true;
  const reasons = [];
  const warnings = [];
  const paymentRequirements = normalizePaymentRequirements(input);
  const present = Boolean(paymentRequirements);

  if (!required && !present) {
    return {
      valid: true,
      required,
      present,
      paymentRequirements: null,
      reasons,
      warnings
    };
  }

  if (required && !present) {
    reasons.push("x402 paymentRequirements are required before a pilot gateway config is live-preflight ready");
  }

  if (present) {
    requireText(reasons, paymentRequirements.scheme, "paymentRequirements.scheme");
    requireText(reasons, paymentRequirements.network, "paymentRequirements.network");
    requireText(reasons, paymentRequirements.asset, "paymentRequirements.asset");
    requireText(reasons, paymentRequirements.amount, "paymentRequirements.amount");
    requireText(reasons, paymentRequirements.payTo, "paymentRequirements.payTo");
    if (paymentRequirements.network && options.expectedNetwork && paymentRequirements.network !== options.expectedNetwork) {
      reasons.push("paymentRequirements.network must match the pilot authorization network");
    }
    if (paymentRequirements.asset && !ADDRESS_PATTERN.test(paymentRequirements.asset)) {
      reasons.push("paymentRequirements.asset must be a 20-byte EVM address");
    }
    if (paymentRequirements.payTo && !ADDRESS_PATTERN.test(paymentRequirements.payTo)) {
      reasons.push("paymentRequirements.payTo must be a 20-byte EVM address");
    }
    if (paymentRequirements.amount && !/^[1-9][0-9]*$/.test(String(paymentRequirements.amount))) {
      reasons.push("paymentRequirements.amount must be a positive integer string in token base units");
    }
    if (!Number.isFinite(Number(paymentRequirements.maxTimeoutSeconds)) || Number(paymentRequirements.maxTimeoutSeconds) <= 0) {
      reasons.push("paymentRequirements.maxTimeoutSeconds must be positive");
    }
    if (Number(paymentRequirements.maxTimeoutSeconds) > 600) {
      warnings.push("paymentRequirements.maxTimeoutSeconds is longer than 10 minutes; confirm the facilitator expects this window");
    }
    if (options.paymentRail && options.paymentRail !== "x402") {
      warnings.push("paymentRequirements were supplied for a non-x402 pilot rail");
    }
  }

  return {
    valid: reasons.length === 0,
    required,
    present,
    paymentRequirements,
    reasons: unique(reasons),
    warnings: unique(warnings)
  };
}

export function validatePilotGatewayConfigDraft(config = {}) {
  try {
    const normalized = normalizeGatewayConfig(config);
    return {
      valid: true,
      reasons: [],
      warnings: [],
      normalized: {
        name: normalized.name,
        upstream: normalized.upstream,
        receiptPath: normalized.receipts.path,
        routeCount: normalized.routes.length,
        settlementRequired: normalized.settlement?.required === true,
        merchantApproved: normalized.evidence.merchantApproved === true
      }
    };
  } catch (error) {
    return {
      valid: false,
      reasons: [`Gateway config draft invalid: ${error.message}`],
      warnings: [],
      normalized: null
    };
  }
}

function normalizePaymentRequirements(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const source = input.paymentRequirements && typeof input.paymentRequirements === "object" ? input.paymentRequirements : input;
  return {
    scheme: source.scheme || "exact",
    network: source.network || "",
    asset: source.asset || source.assetAddress || "",
    amount: source.amount == null ? "" : String(source.amount),
    payTo: source.payTo || "",
    maxTimeoutSeconds: Number(source.maxTimeoutSeconds || 60),
    ...(source.extra ? { extra: source.extra } : {})
  };
}

function statusForGatewayReport({ authorization, paymentReport, configValidation, reasons }) {
  if (!authorization.valid) return "needs_authorization_fixes";
  if (!paymentReport.valid) return "draft_needs_payment_requirements";
  if (!configValidation.valid) return "needs_gateway_config_fixes";
  if (reasons.length === 0) return "ready_for_live_pilot_preflight";
  return "action_required";
}

function nextActionForStatus(status) {
  if (status === "ready_for_live_pilot_preflight") {
    return "Save gatewayConfig to an approved pilot config path, then run live-pilot-preflight with the signed policy and pilot binding.";
  }
  if (status === "draft_needs_payment_requirements") {
    return "Attach merchant-approved x402 paymentRequirements from the facilitator before live pilot preflight.";
  }
  if (status === "needs_authorization_fixes") {
    return "Fix the pilot authorization packet, validated intake, or completed interview evidence before building a live pilot gateway config.";
  }
  return "Fix gateway config draft errors before live pilot preflight.";
}

function chainLabelForNetwork(network) {
  if (network === "eip155:8453") return "Base";
  if (network === "eip155:84532") return "Base Sepolia";
  return network || "";
}

function parseUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function redactedFacilitatorConfig(config = {}) {
  const output = {};
  for (const key of ["baseUrl", "verifyPath", "settlePath", "authRequired", "settle"]) {
    if (config[key] !== undefined) output[key] = config[key];
  }
  return output;
}

function requireText(reasons, value, field) {
  if (!String(value || "").trim()) reasons.push(`Missing ${field}`);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
