export const SECRET_EXPOSURE_RESPONSE_STATUSES = [
  "contained",
  "needs_owner_rotation",
  "unsafe_secret_material",
  "needs_incident_record"
];

export const SECRET_EXPOSURE_TYPES = [
  "wallet_private_key",
  "seed_phrase",
  "x_bearer_token",
  "api_token",
  "other_secret"
];

const SECRET_FIELD_NAMES = new Set([
  "privatekey",
  "seedphrase",
  "mnemonic",
  "apikey",
  "apisecret",
  "accesstoken",
  "bearertoken",
  "refreshtoken",
  "clientsecret",
  "consumersecret",
  "tokenvalue",
  "secretvalue",
  "rawsecret"
]);

export function buildSecretExposureResponseReport(incident = {}, options = {}) {
  const generatedAt = options.generatedAt || new Date().toISOString();
  const reasons = [...(options.sourceErrors || [])];
  const warnings = [];

  if (!incident || typeof incident !== "object" || Array.isArray(incident)) {
    return {
      generatedAt,
      valid: false,
      status: "needs_incident_record",
      incidentId: null,
      exposures: [],
      reasons: ["Secret exposure incident must be a JSON object", ...reasons],
      warnings,
      nextAction: "Create a redacted incident record and rotate every exposed credential.",
      evidenceBoundary: boundary()
    };
  }

  const secretFindings = findSecretMaterial(incident);
  if (secretFindings.length > 0) {
    reasons.push(...secretFindings.map((path) => `Raw secret material must be removed from ${path}`));
  }

  requireText(reasons, incident.incidentId, "incidentId");
  requireText(reasons, incident.reportedAt, "reportedAt");
  requireText(reasons, incident.reportedBy, "reportedBy");
  requireText(reasons, incident.source, "source");
  requireText(reasons, incident.responseOwner, "responseOwner");
  requireTrue(reasons, incident.noRawSecretValuesStored, "noRawSecretValuesStored");
  requireTrue(reasons, incident.ownerNotified, "ownerNotified");
  if (incident.reportedAt && !isValidDate(incident.reportedAt)) reasons.push("reportedAt must be a valid date");

  const exposureInputs = Array.isArray(incident.exposures) ? incident.exposures : [];
  if (exposureInputs.length === 0) reasons.push("At least one exposure record is required");
  const exposures = exposureInputs.map((exposure, index) => validateExposure(exposure, index, reasons, warnings));

  const externalActions = incident.externalActions || {};
  requireFalse(reasons, externalActions.moveFunds, "externalActions.moveFunds");
  requireFalse(reasons, externalActions.revokeToken, "externalActions.revokeToken");
  requireFalse(reasons, externalActions.postToX, "externalActions.postToX");
  requireFalse(reasons, externalActions.deployContracts, "externalActions.deployContracts");

  const unresolved = exposures.filter((exposure) => !exposure.contained);
  const valid = reasons.length === 0 && unresolved.length === 0;

  return {
    generatedAt,
    valid,
    status: statusFor({ valid, secretFindings }),
    incidentId: incident.incidentId || null,
    reportedAt: incident.reportedAt || null,
    source: incident.source || null,
    exposureCount: exposures.length,
    containedCount: exposures.filter((exposure) => exposure.contained).length,
    unresolvedCount: unresolved.length,
    exposures,
    reasons: unique(reasons),
    warnings: unique(warnings),
    nextAction: valid
      ? "Continue only with replacement credentials stored outside the repository and run the live-resource handoff again."
      : "Rotate exposed wallet/API credentials outside this repo, record redacted proof, and do not use the exposed values.",
    evidenceBoundary: boundary()
  };
}

export function publicSecretExposureResponseReport(report = {}) {
  return {
    ...report,
    secretFindings: undefined
  };
}

