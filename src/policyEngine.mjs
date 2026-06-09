import { verifyPolicySignature, verifyPolicySignatureAsync } from "./policyVerifier.mjs";
import { verifyAgentIntentSignature, verifyAgentIntentSignatureAsync } from "./agentIntentSigner.mjs";

export const MERCHANTS = [
  {
    id: "mcp_search",
    name: "MCP Search Index",
    domain: "search.allow.dev",
    category: "data",
    trustScore: 92,
    defaultPriceUsd: 0.018,
    riskTags: ["metered", "low-latency"]
  },
  {
    id: "vector_cloud",
    name: "Vector Cloud",
    domain: "vectors.allow.dev",
    category: "inference",
    trustScore: 86,
    defaultPriceUsd: 0.11,
    riskTags: ["compute", "variable-cost"]
  },
  {
    id: "wallet_swapper",
    name: "Wallet Swapper",
    domain: "swap.allow.dev",
    category: "trading",
    trustScore: 58,
    defaultPriceUsd: 2.4,
    riskTags: ["market-risk", "irreversible"]
  },
  {
    id: "lead_graph",
    name: "Lead Graph",
    domain: "leads.allow.dev",
    category: "data",
    trustScore: 71,
    defaultPriceUsd: 0.35,
    riskTags: ["personal-data", "list-broker"]
  }
];

export const DEFAULT_POLICY = {
  policyId: "allow_policy_demo_alpha",
  agentId: "agent-alpha",
  controller: "0xController",
  controllerSignature: "sig_demo_10cee07e",
  signatureMode: "demo",
  chain: "Base",
  settlementAsset: "USDC",
  spentTodayUsd: 7.25,
  dailyCapUsd: 25,
  perTxCapUsd: 1.5,
  maxRiskScore: 64,
  allowedMerchants: ["mcp_search", "vector_cloud", "lead_graph"],
  blockedCategories: ["trading"],
  requireReceipt: true,
  requireSignedPolicy: true,
  requireIntentNonce: true,
  blockPii: true,
  metadataMaxChars: 320
};

const PII_PATTERNS = [
  { type: "email", pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i },
  { type: "phone", pattern: /\b(?:\+?\d[\s.-]?){9,15}\b/ },
  { type: "ssn", pattern: /\b\d{3}-\d{2}-\d{4}\b/ },
  { type: "private_key", pattern: /\b0x[a-fA-F0-9]{64}\b/ },
  { type: "seed_phrase", pattern: /\b(?:seed phrase|mnemonic|recovery phrase)\b/i },
  { type: "api_key", pattern: /\b(?:sk|pk|rk)_[A-Za-z0-9]{16,}\b/ }
];

export function mergeMerchantCatalog(extraMerchants = []) {
  const catalog = new Map();
  for (const merchant of MERCHANTS) catalog.set(merchant.id, normalizeMerchantProfile(merchant));
  for (const merchant of extraMerchants || []) {
    const normalized = normalizeMerchantProfile(merchant);
    if (normalized?.id) catalog.set(normalized.id, normalized);
  }
  return [...catalog.values()];
}

export function merchantCatalogFromOptions(options = {}) {
  return mergeMerchantCatalog([
    ...(Array.isArray(options.merchantCatalog) ? options.merchantCatalog : []),
    ...(Array.isArray(options.merchants) ? options.merchants : [])
  ]);
}

export function findMerchant(merchantId, merchants = MERCHANTS) {
  return (merchants || []).find((merchant) => merchant.id === merchantId) || null;
}

export function detectMetadataRisk(metadata = "") {
  const hits = [];
  for (const rule of PII_PATTERNS) {
    if (rule.pattern.test(metadata)) hits.push(rule.type);
  }
  return hits;
}

