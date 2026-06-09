export const BLOCKED_CLAIM_PATTERNS = [
  { id: "guaranteed_returns", pattern: /\b(guaranteed|risk[-\s]?free|no[-\s]?risk|safe as)\b/i, reason: "Do not imply guaranteed or risk-free outcomes" },
  { id: "profit_promise", pattern: /\b(profit|profits|returns?|yield|apy|passive income|make (you|people|users) rich)\b/i, reason: "Do not promise profits, yield, or investment returns" },
  { id: "price_hype", pattern: /\b(100x|1000x|moon|mooning|pump|lambo|floor price|price target)\b/i, reason: "Do not use price-hype or pump language" },
  { id: "token_sale", pattern: /\b(airdrop|presale|token launch|token sale|ico|ido|whitelist|claim your tokens?|buy\s+(?:the\s+)?[a-z0-9_-]*\s*tokens?)\b/i, reason: "Do not promote a token, airdrop, presale, or whitelist" },
  { id: "market_cap", pattern: /\b(market cap|mcap|billion[-\s]?dollar|unicorn valuation)\b/i, reason: "Do not make market-cap or valuation claims" },
  { id: "investment_call", pattern: /\b(buy now|invest now|not financial advice|financial advice|investment opportunity|alpha call)\b/i, reason: "Do not frame product updates as investment calls" }
];
export const PARTNERSHIP_PATTERN = /\b(partnered with|partnership with|official partner|integrated with|backed by|endorsed by)\b/i;
export const USAGE_CLAIM_PATTERN = /\b\d[\d,.]*\s*(active\s+)?(agents?|merchants?|users?|receipts?|transactions?|policy decisions?|pilots?|partners?|integrations?)\b/i;

export function validateDistributionClaims(text = "", options = {}) {
  const value = String(text || "");
  const reasons = [];
  const warnings = [];
  const flags = [];

  for (const rule of BLOCKED_CLAIM_PATTERNS) {
    if (rule.pattern.test(value)) {
      reasons.push(rule.reason);
      flags.push(rule.id);
    }
  }

  if (PARTNERSHIP_PATTERN.test(value) && !options.partnershipApproved) {
    reasons.push("Partnership, backing, endorsement, or integration claims require explicit approval");
    flags.push("unapproved_partnership_claim");
  }

  const hasUsageClaim = USAGE_CLAIM_PATTERN.test(value);
  if (hasUsageClaim && !hasEvidenceReference(options)) {
    reasons.push("Quantified usage claims require an evidence reference");
    flags.push("unsubstantiated_usage_claim");
  } else if (hasUsageClaim && options.validEvidenceRefs && !options.allowUsageClaims && !hasValidEvidenceReference(options)) {
    reasons.push("Quantified usage claims require a valid evidence reference");
    flags.push("invalid_usage_evidence_ref");
  }

  if (/\bexperimental\b/i.test(value) === false && options.requireExperimentalDisclosure) {
    warnings.push("Consider disclosing that the product is experimental");
  }

  return {
    valid: reasons.length === 0,
    reasons: unique(reasons),
    warnings,
    flags: unique(flags)
  };
}

function hasEvidenceReference(options) {
  return Boolean(options.evidenceRef || options.evidencePath || options.allowUsageClaims);
}

function hasValidEvidenceReference(options) {
  const refs = new Set(options.validEvidenceRefs || []);
  return refs.has(options.evidenceRef) || refs.has(options.evidencePath);
}

function unique(values) {
  return [...new Set(values)];
}