function validateExposure(exposure = {}, index, reasons, warnings) {
  const prefix = `exposures[${index}]`;
  const type = String(exposure.type || "").trim();
  const label = String(exposure.label || "").trim();
  const contained = exposure.contained || {};
  const proof = exposure.proof || {};

  requireKnown(reasons, type, SECRET_EXPOSURE_TYPES, `${prefix}.type`);
  requireText(reasons, label, `${prefix}.label`);
  requireTrue(reasons, exposure.compromised, `${prefix}.compromised`);
  requireFalse(reasons, exposure.secretMaterialStored, `${prefix}.secretMaterialStored`);
  requireTrue(reasons, contained.rotationRequired, `${prefix}.contained.rotationRequired`);

  let isContained = false;
  if (type === "wallet_private_key" || type === "seed_phrase") {
    requireTrue(reasons, contained.fundsMovedToFreshWallet, `${prefix}.contained.fundsMovedToFreshWallet`);
    requireTrue(reasons, contained.oldWalletNoLongerUsed, `${prefix}.contained.oldWalletNoLongerUsed`);
    requireTrue(reasons, contained.replacementStoredOutsideRepo, `${prefix}.contained.replacementStoredOutsideRepo`);
    isContained =
      contained.fundsMovedToFreshWallet === true &&
      contained.oldWalletNoLongerUsed === true &&
      contained.replacementStoredOutsideRepo === true;
  } else if (type === "x_bearer_token" || type === "api_token") {
    requireTrue(reasons, contained.tokenRevoked, `${prefix}.contained.tokenRevoked`);
    requireTrue(reasons, contained.replacementStoredOutsideRepo, `${prefix}.contained.replacementStoredOutsideRepo`);
    isContained =
      contained.tokenRevoked === true &&
      contained.replacementStoredOutsideRepo === true;
  } else {
    requireTrue(reasons, contained.revokedOrRotated, `${prefix}.contained.revokedOrRotated`);
    requireTrue(reasons, contained.replacementStoredOutsideRepo, `${prefix}.contained.replacementStoredOutsideRepo`);
    isContained =
      contained.revokedOrRotated === true &&
      contained.replacementStoredOutsideRepo === true;
  }

  if (isContained) {
    requireText(reasons, proof.ref, `${prefix}.proof.ref`);
    requireText(reasons, proof.capturedAt, `${prefix}.proof.capturedAt`);
    requireTrue(reasons, proof.redacted, `${prefix}.proof.redacted`);
    if (proof.capturedAt && !isValidDate(proof.capturedAt)) reasons.push(`${prefix}.proof.capturedAt must be a valid date`);
  } else {
    warnings.push(`${prefix} remains unresolved`);
  }

  return {
    type,
    label: label || null,
    contained: isContained,
    proofRef: proof.ref || null
  };
}

function statusFor({ valid, secretFindings }) {
  if (secretFindings.length > 0) return "unsafe_secret_material";
  if (valid) return "contained";
  return "needs_owner_rotation";
}

function findSecretMaterial(value, path = []) {
  if (!value || typeof value !== "object") return [];
  const findings = [];
  for (const [key, child] of Object.entries(value)) {
    const childPath = [...path, key];
    const normalizedKey = normalizeKey(key);
    if (SECRET_FIELD_NAMES.has(normalizedKey) && hasMeaningfulValue(child)) {
      findings.push(childPath.join("."));
      continue;
    }
    if (child && typeof child === "object") {
      findings.push(...findSecretMaterial(child, childPath));
    } else if (typeof child === "string" && looksLikeSecretLiteral(child)) {
      findings.push(childPath.join("."));
    }
  }
  return unique(findings);
}

function hasMeaningfulValue(value) {
  if (value === null || value === undefined || value === false) return false;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return Boolean(normalized) && !["redacted", "<redacted>", "outside_repo", "not_stored"].includes(normalized);
  }
  return true;
}

function looksLikeSecretLiteral(value) {
  const text = value.trim();
  if (!text || /redacted|outside_repo|not_stored/i.test(text)) return false;
  return /^(sk-|xox[baprs]-|ghp_|github_pat_|AKIA|AIza|[a-fA-F0-9]{64}$)/.test(text);
}

function requireText(reasons, value, field) {
  if (!String(value || "").trim()) reasons.push(`Missing ${field}`);
}

function requireTrue(reasons, value, field) {
  if (value !== true) reasons.push(`${field} must be true`);
}

function requireFalse(reasons, value, field) {
  if (value === true) reasons.push(`${field} must be false`);
}

function requireKnown(reasons, value, allowed, field) {
  if (!allowed.includes(String(value || ""))) reasons.push(`Invalid ${field}`);
}

function isValidDate(value) {
  return Number.isFinite(new Date(value).getTime());
}

function normalizeKey(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function boundary() {
  return {
    readsIncidentMetadata: true,
    readsPrivateKeys: false,
    readsSeedPhrases: false,
    readsApiSecrets: false,
    writesFiles: false,
    revokesTokens: false,
    movesFunds: false,
    postsContent: false,
    sendsOutreach: false,
    signsWalletPayloads: false,
    deploysContracts: false,
    startsPilotTraffic: false,
    storesSecrets: false,
    updatesCanonicalState: false,
    enablesToken: false,
    requiresHumanAction: true
  };
}
