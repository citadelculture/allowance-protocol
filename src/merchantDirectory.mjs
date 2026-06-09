import { buildMerchantPolicyPatch, summarizeMerchantReadiness } from "./merchantIntake.mjs";
import { verifyMerchantProfileSignatureAsync } from "./merchantProfileSigner.mjs";

export const MERCHANT_DIRECTORY_STATUSES = ["candidate", "pilot_ready", "live", "paused"];
export const MERCHANT_DIRECTORY_SURFACES = ["x402_preflight", "allow_gateway", "mcp_guard", "wallet_policy_hook"];
export const MERCHANT_DIRECTORY_PROTOCOLS = ["x402", "allow_gateway", "mcp", "wallet"];
export const DATA_HANDLING_CLASSES = ["public", "low", "sensitive", "restricted"];

export function validateMerchantDirectory(directory, options = {}) {
  const reasons = [];
  const warnings = [];
  const entries = [];

  if (!directory || typeof directory !== "object" || Array.isArray(directory)) {
    return {
      valid: false,
      reasons: ["Merchant directory must be a JSON object"],
      warnings: [],
      entries: []
    };
  }

  if (!String(directory.version || "").trim()) reasons.push("Missing version");
  if (!Array.isArray(directory.merchants)) reasons.push("merchants must be an array");

  const ids = new Set();
  for (const [index, entry] of (directory.merchants || []).entries()) {
    const validation = validateMerchantDirectoryEntry(entry, options);
    const id = entry?.id || `merchant[${index}]`;
    if (ids.has(id)) validation.reasons.push(`Duplicate merchant id: ${id}`);
    ids.add(id);
    entries.push({ id, ...validation });
    reasons.push(...validation.reasons.map((reason) => `${id}: ${reason}`));
    warnings.push(...validation.warnings.map((warning) => `${id}: ${warning}`));
  }

  if ((directory.merchants || []).length === 0) reasons.push("Directory must include at least one merchant");

  return {
    valid: reasons.length === 0,
    reasons,
    warnings,
    entries
  };
}

export function validateMerchantDirectoryEntry(entry, options = {}) {
  const reasons = [];
  const warnings = [];
  const endpoint = entry?.endpoint || {};
  const pricing = entry?.pricing || {};
  const payment = entry?.payment || {};
  const risk = entry?.risk || {};
  const receipts = entry?.receipts || {};
  const now = options.now ? new Date(options.now) : new Date();

  requireText(reasons, entry?.id, "id");
  requireText(reasons, entry?.name, "name");
  requireKnown(reasons, entry?.status, MERCHANT_DIRECTORY_STATUSES, "status");
  requireKnownArray(reasons, entry?.surfaces, MERCHANT_DIRECTORY_SURFACES, "surfaces");
  requireKnown(reasons, endpoint.type, ["api", "mcp", "gateway", "content"], "endpoint.type");
  requireUrl(reasons, endpoint.baseUrl, "endpoint.baseUrl");
  requireKnown(reasons, pricing.model, ["per_request", "per_result", "per_token", "per_job", "bundle"], "pricing.model");
  requirePositive(reasons, pricing.unitUsd, "pricing.unitUsd");
  requireKnown(reasons, payment.protocol, MERCHANT_DIRECTORY_PROTOCOLS, "payment.protocol");
  requireText(reasons, payment.asset, "payment.asset");
  requireText(reasons, payment.chain, "payment.chain");
  requireKnown(reasons, risk.dataHandlingClass, DATA_HANDLING_CLASSES, "risk.dataHandlingClass");
  requireArray(reasons, risk.sensitiveMetadataClasses, "risk.sensitiveMetadataClasses");
  requireArray(reasons, risk.riskTags, "risk.riskTags");
  requireText(reasons, entry?.refundRules, "refundRules");
  requireText(reasons, entry?.disputeContact, "disputeContact");

  if (receipts.supported !== true) reasons.push("receipts.supported must be true");
  if (!Array.isArray(receipts.fields) || receipts.fields.length === 0) {
    reasons.push("receipts.fields must be a non-empty array");
  }

  if (entry?.status === "live") {
    requireText(reasons, entry.publicProof, "publicProof");
    requireText(reasons, entry.signer, "signer");
    requireText(reasons, entry.merchantSignature, "merchantSignature");
    if (entry.signatureMode !== "eip712") reasons.push("Live merchant profile signatureMode must be eip712");
  }

  if (!entry?.lastReviewedAt) {
    warnings.push("Missing lastReviewedAt");
  } else if (Number.isFinite(now.getTime())) {
    const reviewed = new Date(entry.lastReviewedAt);
    if (!Number.isFinite(reviewed.getTime())) {
      reasons.push("lastReviewedAt must be a valid date");
    } else if (now.getTime() - reviewed.getTime() > 90 * 24 * 60 * 60 * 1000) {
      warnings.push("Merchant directory entry is older than 90 days");
    }
  }

  return {
    valid: reasons.length === 0,
    reasons,
    warnings
  };
}

