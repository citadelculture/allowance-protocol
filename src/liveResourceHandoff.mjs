export const LIVE_RESOURCE_HANDOFF_STATUSES = [
  "ready_for_action_time_approval",
  "needs_resource_handoff",
  "needs_resource_fixes",
  "unsafe_secret_exposure"
];

const BASE_NETWORKS = ["base_mainnet", "base_sepolia"];
const WEBSITE_STATUSES = ["not_needed", "offered", "ready"];
const SECRET_FIELD_NAMES = new Set([
  "privatekey",
  "seedphrase",
  "mnemonic",
  "apikey",
  "apisecret",
  "apisecretkey",
  "accesssecret",
  "accesstoken",
  "bearertoken",
  "refreshtoken",
  "clientsecret",
  "consumersecret",
  "xapikey",
  "xapisecret",
  "oauthclientsecret"
]);

export function buildLiveResourceHandoffReport(manifest = {}, options = {}) {
  const generatedAt = options.generatedAt || new Date().toISOString();
  const reasons = [...(options.sourceErrors || [])];
  const warnings = [];

  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    return {
      generatedAt,
      valid: false,
      status: "needs_resource_handoff",
      manifestId: null,
      resources: emptyResources(),
      reasons: ["Live resource handoff manifest must be a JSON object", ...reasons],
      warnings,
      nextAction: "Create a redacted live resource handoff manifest before any live wallet, X, or website action.",
      evidenceBoundary: boundary()
    };
  }

  const secretFindings = findSecretMaterial(manifest);
  if (secretFindings.length > 0) {
    reasons.push(...secretFindings.map((path) => `Secret-like value must be removed from ${path}`));
  }

  requireText(reasons, manifest.manifestId, "manifestId");
  requireText(reasons, manifest.generatedAt, "generatedAt");
  requireText(reasons, manifest.owner, "owner");
  if (manifest.generatedAt && !isValidDate(manifest.generatedAt)) reasons.push("generatedAt must be a valid date");

  const wallet = validateWallet(manifest.wallet || {}, reasons, warnings);
  const xAccount = validateXAccount(manifest.xAccount || {}, reasons);
  const website = validateWebsite(manifest.website || {}, reasons, warnings);

  const resources = {
    wallet,
    xAccount,
    website
  };
  const valid = reasons.length === 0;

  return {
    generatedAt,
    valid,
    status: statusFor({ valid, secretFindings, resources }),
    manifestId: manifest.manifestId || null,
    owner: manifest.owner || null,
    resources,
    readyFor: {
      firstPublicPostApproval: xAccount.ready,
      controllerSigningApproval: wallet.ready,
      livePilotApproval: wallet.ready && website.readyOrOptional,
      websitePublicationApproval: website.ready
    },
    reasons: unique(reasons),
    warnings: unique(warnings),
    nextAction: valid
      ? "Proceed to action-time approval packets; do not execute live actions until their exact packet is approved."
      : "Fill only public/redacted resource fields and keep private keys, seed phrases, and API secrets outside the repository.",
    evidenceBoundary: boundary()
  };
}

export function publicLiveResourceHandoffReport(report = {}) {
  return {
    ...report,
    secretFindings: undefined
  };
}

function validateWallet(wallet, reasons, warnings) {
  const address = String(wallet.address || "").trim();
  const chain = String(wallet.chain || "").trim();
  const network = String(wallet.network || "").trim();
  const declaredFundingUsd = numberOrNull(wallet.declaredFundingUsd);
  const maxSingleActionUsd = numberOrNull(wallet.maxSingleActionUsd);

  requireText(reasons, address, "wallet.address");
  if (address && !/^0x[a-fA-F0-9]{40}$/.test(address)) reasons.push("wallet.address must be a 20-byte EVM address");
  if (chain !== "Base") reasons.push("wallet.chain must be Base");
  if (!BASE_NETWORKS.includes(network)) reasons.push(`wallet.network must be one of ${BASE_NETWORKS.join(", ")}`);
  if (declaredFundingUsd === null || declaredFundingUsd <= 0) reasons.push("wallet.declaredFundingUsd must be positive");
  if (declaredFundingUsd !== null && declaredFundingUsd > 100) warnings.push("wallet.declaredFundingUsd is above the current $100 launch budget");
  if (maxSingleActionUsd === null || maxSingleActionUsd <= 0) reasons.push("wallet.maxSingleActionUsd must be positive");
  if (maxSingleActionUsd !== null && maxSingleActionUsd > 25) warnings.push("wallet.maxSingleActionUsd is high for first live pilots");
  requireTrue(reasons, wallet.userControlled, "wallet.userControlled");
  requireTrue(reasons, wallet.noPrivateKeyShared, "wallet.noPrivateKeyShared");
  requireFalse(reasons, wallet.seedPhraseShared, "wallet.seedPhraseShared");
  requireFalse(reasons, wallet.privateKeyStoredInRepo, "wallet.privateKeyStoredInRepo");
  requireTrue(reasons, wallet.actionTimeApprovalRequired, "wallet.actionTimeApprovalRequired");

  const ready =
    /^0x[a-fA-F0-9]{40}$/.test(address) &&
    chain === "Base" &&
    BASE_NETWORKS.includes(network) &&
    declaredFundingUsd !== null &&
    declaredFundingUsd > 0 &&
    maxSingleActionUsd !== null &&
    maxSingleActionUsd > 0 &&
    wallet.userControlled === true &&
    wallet.noPrivateKeyShared === true &&
    wallet.seedPhraseShared === false &&
    wallet.privateKeyStoredInRepo === false &&
    wallet.actionTimeApprovalRequired === true;

  return {
    ready,
    address: address || null,
    chain: chain || null,
    network: network || null,
    declaredFundingUsd,
    maxSingleActionUsd,
    userControlled: wallet.userControlled === true,
    actionTimeApprovalRequired: wallet.actionTimeApprovalRequired === true
  };
}

