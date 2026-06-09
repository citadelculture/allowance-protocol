export const MERCHANT_SCORE_FIELDS = [
  "existingEndpoint",
  "usageBasedPricing",
  "agentUsersLikely",
  "metadataOrAbuseRisk",
  "canTestWithinWeek",
  "publicProofPotential"
];

const KNOWN_ENDPOINT_TYPES = new Set(["api", "mcp", "gateway", "content"]);
const KNOWN_PRICING_MODELS = new Set(["per_request", "per_result", "per_token", "per_job", "bundle"]);
const KNOWN_SURFACES = new Set(["server_middleware", "client_middleware", "mcp_gateway", "wallet_policy_hook"]);

export function validateMerchantIntake(intake) {
  if (!intake || typeof intake !== "object" || Array.isArray(intake)) {
    return {
      valid: false,
      reasons: ["Merchant intake must be a JSON object"],
      warnings: []
    };
  }

  const reasons = [];
  const warnings = [];
  const service = intake.service || {};
  const fit = intake.agentPaymentFit || {};
  const risk = intake.risk || {};
  const integration = intake.integration || {};

  requireText(reasons, intake.merchantId, "merchantId");
  requireText(reasons, intake.name, "name");
  requireKnown(reasons, service.endpointType, KNOWN_ENDPOINT_TYPES, "service.endpointType");
  requireKnown(reasons, service.pricingModel, KNOWN_PRICING_MODELS, "service.pricingModel");
  requirePositive(reasons, service.examplePriceUsd, "service.examplePriceUsd");
  requireKnown(reasons, integration.preferredSurface, KNOWN_SURFACES, "integration.preferredSurface");
  requireText(reasons, integration.successMetric, "integration.successMetric");
  requireArray(reasons, risk.sensitiveMetadataClasses, "risk.sensitiveMetadataClasses");
  requireArray(reasons, risk.abuseModes, "risk.abuseModes");
  requirePositive(reasons, risk.maxSafeTestSpendUsd, "risk.maxSafeTestSpendUsd");

  if (!integration.canTestThisWeek) {
    warnings.push("Merchant is not marked ready for a test this week");
  }

  if (!fit.currentX402Support && !fit.currentMcpSupport) {
    warnings.push("Merchant does not yet expose x402 or MCP support");
  }

  if (!guardrailDemand(fit)) {
    warnings.push("No explicit allowance need recorded yet");
  }

  return {
    valid: reasons.length === 0,
    reasons,
    warnings
  };
}

export function scoreMerchantIntake(intake, options = {}) {
  const derived = deriveMerchantScore(intake || {});
  const explicit = intake?.score || {};
  const score = {};

  for (const field of MERCHANT_SCORE_FIELDS) {
    score[field] =
      options.useExplicitScore && explicit[field] !== undefined ? clampScore(explicit[field]) : derived[field];
  }

  const total = MERCHANT_SCORE_FIELDS.reduce((sum, field) => sum + score[field], 0);

  return {
    score,
    total,
    tier: tierForScore(total)
  };
}

export function summarizeMerchantReadiness(intake, options = {}) {
  const validation = validateMerchantIntake(intake);
  const scoring = scoreMerchantIntake(intake, options);
  const readyForTest =
    validation.valid && scoring.total >= 9 && Boolean(intake?.integration?.canTestThisWeek);

  return {
    merchantId: intake?.merchantId || null,
    name: intake?.name || null,
    valid: validation.valid,
    readyForTest,
    tier: scoring.tier,
    score: scoring.total,
    scoreBreakdown: scoring.score,
    reasons: validation.reasons,
    warnings: validation.warnings,
    nextAction: merchantNextAction(validation, scoring, intake)
  };
}

