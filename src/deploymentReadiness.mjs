export const DEPLOYMENT_ENVIRONMENTS = ["testnet", "mainnet"];
export const DEPLOYMENT_NETWORKS = ["Base Sepolia", "Base"];
export const REVIEW_STATUSES = ["missing", "pending", "passed", "approved", "failed"];

export function validateDeploymentManifest(manifest = {}, options = {}) {
  const reasons = [];
  const warnings = [];

  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    return {
      valid: false,
      reasons: ["Deployment manifest must be a JSON object"],
      warnings: []
    };
  }

  const contract = manifest.contract || {};
  const target = manifest.target || {};
  const checks = manifest.checks || {};
  const custody = manifest.custody || {};
  const token = manifest.token || {};
  const approvals = manifest.approvals || {};

  requireText(reasons, manifest.manifestId, "manifestId");
  requireText(reasons, manifest.generatedAt, "generatedAt");
  if (manifest.generatedAt && !isValidDate(manifest.generatedAt)) reasons.push("generatedAt must be a valid date");
  requireText(reasons, contract.name, "contract.name");
  requireText(reasons, contract.path, "contract.path");
  requireHexHash(reasons, contract.sourceSha256, "contract.sourceSha256");
  requireKnown(reasons, target.environment, DEPLOYMENT_ENVIRONMENTS, "target.environment");
  requireKnown(reasons, target.network, DEPLOYMENT_NETWORKS, "target.network");
  requirePositiveInteger(reasons, target.chainId, "target.chainId");
  requireAddress(reasons, target.deployer, "target.deployer");
  requireAddress(reasons, target.controller, "target.controller");
  requireAddress(reasons, target.treasuryMultisig, "target.treasuryMultisig");

  if (target.network === "Base Sepolia" && Number(target.chainId) !== 84532) reasons.push("Base Sepolia chainId must be 84532");
  if (target.network === "Base" && Number(target.chainId) !== 8453) reasons.push("Base chainId must be 8453");
  if (target.environment === "testnet" && target.network !== "Base Sepolia") reasons.push("testnet deployments must target Base Sepolia");
  if (target.environment === "mainnet" && target.network !== "Base") reasons.push("mainnet deployments must target Base");
  if (sameAddress(target.deployer, target.treasuryMultisig)) warnings.push("Deployer and treasury multisig should not be the same address");

  requirePassed(reasons, checks.npmTest, "checks.npmTest");
  requirePassed(reasons, checks.contractReview, "checks.contractReview");
  requirePassed(reasons, checks.compiler, "checks.compiler");
  requirePassed(reasons, checks.staticAnalysis, "checks.staticAnalysis");
  requireApprovedReview(reasons, checks.independentReview, "checks.independentReview");
  requireText(reasons, checks.npmTest?.reportRef, "checks.npmTest.reportRef");
  requireText(reasons, checks.contractReview?.reportRef, "checks.contractReview.reportRef");
  requireText(reasons, checks.compiler?.tool, "checks.compiler.tool");
  requireText(reasons, checks.compiler?.version, "checks.compiler.version");
  requireText(reasons, checks.compiler?.artifactRef, "checks.compiler.artifactRef");
  requireText(reasons, checks.staticAnalysis?.tool, "checks.staticAnalysis.tool");
  requireText(reasons, checks.staticAnalysis?.reportRef, "checks.staticAnalysis.reportRef");
  requireText(reasons, checks.independentReview?.reviewer, "checks.independentReview.reviewer");
  requireText(reasons, checks.independentReview?.reportRef, "checks.independentReview.reportRef");
  requireText(reasons, checks.independentReview?.evidenceRef, "checks.independentReview.evidenceRef");
  requireHexHash(reasons, checks.independentReview?.sourceSha256, "checks.independentReview.sourceSha256");
  requireText(reasons, checks.independentReview?.reviewedAt, "checks.independentReview.reviewedAt");

  if (checks.independentReview?.reviewedAt && !isValidDate(checks.independentReview.reviewedAt)) {
    reasons.push("checks.independentReview.reviewedAt must be a valid date");
  }
  if (
    checks.independentReview?.sourceSha256 &&
    contract.sourceSha256 &&
    checks.independentReview.sourceSha256 !== contract.sourceSha256
  ) {
    reasons.push("checks.independentReview.sourceSha256 must match contract.sourceSha256");
  }

  requireTrue(reasons, custody.noPayableEntrypoints, "custody.noPayableEntrypoints");
  requireTrue(reasons, custody.noTransferPrimitives, "custody.noTransferPrimitives");
  requireTrue(reasons, custody.receiptMetadataHashedOnly, "custody.receiptMetadataHashedOnly");
  requireTrue(reasons, custody.noEscrowOrCustody, "custody.noEscrowOrCustody");

  if (token.launchEnabled !== false) reasons.push("token.launchEnabled must be false before usage and legal gates clear");
  if (token.transferable !== false) reasons.push("token.transferable must be false before usage and legal gates clear");
  requireText(reasons, token.gateRef, "token.gateRef");

  requireText(reasons, approvals.approvedBy, "approvals.approvedBy");
  requireText(reasons, approvals.approvedAt, "approvals.approvedAt");
  if (approvals.approvedAt && !isValidDate(approvals.approvedAt)) reasons.push("approvals.approvedAt must be a valid date");
  if (options.requireMainnet === true && target.environment !== "mainnet") reasons.push("Mainnet deployment requires target.environment=mainnet");

  return {
    valid: reasons.length === 0,
    reasons,
    warnings
  };
}