export function summarizeMerchantDirectory(directory, options = {}) {
  const validation = validateMerchantDirectory(directory, options);
  const merchants = directory?.merchants || [];
  const statusCounts = countBy(merchants, (merchant) => merchant.status || "unknown");
  const surfaceCounts = {};
  const chainCounts = countBy(merchants, (merchant) => merchant.payment?.chain || "unknown");
  const readyMerchants = merchants
    .filter((merchant) => ["pilot_ready", "live"].includes(merchant.status))
    .map((merchant) => merchant.id);
  const prices = merchants
    .map((merchant) => Number(merchant.pricing?.unitUsd))
    .filter((price) => Number.isFinite(price) && price > 0);

  for (const merchant of merchants) {
    for (const surface of merchant.surfaces || []) {
      surfaceCounts[surface] = (surfaceCounts[surface] || 0) + 1;
    }
  }

  return {
    valid: validation.valid,
    merchantCount: merchants.length,
    readyMerchantCount: readyMerchants.length,
    readyMerchants,
    statusCounts,
    surfaceCounts,
    chainCounts,
    averageUnitUsd: prices.length ? roundMoney(prices.reduce((sum, price) => sum + price, 0) / prices.length) : 0,
    reasons: validation.reasons,
    warnings: validation.warnings
  };
}

export async function validateMerchantDirectorySignatures(directory, options = {}) {
  const reasons = [];
  const warnings = [];
  const entries = [];
  const merchants = directory?.merchants;

  if (!directory || typeof directory !== "object" || Array.isArray(directory) || !Array.isArray(merchants)) {
    return {
      valid: false,
      reasons: ["Merchant directory must include merchants before signature validation"],
      warnings: [],
      checkedCount: 0,
      entries: []
    };
  }

  for (const [index, entry] of merchants.entries()) {
    const id = entry?.id || `merchant[${index}]`;
    const shouldCheck = entry?.status === "live" || (options.requirePilotReadySignatures === true && entry?.status === "pilot_ready");

    if (!shouldCheck) {
      entries.push({ id, checked: false, valid: true, reasons: [], warnings: [] });
      continue;
    }

    const verification = await verifyMerchantProfileSignatureAsync(entry, {
      requireSignature: true,
      mode: entry?.signatureMode,
      recoverSigner: options.recoverSigner
    });
    const entryResult = {
      id,
      checked: true,
      valid: verification.valid,
      mode: verification.mode,
      fingerprint: verification.fingerprint,
      recoveredSigner: verification.recoveredSigner,
      reasons: verification.reasons,
      warnings: verification.warnings
    };

    entries.push(entryResult);
    reasons.push(...verification.reasons.map((reason) => `${id}: ${reason}`));
    warnings.push(...verification.warnings.map((warning) => `${id}: ${warning}`));
  }

  return {
    valid: reasons.length === 0,
    reasons,
    warnings,
    checkedCount: entries.filter((entry) => entry.checked).length,
    entries
  };
}

