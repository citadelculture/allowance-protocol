export const AGENT_INTENT_TYPED_DATA_TYPES = {
  AllowPaymentIntent: [
    { name: "policyId", type: "string" },
    { name: "agentId", type: "string" },
    { name: "merchantId", type: "string" },
    { name: "amountMicroUsd", type: "uint256" },
    { name: "resourceHash", type: "bytes32" },
    { name: "metadataHash", type: "bytes32" },
    { name: "intentNonce", type: "string" },
    { name: "policyFingerprint", type: "bytes32" }
  ]
};

export function buildAgentIntentTypedData(intent = {}, policy = {}, policyFingerprint = "") {
  return {
    domain: {
      name: "Allow Protocol",
      version: "0.1",
      chainId: Number(policy.chainId || 8453),
      verifyingContract: policy.verifyingContract || "0x0000000000000000000000000000000000000000"
    },
    primaryType: "AllowPaymentIntent",
    types: AGENT_INTENT_TYPED_DATA_TYPES,
    message: {
      policyId: policy.policyId || "",
      agentId: policy.agentId || "",
      merchantId: intent.merchantId || "",
      amountMicroUsd: integerUsd(intent.amountUsd),
      resourceHash: bytes32ish(hashString(intent.resource || "unbound")),
      metadataHash: bytes32ish(hashString(String(intent.metadata || ""))),
      intentNonce: String(intent.intentNonce || intent.nonce || ""),
      policyFingerprint: bytes32ish(policyFingerprint)
    }
  };
}

export async function signAgentIntentWithPrivateKey(intent = {}, policy = {}, policyFingerprint = "", privateKey) {
  const { privateKeyToAccount } = await import("viem/accounts");
  const account = privateKeyToAccount(normalizePrivateKey(privateKey, "ALLOW_AGENT_PRIVATE_KEY"));
  const unsignedIntent = {
    ...intent,
    agentAddress: account.address,
    agentSignature: "0x",
    agentSignatureMode: "eip712"
  };
  const typedData = buildAgentIntentTypedData(unsignedIntent, policy, policyFingerprint);
  const signature = await account.signTypedData(typedData);

  return {
    intent: {
      ...unsignedIntent,
      agentSignature: signature
    },
    signer: account.address,
    signature,
    typedData,
    headers: {
      "x-allow-agent": account.address,
      "x-allow-agent-signature": signature,
      "x-allow-agent-signature-mode": "eip712"
    }
  };
}

export function verifyAgentIntentSignature(intent = {}, policy = {}, policyFingerprint = "", options = {}) {
  const prepared = prepareAgentIntentVerification(intent, policy, policyFingerprint, options);
  const { signature, mode, requireSignature, expectedSigner, typedData } = prepared;
  const reasons = [...prepared.reasons];
  const warnings = [...prepared.warnings];
  let recoveredSigner = null;

  if (!requireSignature && !signature) {
    return unsignedAgentIntentResult({ typedData, reasons, warnings });
  }

  if (mode !== "eip712") reasons.push(`Unsupported agent intent signature mode: ${mode}`);

  if (mode === "eip712" && signature) {
    if (typeof options.recoverSigner !== "function") {
      reasons.push("Missing EIP-712 agent intent recovery function");
    } else {
      recoveredSigner = options.recoverSigner({ intent, policy, typedData, signature, policyFingerprint });
    }
  }

  finishAgentIntentSignerChecks({
    reasons,
    warnings,
    requireSignature,
    signature,
    expectedSigner,
    recoveredSigner,
    claimedSigner: claimedAgentSigner(intent)
  });

  return verificationResult({ mode, typedData, recoveredSigner, reasons, warnings });
}

