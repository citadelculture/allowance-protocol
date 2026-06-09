export const POLICY_TYPED_DATA_TYPES = {
  AllowPolicy: [
    { name: "policyId", type: "string" },
    { name: "controller", type: "string" },
    { name: "agentId", type: "string" },
    { name: "chain", type: "string" },
    { name: "settlementAsset", type: "string" },
    { name: "dailyCapUsd", type: "uint256" },
    { name: "perTxCapUsd", type: "uint256" },
    { name: "maxRiskScore", type: "uint256" },
    { name: "allowedMerchantsHash", type: "bytes32" },
    { name: "blockedCategoriesHash", type: "bytes32" },
    { name: "requireIntentNonce", type: "bool" },
    { name: "policyFingerprint", type: "bytes32" }
  ]
};

export function buildPolicyTypedData(policy, fingerprint) {
  return {
    domain: {
      name: "Allow Protocol",
      version: "0.1",
      chainId: Number(policy.chainId || 8453),
      verifyingContract: policy.verifyingContract || "0x0000000000000000000000000000000000000000"
    },
    primaryType: "AllowPolicy",
    types: POLICY_TYPED_DATA_TYPES,
    message: {
      policyId: policy.policyId,
      controller: policy.controller,
      agentId: policy.agentId,
      chain: policy.chain,
      settlementAsset: policy.settlementAsset,
      dailyCapUsd: integerUsd(policy.dailyCapUsd),
      perTxCapUsd: integerUsd(policy.perTxCapUsd),
      maxRiskScore: Number(policy.maxRiskScore),
      allowedMerchantsHash: bytes32ish(hashList(policy.allowedMerchants || [])),
      blockedCategoriesHash: bytes32ish(hashList(policy.blockedCategories || [])),
      requireIntentNonce: Boolean(policy.requireIntentNonce),
      policyFingerprint: bytes32ish(fingerprint)
    }
  };
}

export function demoPolicySignature(fingerprint) {
  return `sig_demo_${fingerprint}`;
}

export function verifyPolicySignature(policy, fingerprint, options = {}) {
  const mode = options.mode || policy.signatureMode || "demo";
  const production = Boolean(options.production || policy.production);
  const signature = policy.controllerSignature || "";
  const typedData = buildPolicyTypedData(policy, fingerprint);
  const reasons = [];
  const warnings = [];
  let recoveredController = null;

  if (!policy.requireSignedPolicy) {
    return {
      valid: true,
      mode: "unsigned",
      reasons,
      warnings,
      typedData,
      recoveredController
    };
  }

  if (!signature) {
    reasons.push("Missing controller policy signature");
  }

  const hasDemoSignature = signature.startsWith("sig_demo_") || policy.signatureMode === "demo";

  if (production && hasDemoSignature) {
    reasons.push("Demo policy signatures are disabled in production");
  }

  if (mode === "demo") {
    const expected = demoPolicySignature(fingerprint);
    if (signature && signature !== expected) {
      reasons.push("Invalid demo policy signature for policy fingerprint");
    }
    warnings.push("Demo policy signature accepted; replace with EIP-712 verification before production");
  } else if (mode === "eip712") {
    if (typeof options.recoverController !== "function") {
      reasons.push("Missing EIP-712 controller recovery function");
    } else if (signature) {
      recoveredController = options.recoverController({ policy, typedData, signature, fingerprint });
      if (!sameController(recoveredController, policy.controller)) {
        reasons.push("Recovered controller does not match policy controller");
      }
    }
  } else {
    reasons.push(`Unsupported policy signature mode: ${mode}`);
  }

  return {
    valid: reasons.length === 0,
    mode,
    reasons,
    warnings,
    typedData,
    recoveredController
  };
}

export async function verifyPolicySignatureAsync(policy, fingerprint, options = {}) {
  const mode = options.mode || policy.signatureMode || "demo";
  const production = Boolean(options.production || policy.production);
  const signature = policy.controllerSignature || "";
  const typedData = buildPolicyTypedData(policy, fingerprint);
  const reasons = [];
  const warnings = [];
  let recoveredController = null;

  if (!policy.requireSignedPolicy) {
    return {
      valid: true,
      mode: "unsigned",
      reasons,
      warnings,
      typedData,
      recoveredController
    };
  }

  if (!signature) {
    reasons.push("Missing controller policy signature");
  }

  const hasDemoSignature = signature.startsWith("sig_demo_") || policy.signatureMode === "demo";

  if (production && hasDemoSignature) {
    reasons.push("Demo policy signatures are disabled in production");
  }

  if (mode === "demo") {
    const expected = demoPolicySignature(fingerprint);
    if (signature && signature !== expected) {
      reasons.push("Invalid demo policy signature for policy fingerprint");
    }
    warnings.push("Demo policy signature accepted; replace with EIP-712 verification before production");
  } else if (mode === "eip712") {
    if (production && hasDemoSignature) {
      return {
        valid: false,
        mode,
        reasons,
        warnings,
        typedData,
        recoveredController
      };
    }

    if (typeof options.recoverController === "function" && signature) {
      recoveredController = await options.recoverController({ policy, typedData, signature, fingerprint });
    } else if (signature) {
      try {
        recoveredController = await recoverControllerWithViem({ typedData, signature });
      } catch (error) {
        reasons.push(`EIP-712 signature recovery failed: ${error.message}`);
      }
    } else {
      reasons.push("Missing EIP-712 controller recovery function");
    }

    if (signature && !sameController(recoveredController, policy.controller)) {
      reasons.push("Recovered controller does not match policy controller");
    }
  } else {
    reasons.push(`Unsupported policy signature mode: ${mode}`);
  }

  return {
    valid: reasons.length === 0,
    mode,
    reasons,
    warnings,
    typedData,
    recoveredController
  };
}

export async function recoverControllerWithViem({ typedData, signature }) {
  const { recoverTypedDataAddress } = await import("viem");

  return recoverTypedDataAddress({
    domain: typedData.domain,
    types: typedData.types,
    primaryType: typedData.primaryType,
    message: typedData.message,
    signature
  });
}

function hashList(values) {
  return simpleHash([...values].map((value) => String(value)).sort().join("|"));
}

function bytes32ish(hash) {
  return `0x${String(hash).padStart(64, "0")}`;
}

function integerUsd(value) {
  return Math.round(Number(value) * 1_000_000);
}

function sameController(a, b) {
  return String(a || "").toLowerCase() === String(b || "").toLowerCase();
}

function simpleHash(input) {
  let hash = 2166136261;
  const text = String(input);
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
