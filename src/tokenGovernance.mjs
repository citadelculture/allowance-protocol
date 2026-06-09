import { validateDistributionClaims } from "./distributionClaims.mjs";

export const TOKEN_GOVERNANCE_PHASES = ["locked", "legal_review_ready"];

export const DEFAULT_TOKEN_USAGE_THRESHOLDS = {
  minActiveAgents: 100,
  minMerchants: 50,
  minCredibleReceipts: 10000,
  minThirdPartyReceiptSharePct: 20
};

const LEGAL_REVIEW_APPROVAL_FLAGS = [
  "independentCounselEngaged",
  "riskDisclosuresReady",
  "treasuryMultisigReady",
  "independentContractReviewReady",
  "externalActionApprovalPrepared",
  "evidenceBundlePrepared"
];

export function buildTokenGovernanceReport(manifest = {}, metrics = {}) {
  const reasons = [];
  const warnings = [];

  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    return {
      valid: false,
      reasons: ["Token governance manifest must be a JSON object"],
      warnings: [],
      phase: null,
      usage: usageFromMetrics(metrics, {}),
      usageReady: false,
      readyForLegalReview: false,
      tokenLaunchPermitted: false
    };
  }

  const phase = String(manifest.phase || "").trim();
  const token = manifest.token || {};
  const approvals = manifest.approvals || {};
  const thresholds = normalizeThresholds(manifest.usageThresholds);
  const usage = usageFromMetrics(metrics, manifest.usageEvidence || {});
  const usageReasons = usageReadinessReasons(usage, thresholds);
  const usageReady = usageReasons.length === 0;
  const publicSummary = String(manifest.publicSummary || "");

  requireText(reasons, manifest.manifestId, "manifestId");
  requireKnown(reasons, phase, TOKEN_GOVERNANCE_PHASES, "phase");
  requireText(reasons, manifest.generatedAt, "generatedAt");
  requireText(reasons, manifest.owner, "owner");
  if (manifest.generatedAt && !isValidDate(manifest.generatedAt)) reasons.push("generatedAt must be a valid date");

  validateTokenDisabled(reasons, token);

  const claimValidation = validateDistributionClaims(publicSummary, {
    requireExperimentalDisclosure: false
  });
  reasons.push(...claimValidation.reasons);
  warnings.push(...claimValidation.warnings);

  if (phase === "locked") {
    if (usageReady) warnings.push("Usage threshold is met; prepare legal-review packet before any token design work");
  }

  if (phase === "legal_review_ready") {
    reasons.push(...usageReasons);
    requireText(reasons, manifest.usageEvidence?.evidenceBundleRef, "usageEvidence.evidenceBundleRef");
    requireText(reasons, manifest.legal?.counselRef, "legal.counselRef");
    requireText(reasons, manifest.legal?.riskDisclosureRef, "legal.riskDisclosureRef");
    requireText(reasons, manifest.governance?.treasuryMultisig, "governance.treasuryMultisig");
    requireText(reasons, manifest.governance?.allocationPolicyRef, "governance.allocationPolicyRef");
    for (const flag of LEGAL_REVIEW_APPROVAL_FLAGS) {
      if (approvals[flag] !== true) reasons.push(`approvals.${flag} must be true`);
    }
  } else if (!usageReady) {
    warnings.push(...usageReasons);
  }

  return {
    valid: reasons.length === 0,
    manifestId: manifest.manifestId || null,
    phase: phase || null,
    generatedAt: manifest.generatedAt || null,
    owner: manifest.owner || null,
    token: {
      launchEnabled: token.launchEnabled,
      transferable: token.transferable,
      salePlanned: token.salePlanned,
      airdropPlanned: token.airdropPlanned,
      liquidityPlanned: token.liquidityPlanned,
      marketMakingPlanned: token.marketMakingPlanned
    },
    usage,
    thresholds,
    usageReady,
    readyForLegalReview: phase === "legal_review_ready" && reasons.length === 0,
    tokenLaunchPermitted: false,
    reasons: unique(reasons),
    warnings: unique(warnings),
    evidenceBoundary: {
      deploysToken: false,
      enablesTransfers: false,
      createsLiquidity: false,
      startsSale: false,
      movesFunds: false,
      permitsTokenLaunch: false
    }
  };
}

function usageFromMetrics(metrics = {}, usageEvidence = {}) {
  const pilot = metrics.pilotEvidence || {};
  const merchants = Array.isArray(pilot.credibleMerchantsWithReceipts)
    ? pilot.credibleMerchantsWithReceipts.length
    : Number(usageEvidence.merchantsWithReceipts || 0);
  const activeAgents = Number(pilot.activeAgentsWithCredibleEvidence || usageEvidence.activeAgents || 0);
  const credibleReceipts = Number(pilot.crediblePolicyDecisions || usageEvidence.credibleReceipts || 0);
  const thirdPartyReceiptSharePct = Number(
    pilot.thirdPartyReceiptSharePct ?? usageEvidence.thirdPartyReceiptSharePct ?? 0
  );

  return {
    activeAgents,
    merchantsWithReceipts: merchants,
    credibleReceipts,
    thirdPartyReceiptSharePct,
    evidenceBundleRef: usageEvidence.evidenceBundleRef || null
  };
}

function normalizeThresholds(input = {}) {
  return {
    minActiveAgents: positiveNumber(input.minActiveAgents, DEFAULT_TOKEN_USAGE_THRESHOLDS.minActiveAgents),
    minMerchants: positiveNumber(input.minMerchants, DEFAULT_TOKEN_USAGE_THRESHOLDS.minMerchants),
    minCredibleReceipts: positiveNumber(input.minCredibleReceipts, DEFAULT_TOKEN_USAGE_THRESHOLDS.minCredibleReceipts),
    minThirdPartyReceiptSharePct: positiveNumber(
      input.minThirdPartyReceiptSharePct,
      DEFAULT_TOKEN_USAGE_THRESHOLDS.minThirdPartyReceiptSharePct
    )
  };
}

function usageReadinessReasons(usage, thresholds) {
  const reasons = [];
  if (usage.activeAgents < thresholds.minActiveAgents) {
    reasons.push(`Token legal review requires at least ${thresholds.minActiveAgents} active agents with credible evidence`);
  }
  if (usage.merchantsWithReceipts < thresholds.minMerchants) {
    reasons.push(`Token legal review requires at least ${thresholds.minMerchants} merchants with credible receipts`);
  }
  if (usage.credibleReceipts < thresholds.minCredibleReceipts) {
    reasons.push(`Token legal review requires at least ${thresholds.minCredibleReceipts} credible receipts`);
  }
  if (usage.thirdPartyReceiptSharePct < thresholds.minThirdPartyReceiptSharePct) {
    reasons.push(`Token legal review requires at least ${thresholds.minThirdPartyReceiptSharePct}% third-party receipt share`);
  }
  return reasons;
}

function validateTokenDisabled(reasons, token = {}) {
  const disabledFields = [
    "launchEnabled",
    "transferable",
    "salePlanned",
    "airdropPlanned",
    "liquidityPlanned",
    "marketMakingPlanned",
    "influencerPromotionPlanned",
    "returnClaimsPlanned"
  ];
  for (const field of disabledFields) {
    if (token[field] !== false) reasons.push(`token.${field} must be false`);
  }
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

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function unique(values) {
  return [...new Set(values)];
}