export async function verifyAgentIntentSignatureAsync(intent = {}, policy = {}, policyFingerprint = "", options = {}) {
  const prepared = prepareAgentIntentVerification(intent, policy, policyFingerprint, options);
  const { signature, mode, requireSignature, expectedSigner, typedData } = prepared;
  const reasons = [...prepared.reasons];
  const warnings = [...prepared.warnings];
  let recoveredSigner = null;

  if (!requireSignature && !signature) {
    return unsignedAgentIntentResult({ typedData, reasons, warnings });
  }

  if (mode !== "eip712") reasons.push(`Unsupported agent intent signature mode: ${mode}`);

  if (mode === "eip712" && signature) {
    try {
      recoveredSigner =
        typeof options.recoverSigner === "function"
          ? await options.recoverSigner({ intent, policy, typedData, signature, policyFingerprint })
          : await recoverAgentIntentSignerWithViem({ typedData, signature });
    } catch (error) {
      reasons.push(`EIP-712 agent intent recovery failed: ${error.message}`);
    }
  }

  finishAgentIntentSignerChecks({
    reasons,
    warnings,
    requireSignature,
    signature,
    expectedSigner,
    recoveredSigner,
    claimedSigner: claimedAgentSigner(intent)
  });

  return verificationResult({ mode, typedData, recoveredSigner, reasons, warnings });
}

export async function recoverAgentIntentSignerWithViem({ typedData, signature }) {
  const { recoverTypedDataAddress } = await import("viem");

  return recoverTypedDataAddress({
    domain: typedData.domain,
    types: typedData.types,
    primaryType: typedData.primaryType,
    message: typedData.message,
    signature
  });
}

export function policyAgentSigner(policy = {}) {
  for (const value of [policy.agentAddress, policy.agentWallet, policy.agent]) {
    if (isAddress(value)) return value;
  }
  return isAddress(policy.agentId) ? policy.agentId : "";
}

export function normalizePrivateKey(privateKey, envName = "PRIVATE_KEY") {
  const key = String(privateKey || "").trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error(`${envName} must be a 32-byte hex private key with 0x prefix`);
  }
  return key;
}

function prepareAgentIntentVerification(intent, policy, policyFingerprint, options) {
  const requireSignature = options.requireSignature ?? policy.requireAgentIntentSignature ?? false;
  const signature = intent.agentSignature || intent.signature || "";
  const mode = options.mode || intent.agentSignatureMode || (signature ? "eip712" : "unsigned");
  const expectedSigner = options.expectedSigner || policyAgentSigner(policy);
  const typedData = buildAgentIntentTypedData(intent, policy, policyFingerprint);
  const reasons = [];
  const warnings = [];

  if (requireSignature && !expectedSigner) reasons.push("Missing policy agent address for intent signature");
  if (requireSignature && !signature) reasons.push("Missing agent intent signature");
  if (!requireSignature && signature && !expectedSigner) {
    warnings.push("Agent intent signature is not bound to a policy agent address");
  }

  return {
    requireSignature,
    signature,
    mode,
    expectedSigner,
    typedData,
    reasons,
    warnings
  };
}

function finishAgentIntentSignerChecks({
  reasons,
  requireSignature,
  signature,
  expectedSigner,
  recoveredSigner,
  claimedSigner
}) {
  if (!signature || !recoveredSigner) return;
  if (expectedSigner && !sameAddress(recoveredSigner, expectedSigner)) {
    reasons.push("Recovered agent signer does not match policy agent address");
  }
  if (claimedSigner && !sameAddress(recoveredSigner, claimedSigner)) {
    reasons.push("Claimed agent signer does not match recovered signer");
  }
  if (requireSignature && !expectedSigner) {
    reasons.push("Policy-bound agent signer is required for production intent signatures");
  }
}

function unsignedAgentIntentResult({ typedData, reasons, warnings }) {
  return {
    valid: reasons.length === 0,
    mode: "unsigned",
    typedData,
    recoveredSigner: null,
    reasons,
    warnings
  };
}

function verificationResult({ mode, typedData, recoveredSigner, reasons, warnings }) {
  return {
    valid: reasons.length === 0,
    mode,
    typedData,
    recoveredSigner,
    reasons,
    warnings
  };
}

function claimedAgentSigner(intent = {}) {
  return intent.agentAddress || intent.agent || "";
}

function integerUsd(value) {
  return Math.round(Number(value || 0) * 1_000_000);
}

function bytes32ish(hash) {
  return `0x${String(hash).padStart(64, "0")}`;
}

function hashString(input) {
  let hash = 2166136261;
  const text = String(input);
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function isAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(value || ""));
}

function sameAddress(a, b) {
  return String(a || "").toLowerCase() === String(b || "").toLowerCase();
}
