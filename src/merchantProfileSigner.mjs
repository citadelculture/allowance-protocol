import { privateKeyToAccount } from "viem/accounts";
import { stableHash } from "./policyEngine.mjs";

export const MERCHANT_PROFILE_TYPED_DATA_TYPES = {
  AllowMerchantProfile: [
    { name: "id", type: "string" },
    { name: "name", type: "string" },
    { name: "status", type: "string" },
    { name: "surfacesHash", type: "bytes32" },
    { name: "endpointHash", type: "bytes32" },
    { name: "pricingHash", type: "bytes32" },
    { name: "paymentHash", type: "bytes32" },
    { name: "riskHash", type: "bytes32" },
    { name: "receiptsHash", type: "bytes32" },
    { name: "profileFingerprint", type: "bytes32" }
  ]
};

export function merchantProfileFingerprint(profile = {}) {
  return stableHash({
    id: profile.id,
    name: profile.name,
    status: profile.status,
    surfacesHash: hashObject([...(profile.surfaces || [])].sort()),
    endpointHash: hashObject(profile.endpoint || {}),
    pricingHash: hashObject(profile.pricing || {}),
    paymentHash: hashObject(profile.payment || {}),
    riskHash: hashObject(profile.risk || {}),
    receiptsHash: hashObject(profile.receipts || {}),
    refundRules: profile.refundRules || "",
    disputeContact: profile.disputeContact || "",
    publicProof: profile.publicProof || "",
    lastReviewedAt: profile.lastReviewedAt || ""
  });
}

export function buildMerchantProfileTypedData(profile, fingerprint = merchantProfileFingerprint(profile)) {
  return {
    domain: {
      name: "Allow Protocol",
      version: "0.1",
      chainId: Number(profile.chainId || profile.payment?.chainId || 8453),
      verifyingContract: profile.verifyingContract || "0x0000000000000000000000000000000000000000"
    },
    primaryType: "AllowMerchantProfile",
    types: MERCHANT_PROFILE_TYPED_DATA_TYPES,
    message: {
      id: profile.id || "",
      name: profile.name || "",
      status: profile.status || "",
      surfacesHash: bytes32ish(hashObject([...(profile.surfaces || [])].sort())),
      endpointHash: bytes32ish(hashObject(profile.endpoint || {})),
      pricingHash: bytes32ish(hashObject(profile.pricing || {})),
      paymentHash: bytes32ish(hashObject(profile.payment || {})),
      riskHash: bytes32ish(hashObject(profile.risk || {})),
      receiptsHash: bytes32ish(hashObject(profile.receipts || {})),
      profileFingerprint: bytes32ish(fingerprint)
    }
  };
}

export async function signMerchantProfileWithPrivateKey(profile = {}, privateKey) {
  const key = normalizePrivateKey(privateKey, "ALLOW_MERCHANT_PRIVATE_KEY");
  const account = privateKeyToAccount(key);
  const unsignedProfile = {
    ...profile,
    signer: account.address,
    merchantSignature: "0x",
    signatureMode: "eip712"
  };
  const fingerprint = merchantProfileFingerprint(unsignedProfile);
  const typedData = buildMerchantProfileTypedData(unsignedProfile, fingerprint);
  const signature = await account.signTypedData(typedData);

  return {
    profile: {
      ...unsignedProfile,
      merchantSignature: signature
    },
    signer: account.address,
    fingerprint,
    typedData
  };
}

export async function verifyMerchantProfileSignatureAsync(profile = {}, options = {}) {
  const mode = options.mode || profile.signatureMode || "unsigned";
  const requireSignature = options.requireSignature ?? profile.status === "live";
  const signature = profile.merchantSignature || "";
  const signer = profile.signer || profile.merchantController || "";
  const fingerprint = merchantProfileFingerprint(profile);
  const typedData = buildMerchantProfileTypedData(profile, fingerprint);
  const reasons = [];
  const warnings = [];
  let recoveredSigner = null;

  if (!requireSignature && !signature) {
    warnings.push("Unsigned merchant profile accepted for non-live listing");
    return {
      valid: true,
      mode: "unsigned",
      fingerprint,
      typedData,
      recoveredSigner,
      reasons,
      warnings
    };
  }

  if (!signer) reasons.push("Missing merchant profile signer");
  if (!signature) reasons.push("Missing merchant profile signature");

  if (mode !== "eip712") {
    reasons.push(`Unsupported merchant profile signature mode: ${mode}`);
  } else if (signature) {
    try {
      recoveredSigner =
        typeof options.recoverSigner === "function"
          ? await options.recoverSigner({ profile, typedData, signature, fingerprint })
          : await recoverMerchantProfileSignerWithViem({ typedData, signature });
    } catch (error) {
      reasons.push(`EIP-712 merchant profile recovery failed: ${error.message}`);
    }

    if (signer && recoveredSigner && !sameAddress(recoveredSigner, signer)) {
      reasons.push("Recovered merchant profile signer does not match profile signer");
    }
  }

  return {
    valid: reasons.length === 0,
    mode,
    fingerprint,
    typedData,
    recoveredSigner,
    reasons,
    warnings
  };
}

export async function recoverMerchantProfileSignerWithViem({ typedData, signature }) {
  const { recoverTypedDataAddress } = await import("viem");

  return recoverTypedDataAddress({
    domain: typedData.domain,
    types: typedData.types,
    primaryType: typedData.primaryType,
    message: typedData.message,
    signature
  });
}

export function normalizePrivateKey(privateKey, envName = "PRIVATE_KEY") {
  const key = String(privateKey || "").trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error(`${envName} must be a 32-byte hex private key with 0x prefix`);
  }
  return key;
}

function hashObject(value) {
  return stableHash(stableValue(value));
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

function bytes32ish(hash) {
  return `0x${String(hash).padStart(64, "0")}`;
}

function sameAddress(a, b) {
  return String(a || "").toLowerCase() === String(b || "").toLowerCase();
}