function validateXAccount(xAccount, reasons) {
  const handle = normalizeHandle(xAccount.handle);
  requireText(reasons, handle, "xAccount.handle");
  if (handle && !/^@[A-Za-z0-9_]{1,15}$/.test(handle)) reasons.push("xAccount.handle must be a valid X handle");
  requireTrue(reasons, xAccount.apiAccessReady, "xAccount.apiAccessReady");
  requireTrue(reasons, xAccount.credentialsStoredOutsideRepo, "xAccount.credentialsStoredOutsideRepo");
  requireTrue(reasons, xAccount.noApiSecretsStored, "xAccount.noApiSecretsStored");
  requireTrue(reasons, xAccount.postingRequiresApproval, "xAccount.postingRequiresApproval");
  requireTrue(reasons, xAccount.automationDisabledUntilApproval, "xAccount.automationDisabledUntilApproval");

  const ready =
    /^@[A-Za-z0-9_]{1,15}$/.test(handle) &&
    xAccount.apiAccessReady === true &&
    xAccount.credentialsStoredOutsideRepo === true &&
    xAccount.noApiSecretsStored === true &&
    xAccount.postingRequiresApproval === true &&
    xAccount.automationDisabledUntilApproval === true;

  return {
    ready,
    handle: handle || null,
    apiAccessReady: xAccount.apiAccessReady === true,
    postingRequiresApproval: xAccount.postingRequiresApproval === true,
    automationDisabledUntilApproval: xAccount.automationDisabledUntilApproval === true
  };
}

function validateWebsite(website, reasons, warnings) {
  const status = String(website.status || "offered").trim();
  const url = String(website.url || "").trim();

  if (!WEBSITE_STATUSES.includes(status)) reasons.push(`website.status must be one of ${WEBSITE_STATUSES.join(", ")}`);
  if (status === "ready") {
    requireText(reasons, url, "website.url");
    if (url && !/^https:\/\/[^\s/$.?#].[^\s]*$/i.test(url)) reasons.push("website.url must be an https URL");
    requireTrue(reasons, website.userCanPublish, "website.userCanPublish");
    requireTrue(reasons, website.publishRequiresApproval, "website.publishRequiresApproval");
    requireTrue(reasons, website.noSecretEnvInRepo, "website.noSecretEnvInRepo");
  }
  if (status === "offered" && !url) warnings.push("website is offered but no URL is configured yet");

  const ready =
    status === "ready" &&
    /^https:\/\/[^\s/$.?#].[^\s]*$/i.test(url) &&
    website.userCanPublish === true &&
    website.publishRequiresApproval === true &&
    website.noSecretEnvInRepo === true;

  return {
    ready,
    readyOrOptional: status === "not_needed" || status === "offered" || ready,
    status,
    url: url || null,
    userCanPublish: website.userCanPublish === true,
    publishRequiresApproval: website.publishRequiresApproval === true
  };
}

function statusFor({ valid, secretFindings, resources }) {
  if (secretFindings.length > 0) return "unsafe_secret_exposure";
  if (valid) return "ready_for_action_time_approval";
  if (!resources.wallet.ready || !resources.xAccount.ready) return "needs_resource_handoff";
  return "needs_resource_fixes";
}

function emptyResources() {
  return {
    wallet: { ready: false },
    xAccount: { ready: false },
    website: { ready: false, readyOrOptional: false }
  };
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
    const trimmed = value.trim().toLowerCase();
    return Boolean(trimmed) && !["redacted", "<redacted>", "outside_repo", "not_stored"].includes(trimmed);
  }
  return true;
}

function looksLikeSecretLiteral(value) {
  const text = value.trim();
  if (!text || /redacted|outside_repo|not_stored/i.test(text)) return false;
  return /^(sk-|xox[baprs]-|ghp_|github_pat_|AKIA|AIza)/.test(text);
}

function requireText(reasons, value, field) {
  if (!String(value || "").trim()) reasons.push(`Missing ${field}`);
}

function requireTrue(reasons, value, field) {
  if (value !== true) reasons.push(`${field} must be true`);
}

function requireFalse(reasons, value, field) {
  if (value !== false) reasons.push(`${field} must be false`);
}

function isValidDate(value) {
  return Number.isFinite(new Date(value).getTime());
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeHandle(value) {
  const handle = String(value || "").trim();
  if (!handle) return "";
  return handle.startsWith("@") ? handle : `@${handle}`;
}

function normalizeKey(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function boundary() {
  return {
    readsPublicWalletAddress: true,
    readsXHandle: true,
    readsWebsiteUrl: true,
    readsPrivateKeys: false,
    readsSeedPhrases: false,
    readsApiSecrets: false,
    writesFiles: false,
    postsContent: false,
    sendsOutreach: false,
    signsWalletPayloads: false,
    deploysContracts: false,
    startsPilotTraffic: false,
    publishesWebsite: false,
    movesFunds: false,
    storesSecrets: false,
    updatesCanonicalState: false,
    enablesToken: false,
    requiresHumanApproval: true,
    actionTimeApprovalRequired: true
  };
}