export function stableHash(input) {
  const text = typeof input === "string" ? input : JSON.stringify(input);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function policyFingerprint(policy = DEFAULT_POLICY) {
  return stableHash({
    policyId: policy.policyId,
    agentId: policy.agentId,
    controller: policy.controller,
    chain: policy.chain,
    settlementAsset: policy.settlementAsset,
    dailyCapUsd: Number(policy.dailyCapUsd),
    perTxCapUsd: Number(policy.perTxCapUsd),
    maxRiskScore: Number(policy.maxRiskScore),
    allowedMerchants: [...(policy.allowedMerchants || [])].sort(),
    blockedCategories: [...(policy.blockedCategories || [])].sort(),
    requireReceipt: Boolean(policy.requireReceipt),
    requireIntentNonce: Boolean(policy.requireIntentNonce),
    blockPii: Boolean(policy.blockPii)
  });
}

export function resolvePolicyId(policy = DEFAULT_POLICY) {
  return policy.policyId || `allow_policy_${policyFingerprint(policy)}`;
}

export function validatePolicyEnvelope(policy = DEFAULT_POLICY, options = {}) {
  const reasons = [];
  const warnings = [];

  if (!policy.controller) reasons.push("Missing policy controller");
  if (!policy.agentId) reasons.push("Missing policy agent id");
  if (!resolvePolicyId(policy)) reasons.push("Missing policy id");

  const fingerprint = policyFingerprint(policy);
  const signature = verifyPolicySignature(policy, fingerprint, options.policyVerifier || {});
  if (!signature.valid) reasons.push(...signature.reasons);
  warnings.push(...signature.warnings);

  return {
    reasons,
    warnings,
    fingerprint,
    policyId: resolvePolicyId(policy),
    signature
  };
}

export async function validatePolicyEnvelopeAsync(policy = DEFAULT_POLICY, options = {}) {
  const reasons = [];
  const warnings = [];

  if (!policy.controller) reasons.push("Missing policy controller");
  if (!policy.agentId) reasons.push("Missing policy agent id");
  if (!resolvePolicyId(policy)) reasons.push("Missing policy id");

  const fingerprint = policyFingerprint(policy);
  const signature = await verifyPolicySignatureAsync(policy, fingerprint, options.policyVerifier || {});
  if (!signature.valid) reasons.push(...signature.reasons);
  warnings.push(...signature.warnings);

  return {
    reasons,
    warnings,
    fingerprint,
    policyId: resolvePolicyId(policy),
    signature
  };
}

export function intentHash(intent = {}, policy = DEFAULT_POLICY) {
  return stableHash({
    policyId: resolvePolicyId(policy),
    merchantId: intent.merchantId,
    amountUsd: Number(intent.amountUsd),
    resource: intent.resource || "unbound",
    metadataHash: stableHash(String(intent.metadata || "")),
    intentNonce: intent.nonce || intent.intentNonce || ""
  });
}

export function hasReceiptReplay(receipts = [], policyId, intentNonce, hash) {
  return receipts.some((receipt) => {
    if (receipt.policyId !== policyId) return false;
    if (intentNonce && receipt.intentNonce === intentNonce) return true;
    return hash && receipt.intentHash === hash;
  });
}

export function summarizeReceipts(receipts = []) {
  const totalUsd = receipts.reduce((sum, receipt) => sum + Number(receipt.amountUsd || 0), 0);
  const blockedUsd = receipts.reduce((sum, receipt) => {
    return receipt.decision === "deny" ? sum + Number(receipt.amountUsd || 0) : sum;
  }, 0);
  const approvedCount = receipts.filter((receipt) => receipt.decision === "allow").length;
  const deniedCount = receipts.filter((receipt) => receipt.decision === "deny").length;

  return {
    totalUsd: roundMoney(totalUsd),
    blockedUsd: roundMoney(blockedUsd),
    approvedCount,
    deniedCount,
    receiptCount: receipts.length
  };
}

export function evaluatePaymentIntent(intent, policy = DEFAULT_POLICY, receipts = [], options = {}) {
  if (!intent || typeof intent !== "object") throw new Error("Missing payment intent");

  const merchant = findMerchant(intent.merchantId, merchantCatalogFromOptions(options));
  const amountUsd = Number(intent.amountUsd);
  const metadata = String(intent.metadata || "");
  const policyEnvelope = validatePolicyEnvelope(policy, options);
  const policyId = policyEnvelope.policyId;
  const nonce = String(intent.intentNonce || intent.nonce || "");
  const hash = intentHash({ ...intent, intentNonce: nonce }, policy);
  const agentIntentSignature = verifyAgentIntentSignature(
    { ...intent, intentNonce: nonce },
    policy,
    policyEnvelope.fingerprint,
    options.agentIntentVerifier || {}
  );
  const reasons = [];
  const warnings = [...policyEnvelope.warnings, ...agentIntentSignature.warnings];
  let riskScore = 0;
  let hardDeny = false;

  if (policyEnvelope.reasons.length > 0) {
    reasons.push(...policyEnvelope.reasons);
    riskScore += 45;
    hardDeny = true;
  }

  if (!agentIntentSignature.valid) {
    reasons.push(...agentIntentSignature.reasons);
    riskScore += 42;
    hardDeny = true;
  }

  if (policy.requireIntentNonce && !nonce) {
    reasons.push("Missing intent nonce for replay protection");
    riskScore += 34;
    hardDeny = true;
  }

  if (nonce && hasReceiptReplay(receipts, policyId, nonce, hash)) {
    reasons.push("Intent nonce already used for this policy");
    riskScore += 44;
    hardDeny = true;
  }

  if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
    reasons.push("Invalid payment amount");
    hardDeny = true;
  }

  if (!merchant) {
    reasons.push("Unknown merchant");
    riskScore += 40;
    hardDeny = true;
  } else {
    riskScore += Math.max(0, 100 - merchant.trustScore);
  }

  if (merchant && !(policy.allowedMerchants || []).includes(merchant.id)) {
    reasons.push("Merchant outside allowance list");
    riskScore += 28;
    hardDeny = true;
  }

  if (merchant && (policy.blockedCategories || []).includes(merchant.category)) {
    reasons.push(`Blocked merchant category: ${merchant.category}`);
    riskScore += 35;
    hardDeny = true;
  }

  if (amountUsd > Number(policy.perTxCapUsd)) {
    reasons.push(`Above per-transaction cap of ${formatUsd(policy.perTxCapUsd)}`);
    riskScore += 24;
    hardDeny = true;
  }

  const remainingBudget = Math.max(0, Number(policy.dailyCapUsd) - Number(policy.spentTodayUsd));
  if (amountUsd > remainingBudget) {
    reasons.push(`Above remaining daily allowance of ${formatUsd(remainingBudget)}`);
    riskScore += 30;
    hardDeny = true;
  }

  const metadataRisks = detectMetadataRisk(metadata);
  if (policy.blockPii && metadataRisks.length > 0) {
    reasons.push(`Payment metadata contains restricted data: ${metadataRisks.join(", ")}`);
    riskScore += 38;
    hardDeny = true;
  }

  if (metadata.length > Number(policy.metadataMaxChars)) {
    reasons.push(`Metadata exceeds ${policy.metadataMaxChars} characters`);
    riskScore += 12;
  }

  if (merchant?.riskTags?.includes("variable-cost")) {
    warnings.push("Variable-cost endpoint requires receipt reconciliation");
    riskScore += 6;
  }

  if (merchant?.riskTags?.includes("personal-data")) {
    warnings.push("Merchant handles personal-data adjacent inventory");
    riskScore += 10;
  }

  if (policy.requireReceipt && !intent.resource) {
    reasons.push("Missing resource identifier for receipt");
    riskScore += 10;
  }

  riskScore = clamp(Math.round(riskScore), 0, 100);
  const decision = hardDeny ? "deny" : riskScore > policy.maxRiskScore ? "review" : "allow";

  if (decision === "allow" && reasons.length === 0) {
    reasons.push("Within allowance, merchant, metadata, and receipt policy");
  }

  const receipt = {
    id: `allow_${stableHash({
      policyId,
      agentId: policy.agentId,
      merchantId: intent.merchantId,
      amountUsd,
      resource: intent.resource,
      metadataHash: stableHash(metadata),
      intentNonce: nonce,
      intentHash: hash
    })}`,
    createdAt: new Date().toISOString(),
    policyId,
    policyFingerprint: policyEnvelope.fingerprint,
    policySignatureMode: policyEnvelope.signature.mode,
    agentId: policy.agentId,
    merchantId: intent.merchantId,
    merchantName: merchant?.name || "Unknown",
    amountUsd: roundMoney(amountUsd || 0),
    decision,
    riskScore,
    intentNonce: nonce || "missing",
    intentHash: hash,
    agentIntentSignatureMode: agentIntentSignature.mode,
    agentSigner: agentIntentSignature.recoveredSigner || null,
    metadataHash: stableHash(metadata),
    resource: intent.resource || "unbound"
  };

  return {
    decision,
    riskScore,
    reasons,
    warnings,
    receipt,
    remainingBudgetUsd: roundMoney(remainingBudget),
    projectedRemainingUsd: roundMoney(Math.max(0, remainingBudget - (decision === "allow" ? amountUsd : 0))),
    stats: summarizeReceipts(receipts)
  };
}

