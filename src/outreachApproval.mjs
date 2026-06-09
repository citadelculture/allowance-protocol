import { validateDistributionClaims } from "./distributionClaims.mjs";
import { buildOutreachDrafts } from "./outreachDrafts.mjs";

const SECRET_PATTERNS = [
  { id: "private_key", pattern: /\b0x[0-9a-fA-F]{64}\b/, reason: "Outreach text must not include private keys or seed-like hex values" },
  { id: "bearer_token", pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b/i, reason: "Outreach text must not include bearer tokens" },
  { id: "api_key", pattern: /\b(api[_-]?key|secret|password)\s*[:=]\s*\S+/i, reason: "Outreach text must not include API keys, secrets, or passwords" }
];

export function validateOutreachDraft(draft = {}, options = {}) {
  const reasons = [];
  const warnings = [];
  const text = `${draft.subject || ""}\n${draft.message || ""}`;

  requireText(reasons, draft.prospectId, "prospectId");
  requireText(reasons, draft.candidateId, "candidateId");
  requireText(reasons, draft.channel, "channel");
  requireText(reasons, draft.destination, "destination");
  requireText(reasons, draft.subject, "subject");
  requireText(reasons, draft.message, "message");

  if (draft.status !== "draft_only") reasons.push("Outreach must remain draft_only until explicitly approved and sent by a human");
  if (draft.destination && !isSafeDestination(draft.destination)) reasons.push("destination must be an http(s) URL or public handle path");
  if (String(draft.message || "").length > Number(options.maxMessageLength || 1600)) reasons.push("message is too long for first outreach");
  if (!/\bno[-\s]?custody\b/i.test(text)) warnings.push("Consider mentioning no-custody posture");
  if (!/No token pitch/i.test(text)) reasons.push("Outreach must explicitly say there is no token pitch");

  const claimValidation = validateDistributionClaims(text, {
    partnershipApproved: options.partnershipApproved === true,
    evidenceRef: options.evidenceRef,
    requireExperimentalDisclosure: options.requireExperimentalDisclosure === true
  });
  reasons.push(...claimValidation.reasons);
  warnings.push(...claimValidation.warnings);

  for (const pattern of SECRET_PATTERNS) {
    if (pattern.pattern.test(text)) reasons.push(pattern.reason);
  }

  return {
    valid: reasons.length === 0,
    prospectId: draft.prospectId || null,
    candidateId: draft.candidateId || null,
    destination: draft.destination || null,
    reasons: unique(reasons),
    warnings: unique(warnings)
  };
}

export function validateOutreachDrafts(drafts = [], options = {}) {
  const entries = drafts.map((draft) => validateOutreachDraft(draft, options));
  return {
    valid: entries.every((entry) => entry.valid),
    count: entries.length,
    validCount: entries.filter((entry) => entry.valid).length,
    reasons: unique(entries.flatMap((entry) => entry.reasons)),
    warnings: unique(entries.flatMap((entry) => entry.warnings)),
    entries
  };
}

export function buildOutreachApprovalReport(candidates = [], prospects = [], options = {}) {
  const drafts = options.drafts || buildOutreachDrafts(candidates, prospects);
  const validation = validateOutreachDrafts(drafts, options);
  return {
    generatedAt: new Date().toISOString(),
    valid: validation.valid,
    count: validation.count,
    validCount: validation.validCount,
    reasons: validation.reasons,
    warnings: validation.warnings,
    entries: validation.entries,
    drafts
  };
}

function requireText(reasons, value, field) {
  if (!String(value || "").trim()) reasons.push(`Missing ${field}`);
}

function isSafeDestination(value) {
  const text = String(value || "").trim();
  if (/^https?:\/\/[^\s]+$/i.test(text)) return true;
  if (/^@[A-Za-z0-9_]{1,30}$/.test(text)) return true;
  return false;
}

function unique(values) {
  return [...new Set(values)];
}