export function summarizeDeploymentManifest(manifest = {}, options = {}) {
  const validation = validateDeploymentManifest(manifest, options);
  return {
    valid: validation.valid,
    manifestId: manifest?.manifestId || null,
    contract: manifest?.contract?.name || null,
    network: manifest?.target?.network || null,
    chainId: manifest?.target?.chainId || null,
    environment: manifest?.target?.environment || null,
    reasons: validation.reasons,
    warnings: validation.warnings
  };
}

function requireText(reasons, value, field) {
  if (!String(value || "").trim()) reasons.push(`Missing ${field}`);
}

function requireKnown(reasons, value, allowed, field) {
  if (!allowed.includes(String(value || ""))) reasons.push(`Invalid ${field}`);
}

function requireAddress(reasons, value, field) {
  const address = String(value || "");
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    reasons.push(`${field} must be a 20-byte EVM address`);
    return;
  }
  if (/^0x0{40}$/i.test(address)) reasons.push(`${field} must not be the zero address`);
}

function requireHexHash(reasons, value, field) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(String(value || ""))) reasons.push(`${field} must be a 32-byte hex hash`);
}

function requirePositiveInteger(reasons, value, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) reasons.push(`${field} must be a positive integer`);
}

function requireTrue(reasons, value, field) {
  if (value !== true) reasons.push(`${field} must be true`);
}

function requirePassed(reasons, value = {}, field) {
  if (!value || !["passed", "approved"].includes(String(value.status || ""))) {
    reasons.push(`${field}.status must be passed or approved`);
  }
}

function requireApprovedReview(reasons, value = {}, field) {
  if (!value || String(value.status || "") !== "approved") reasons.push(`${field}.status must be approved`);
}

function sameAddress(a, b) {
  const left = String(a || "");
  const right = String(b || "");
  if (!/^0x[0-9a-fA-F]{40}$/.test(left) || !/^0x[0-9a-fA-F]{40}$/.test(right)) return false;
  if (/^0x0{40}$/i.test(left) || /^0x0{40}$/i.test(right)) return false;
  return left.toLowerCase() === right.toLowerCase();
}

function isValidDate(value) {
  return Number.isFinite(new Date(value).getTime());
}
