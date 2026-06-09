import { policyAgentSigner } from "./agentIntentSigner.mjs";
import { policyFingerprint } from "./policyEngine.mjs";

export const PILOT_BINDING_ENVIRONMENTS = ["testnet", "mainnet"];
export const PILOT_BINDING_NETWORKS = ["eip155:84532", "eip155:8453"];
export const PILOT_WALLET_TYPES = ["eoa", "smart_account"];

export function validatePilotBinding(binding = {}, options = {}) {
  const reasons = [];
  const warnings = [];

  if (!binding || typeof binding !== "object" || Array.isArray(binding)) {
    return {
      valid: false,
      reasons: ["Pilot binding must be a JSON object"],
      warnings: []
    };
  }

  const pilot = binding.pilot || {};
  const agent = binding.agent || {};
  const policy = binding.policy || {};
  const runtime = binding.runtime || {};
  const safety = binding.safety || {};
  const policyDocument = options.policy || null;

  requireText(reasons, binding.bindingId, "bindingId");
  requireText(reasons, binding.generatedAt, "generatedAt");
  requireDate(reasons, binding.generatedAt, "generatedAt");

  requireText(reasons, pilot.merchantId, "pilot.merchantId");
  requireKnown(reasons, pilot.environment, PILOT_BINDING_ENVIRONMENTS, "pilot.environment");
  requireKnown(reasons, pilot.network, PILOT_BINDING_NETWORKS, "pilot.network");
  requireText(reasons, pilot.approvalRef, "pilot.approvalRef");
  requireText(reasons, pilot.approvedBy, "pilot.approvedBy");
  requireText(reasons, pilot.approvedAt, "pilot.approvedAt");
  requireDate(reasons, pilot.approvedAt, "pilot.approvedAt");
  if (pilot.environment === "testnet" && pilot.network !== "eip155:84532") reasons.push("testnet pilot binding must use eip155:84532");
  if (pilot.environment === "mainnet" && pilot.network !== "eip155:8453") reasons.push("mainnet pilot binding must use eip155:8453");

  requireText(reasons, agent.agentId, "agent.agentId");
  requireKnown(reasons, agent.walletType, PILOT_WALLET_TYPES, "agent.walletType");
  requireAddress(reasons, agent.walletAddress, "agent.walletAddress");
  requireText(reasons, agent.controlEvidenceRef, "agent.controlEvidenceRef");
  requireText(reasons, agent.controlChallenge, "agent.controlChallenge");
  requireText(reasons, agent.controlSignature, "agent.controlSignature");
  requireText(reasons, agent.approvedBy, "agent.approvedBy");
  requireText(reasons, agent.approvedAt, "agent.approvedAt");
  requireDate(reasons, agent.approvedAt, "agent.approvedAt");
  if (agent.controlChallenge && agent.controlChallenge !== buildPilotWalletControlMessage(binding)) {
    reasons.push("agent.controlChallenge must match the pilot binding challenge");
  }

  requireText(reasons, policy.policyId, "policy.policyId");
  requireText(reasons, policy.policyPath, "policy.policyPath");
  requireText(reasons, policy.policyFingerprint, "policy.policyFingerprint");
  requireTrue(reasons, policy.requireAgentIntentSignature, "policy.requireAgentIntentSignature");

  requireTrue(reasons, runtime.allowProduction, "runtime.allowProduction");
  requireTrue(reasons, runtime.requireAgentSignature, "runtime.requireAgentSignature");
  requireAddress(reasons, runtime.allowAgentAddress, "runtime.allowAgentAddress");
  if (isAddress(runtime.allowAgentAddress) && isAddress(agent.walletAddress) && !sameAddress(runtime.allowAgentAddress, agent.walletAddress)) {
    reasons.push("runtime.allowAgentAddress must match agent.walletAddress");
  }
  if (runtime.fixtureEnabled === true) reasons.push("runtime.fixtureEnabled must be false for production pilot binding");
  if (runtime.agentPrivateKeyExposed !== false) reasons.push("runtime.agentPrivateKeyExposed must be false");
  if (runtime.controllerPrivateKeyExposed !== false) reasons.push("runtime.controllerPrivateKeyExposed must be false");

  requireTrue(reasons, safety.noTradingAuthority, "safety.noTradingAuthority");
  requireTrue(reasons, safety.merchantScoped, "safety.merchantScoped");
  requireTrue(reasons, safety.spendCapsReviewed, "safety.spendCapsReviewed");
  requireTrue(reasons, safety.metadataPolicyReviewed, "safety.metadataPolicyReviewed");

  if (options.requirePolicy !== false && !policyDocument) {
    reasons.push("A signed policy document is required to validate pilot binding");
  }
  if (policyDocument) {
    const policyChecks = validatePolicyDocumentBinding(binding, policyDocument);
    reasons.push(...policyChecks.reasons);
    warnings.push(...policyChecks.warnings);
  }

  return {
    valid: reasons.length === 0,
    reasons,
    warnings
  };
}

export function summarizePilotBinding(binding = {}, options = {}) {
  const validation = validatePilotBinding(binding, options);
  return {
    valid: validation.valid,
    bindingId: binding?.bindingId || null,
    merchantId: binding?.pilot?.merchantId || null,
    environment: binding?.pilot?.environment || null,
    network: binding?.pilot?.network || null,
    agentId: binding?.agent?.agentId || null,
    walletAddress: binding?.agent?.walletAddress || null,
    policyId: binding?.policy?.policyId || null,
    reasons: validation.reasons,
    warnings: validation.warnings
  };
}