export async function evaluatePaymentIntentAsync(intent, policy = DEFAULT_POLICY, receipts = [], options = {}) {
  if (!intent || typeof intent !== "object") throw new Error("Missing payment intent");

  const merchant = findMerchant(intent.merchantId, merchantCatalogFromOptions(options));
  const amountUsd = Number(intent.amountUsd);
  const metadata = String(intent.metadata || "");
  const policyEnvelope = await validatePolicyEnvelopeAsync(policy, options);
  const policyId = policyEnvelope.policyId;
  const nonce = String(intent.intentNonce || intent.nonce || "");
  const hash = intentHash({ ...intent, intentNonce: nonce }, policy);
  const agentIntentSignature = await verifyAgentIntentSignatureAsync(
    { ...intent, intentNonce: nonce },
    policy,
    policyEnvelope.fingerprint,
    options.agentIntentVerifier || {}
  );
  const reasons = [];
  const warnings = [...policyEnvelope.warnings, ...agentIntentSignature.warnings];
  let riskScore = 0;
  let hardDeny = false;

  if (policyEnvelope.reasons.length > 0) {
    reasons.push(...policyEnvelope.reasons);
    riskScore += 45;
    hardDeny = true;
  }

  if (!agentIntentSignature.valid) {
    reasons.push(...agentIntentSignature.reasons);
    riskScore += 42;
    hardDeny = true;
  }

  if (policy.requireIntentNonce && !nonce) {
    reasons.push("Missing intent nonce for replay protection");
    riskScore += 34;
    hardDeny = true;
  }

  if (nonce && hasReceiptReplay(receipts, policyId, nonce, hash)) {
    reasons.push("Intent nonce already used for this policy");
    riskScore += 44;
    hardDeny = true;
  }

  if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
    reasons.push("Invalid payment amount");
    hardDeny = true;
  }

  if (!merchant) {
    reasons.push("Unknown merchant");
    riskScore += 40;
    hardDeny = true;
  } else {
    riskScore += Math.max(0, 100 - merchant.trustScore);
  }

  if (merchant && !(policy.allowedMerchants || []).includes(merchant.id)) {
    reasons.push("Merchant outside allowance list");
    riskScore += 28;
    hardDeny = true;
  }

  if (merchant && (policy.blockedCategories || []).includes(merchant.category)) {
    reasons.push(`Blocked merchant category: ${merchant.category}`);
    riskScore += 35;
    hardDeny = true;
  }

  if (amountUsd > Number(policy.perTxCapUsd)) {
    reasons.push(`Above per-transaction cap of ${formatUsd(policy.perTxCapUsd)}`);
    riskScore += 24;
    hardDeny = true;
  }

  const remainingBudget = Math.max(0, Number(policy.dailyCapUsd) - Number(policy.spentTodayUsd));
  if (amountUsd > remainingBudget) {
    reasons.push(`Above remaining daily allowance of ${formatUsd(remainingBudget)}`);
    riskScore += 30;
    hardDeny = true;
  }

  const metadataRisks = detectMetadataRisk(metadata);
  if (policy.blockPii && metadataRisks.length > 0) {
    reasons.push(`Payment metadata contains restricted data: ${metadataRisks.join(", ")}`);
    riskScore += 38;
    hardDeny = true;
  }

  if (metadata.length > Number(policy.metadataMaxChars)) {
    reasons.push(`Metadata exceeds ${policy.metadataMaxChars} characters`);
    riskScore += 12;
  }

  if (merchant?.riskTags?.includes("variable-cost")) {
    warnings.push("Variable-cost endpoint requires receipt reconciliation");
    riskScore += 6;
  }

  if (merchant?.riskTags?.includes("personal-data")) {
    warnings.push("Merchant handles personal-data adjacent inventory");
    riskScore += 10;
  }

  if (policy.requireReceipt && !intent.resource) {
    reasons.push("Missing resource identifier for receipt");
    riskScore += 10;
  }

  riskScore = clamp(Math.round(riskScore), 0, 100);
  const decision = hardDeny ? "deny" : riskScore > policy.maxRiskScore ? "review" : "allow";

  if (decision === "allow" && reasons.length === 0) {
    reasons.push("Within allowance, merchant, metadata, and receipt policy");
  }

  const receipt = {
    id: `allow_${stableHash({
      policyId,
      agentId: policy.agentId,
      merchantId: intent.merchantId,
      amountUsd,
      resource: intent.resource,
      metadataHash: stableHash(metadata),
      intentNonce: nonce,
      intentHash: hash
    })}`,
    createdAt: new Date().toISOString(),
    policyId,
    policyFingerprint: policyEnvelope.fingerprint,
    policySignatureMode: policyEnvelope.signature.mode,
    agentId: policy.agentId,
    merchantId: intent.merchantId,
    merchantName: merchant?.name || "Unknown",
    amountUsd: roundMoney(amountUsd || 0),
    decision,
    riskScore,
    intentNonce: nonce || "missing",
    intentHash: hash,
    agentIntentSignatureMode: agentIntentSignature.mode,
    agentSigner: agentIntentSignature.recoveredSigner || null,
    metadataHash: stableHash(metadata),
    resource: intent.resource || "unbound"
  };

  return {
    decision,
    riskScore,
    reasons,
    warnings,
    receipt,
    remainingBudgetUsd: roundMoney(remainingBudget),
    projectedRemainingUsd: roundMoney(Math.max(0, remainingBudget - (decision === "allow" ? amountUsd : 0))),
    stats: summarizeReceipts(receipts)
  };
}

export function formatUsd(value) {
  return `$${Number(value).toFixed(Number(value) < 1 ? 3 : 2)}`;
}

function roundMoney(value) {
  return Math.round(Number(value) * 1000) / 1000;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeMerchantProfile(merchant = {}) {
  const id = String(merchant?.id || "").trim();
  if (!id) return null;

  const trustScore = Number(merchant.trustScore);
  const defaultPriceUsd = Number(merchant.defaultPriceUsd);

  return {
    id,
    name: merchant.name || id,
    domain: merchant.domain || "",
    category: merchant.category || "other",
    trustScore: Number.isFinite(trustScore) ? clamp(Math.round(trustScore), 0, 100) : 50,
    defaultPriceUsd: Number.isFinite(defaultPriceUsd) ? defaultPriceUsd : 0,
    riskTags: Array.isArray(merchant.riskTags) ? merchant.riskTags.map(String) : []
  };
}