export function merchantDirectoryEntryFromIntake(intake, options = {}) {
  const readiness = summarizeMerchantReadiness(intake);
  const policyPatch = buildMerchantPolicyPatch(intake);
  const service = intake?.service || {};
  const integration = intake?.integration || {};
  const risk = intake?.risk || {};
  const paymentProtocol = protocolForSurface(integration.preferredSurface);

  return {
    id: intake?.merchantId || "",
    name: intake?.name || intake?.merchantId || "",
    status: readiness.readyForTest ? "pilot_ready" : "candidate",
    surfaces: [surfaceForIntake(integration.preferredSurface)],
    endpoint: {
      type: service.endpointType || "api",
      baseUrl: integration.testEndpoint || intake?.website || "",
      testPath: pathFromUrl(integration.testEndpoint)
    },
    pricing: {
      model: service.pricingModel || "per_request",
      unitUsd: Number(service.examplePriceUsd || 0),
      currency: "USD"
    },
    payment: {
      protocol: paymentProtocol,
      asset: options.asset || "USDC",
      chain: options.chain || "Base"
    },
    risk: {
      dataHandlingClass: (risk.sensitiveMetadataClasses || []).length > 0 ? "sensitive" : "low",
      sensitiveMetadataClasses: risk.sensitiveMetadataClasses || [],
      riskTags: policyPatch.merchant.riskTags
    },
    receipts: {
      supported: true,
      fields: ["policyId", "merchantId", "amountUsd", "intentHash", "intentNonce", "metadataHash"]
    },
    refundRules: options.refundRules || "Pilot refunds and disputes are handled by written merchant agreement.",
    disputeContact: intake?.contact?.emailOrHandle || "not_provided",
    publicProof: "",
    lastReviewedAt: options.reviewedAt || new Date().toISOString().slice(0, 10),
    notes: readiness.nextAction
  };
}

function protocolForSurface(surface) {
  const protocols = {
    server_middleware: "x402",
    client_middleware: "x402",
    mcp_gateway: "mcp",
    wallet_policy_hook: "wallet"
  };
  return protocols[surface] || "allow_gateway";
}

function surfaceForIntake(surface) {
  const surfaces = {
    server_middleware: "x402_preflight",
    client_middleware: "x402_preflight",
    mcp_gateway: "mcp_guard",
    wallet_policy_hook: "wallet_policy_hook"
  };
  return surfaces[surface] || "allow_gateway";
}

function pathFromUrl(value = "") {
  try {
    return new URL(value).pathname || "/";
  } catch {
    return "";
  }
}

function countBy(items, getter) {
  return items.reduce((counts, item) => {
    const key = getter(item);
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function requireText(reasons, value, field) {
  if (!String(value || "").trim()) reasons.push(`Missing ${field}`);
}

function requireKnown(reasons, value, allowed, field) {
  if (!allowed.includes(String(value || ""))) reasons.push(`Invalid ${field}`);
}

function requireKnownArray(reasons, value, allowed, field) {
  if (!Array.isArray(value) || value.length === 0) {
    reasons.push(`${field} must be a non-empty array`);
    return;
  }
  for (const item of value) {
    if (!allowed.includes(String(item))) reasons.push(`Invalid ${field}: ${item}`);
  }
}

function requireArray(reasons, value, field) {
  if (!Array.isArray(value)) reasons.push(`${field} must be an array`);
}

function requirePositive(reasons, value, field) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) reasons.push(`${field} must be positive`);
}

function requireUrl(reasons, value, field) {
  try {
    new URL(value);
  } catch {
    reasons.push(`${field} must be a valid URL`);
  }
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 1000) / 1000;
}