export function validatePolicyDocumentBinding(binding = {}, policy = {}) {
  const reasons = [];
  const warnings = [];
  const expectedNetwork = binding?.pilot?.network;
  const expectedChainId = expectedNetwork === "eip155:84532" ? 84532 : expectedNetwork === "eip155:8453" ? 8453 : null;
  const expectedSigner = binding?.agent?.walletAddress || "";
  const actualSigner = policyAgentSigner(policy);
  const actualFingerprint = policyFingerprint(policy);

  if (binding?.policy?.policyId && policy.policyId !== binding.policy.policyId) reasons.push("Policy document policyId does not match binding");
  if (binding?.agent?.agentId && policy.agentId !== binding.agent.agentId) reasons.push("Policy document agentId does not match binding");
  if (!actualSigner) reasons.push("Policy document must bind an agent wallet address");
  if (actualSigner && expectedSigner && !sameAddress(actualSigner, expectedSigner)) reasons.push("Policy document agent address does not match binding wallet");
  if (expectedChainId && Number(policy.chainId || 0) !== expectedChainId) reasons.push("Policy document chainId does not match pilot network");
  if (!Array.isArray(policy.allowedMerchants) || !policy.allowedMerchants.includes(binding?.pilot?.merchantId)) {
    reasons.push("Policy document must allow the pilot merchant");
  }
  if (policy.requireAgentIntentSignature !== true) reasons.push("Policy document must require agent intent signatures");
  if (policy.signatureMode !== "eip712") reasons.push("Policy document must use eip712 signatureMode");
  if (!policy.controllerSignature || String(policy.controllerSignature).startsWith("sig_demo_")) {
    reasons.push("Policy document must include a non-demo controller signature");
  }
  if (binding?.policy?.policyFingerprint && binding.policy.policyFingerprint !== actualFingerprint) {
    reasons.push("Policy document fingerprint does not match binding");
  }
  if (Number(policy.perTxCapUsd || 0) <= 0) reasons.push("Policy document must set a positive perTxCapUsd");
  if (Number(policy.dailyCapUsd || 0) <= 0) reasons.push("Policy document must set a positive dailyCapUsd");
  if (policy.requireIntentNonce !== true) reasons.push("Policy document must require intent nonces");
  if (policy.blockPii !== true) warnings.push("Policy document should keep blockPii enabled for pilot traffic");

  return {
    valid: reasons.length === 0,
    reasons,
    warnings,
    policyFingerprint: actualFingerprint,
    policyAgentAddress: actualSigner || null
  };
}

export function buildPilotWalletControlMessage(binding = {}) {
  return [
    "Allow Protocol pilot wallet binding",
    `bindingId: ${binding?.bindingId || ""}`,
    `merchantId: ${binding?.pilot?.merchantId || ""}`,
    `environment: ${binding?.pilot?.environment || ""}`,
    `network: ${binding?.pilot?.network || ""}`,
    `agentId: ${binding?.agent?.agentId || ""}`,
    `walletAddress: ${String(binding?.agent?.walletAddress || "").toLowerCase()}`,
    `policyId: ${binding?.policy?.policyId || ""}`,
    `policyFingerprint: ${binding?.policy?.policyFingerprint || ""}`
  ].join("\n");
}

export async function verifyPilotWalletControlSignatureAsync(binding = {}, options = {}) {
  const reasons = [];
  const warnings = [];
  const expectedSigner = binding?.agent?.walletAddress || "";
  const expectedChallenge = buildPilotWalletControlMessage(binding);
  const challenge = binding?.agent?.controlChallenge || "";
  const signature = binding?.agent?.controlSignature || "";
  let recoveredSigner = null;

  if (!isAddress(expectedSigner)) reasons.push("agent.walletAddress must be a 20-byte EVM address before wallet control verification");
  if (!challenge) reasons.push("Missing agent.controlChallenge");
  if (!signature) reasons.push("Missing agent.controlSignature");
  if (challenge && challenge !== expectedChallenge) reasons.push("agent.controlChallenge must match the pilot binding challenge");

  if (signature && challenge) {
    try {
      recoveredSigner =
        typeof options.recoverSigner === "function"
          ? await options.recoverSigner({ message: challenge, signature })
          : await recoverMessageSignerWithViem({ message: challenge, signature });
    } catch (error) {
      reasons.push(`Wallet control signature recovery failed: ${error.message}`);
    }
  }

  if (recoveredSigner && expectedSigner && !sameAddress(recoveredSigner, expectedSigner)) {
    reasons.push("Recovered wallet control signer does not match agent.walletAddress");
  }

  return {
    valid: reasons.length === 0,
    expectedSigner: expectedSigner || null,
    recoveredSigner,
    challenge: expectedChallenge,
    reasons,
    warnings
  };
}

export async function recoverMessageSignerWithViem({ message, signature }) {
  const { recoverMessageAddress } = await import("viem");
  return recoverMessageAddress({ message, signature });
}

function requireText(reasons, value, field) {
  if (!String(value || "").trim()) reasons.push(`Missing ${field}`);
}

function requireKnown(reasons, value, allowed, field) {
  if (!allowed.includes(String(value || ""))) reasons.push(`Invalid ${field}`);
}

function requireDate(reasons, value, field) {
  if (value && !Number.isFinite(new Date(value).getTime())) reasons.push(`${field} must be a valid date`);
}

function requireTrue(reasons, value, field) {
  if (value !== true) reasons.push(`${field} must be true`);
}

function requireAddress(reasons, value, field) {
  const address = String(value || "");
  if (!isAddress(address)) {
    reasons.push(`${field} must be a 20-byte EVM address`);
    return;
  }
  if (/^0x0{40}$/i.test(address)) reasons.push(`${field} must not be the zero address`);
}

function isAddress(value) {
  return /^0x[0-9a-fA-F]{40}$/.test(String(value || ""));
}

function sameAddress(a, b) {
  return String(a || "").toLowerCase() === String(b || "").toLowerCase();
}