export function buildMerchantPolicyPatch(intake) {
  const readiness = summarizeMerchantReadiness(intake);
  const service = intake?.service || {};
  const risk = intake?.risk || {};
  const merchantId = intake?.merchantId || "";
  const examplePrice = Number(service.examplePriceUsd || 0);
  const maxSafeTestSpend = Number(risk.maxSafeTestSpendUsd || 0);

  return {
    merchant: {
      id: merchantId,
      name: intake?.name || merchantId,
      domain: domainFromWebsite(intake?.website),
      category: service.category || "other",
      trustScore: suggestedTrustScore(readiness.score),
      defaultPriceUsd: roundMoney(examplePrice),
      riskTags: [...new Set([...(risk.sensitiveMetadataClasses || []), ...(risk.abuseModes || [])])]
    },
    policyPatch: {
      allowedMerchants: merchantId ? [merchantId] : [],
      perTxCapUsd: roundMoney(examplePrice || maxSafeTestSpend || 0.01),
      dailyCapUsd: roundMoney(Math.max(maxSafeTestSpend, examplePrice * 5, 0.05)),
      requireReceipt: true,
      requireSignedPolicy: true,
      requireIntentNonce: true,
      blockPii: (risk.sensitiveMetadataClasses || []).length > 0
    },
    readiness
  };
}

function deriveMerchantScore(intake) {
  const service = intake.service || {};
  const fit = intake.agentPaymentFit || {};
  const risk = intake.risk || {};
  const integration = intake.integration || {};
  const hasEndpoint = KNOWN_ENDPOINT_TYPES.has(service.endpointType);
  const hasTestEndpoint = Boolean(String(integration.testEndpoint || "").trim());
  const hasPricing = KNOWN_PRICING_MODELS.has(service.pricingModel);
  const hasPrice = Number(service.examplePriceUsd) > 0;
  const hasRisk =
    (risk.sensitiveMetadataClasses || []).length > 0 ||
    (risk.abuseModes || []).length > 0 ||
    Number(risk.maxSafeTestSpendUsd) > 0;
  const hasPaymentSurface = Boolean(fit.currentX402Support || fit.currentMcpSupport);
  const hasSuccessMetric = Boolean(String(integration.successMetric || "").trim());

  return {
    existingEndpoint: hasTestEndpoint ? 2 : hasEndpoint ? 1 : 0,
    usageBasedPricing: hasPricing && hasPrice ? 2 : hasPricing || hasPrice ? 1 : 0,
    agentUsersLikely: fit.expectsAgentUsers && hasPaymentSurface ? 2 : fit.expectsAgentUsers || hasPaymentSurface ? 1 : 0,
    metadataOrAbuseRisk: guardrailDemand(fit) && hasRisk ? 2 : guardrailDemand(fit) || hasRisk ? 1 : 0,
    canTestWithinWeek: integration.canTestThisWeek && hasTestEndpoint ? 2 : integration.canTestThisWeek ? 1 : 0,
    publicProofPotential: hasSuccessMetric && readinessSignal(intake) ? 2 : hasSuccessMetric ? 1 : 0
  };
}

function merchantNextAction(validation, scoring, intake) {
  if (!validation.valid) {
    return `Complete required fields: ${validation.reasons.slice(0, 3).join("; ")}`;
  }
  if (scoring.total < 6) return "Keep in nurture until agent-payment fit improves";
  if (!intake?.integration?.canTestThisWeek) return "Schedule a low-risk protected endpoint test";
  if (scoring.total < 9) return "Ask for async feedback before integration work";
  return "Create Allow policy patch and run protected endpoint test";
}

function guardrailDemand(fit = {}) {
  return Boolean(
    fit.needsSpendCaps || fit.needsMetadataFilters || fit.needsReplayProtection || fit.needsReceipts
  );
}

function readinessSignal(intake = {}) {
  const text = `${intake.notes || ""} ${intake.integration?.successMetric || ""}`;
  return /\b(public|case study|launch|demo|tweet|post|showcase|reference)\b/i.test(text);
}

function requireText(reasons, value, field) {
  if (!String(value || "").trim()) reasons.push(`Missing ${field}`);
}

function requireKnown(reasons, value, allowed, field) {
  if (!allowed.has(String(value || ""))) reasons.push(`Invalid ${field}`);
}

function requireArray(reasons, value, field) {
  if (!Array.isArray(value)) reasons.push(`${field} must be an array`);
}

function requirePositive(reasons, value, field) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) reasons.push(`${field} must be positive`);
}

function tierForScore(score) {
  if (score >= 9) return "immediate";
  if (score >= 6) return "async";
  if (score >= 3) return "nurture";
  return "skip";
}

function clampScore(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(2, Math.round(number)));
}

function suggestedTrustScore(score) {
  return Math.max(50, Math.min(95, 55 + score * 3));
}

function domainFromWebsite(website = "") {
  try {
    return new URL(website).hostname;
  } catch {
    return "";
  }
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}
