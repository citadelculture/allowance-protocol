import { privateKeyToAccount } from "viem/accounts";
import { DEFAULT_POLICY, policyFingerprint } from "./policyEngine.mjs";
import { buildPolicyTypedData } from "./policyVerifier.mjs";

export async function signPolicyWithPrivateKey(policy = DEFAULT_POLICY, privateKey) {
  const key = normalizePrivateKey(privateKey);
  const account = privateKeyToAccount(key);
  const unsignedPolicy = {
    ...policy,
    controller: account.address,
    controllerSignature: "0x",
    signatureMode: "eip712",
    production: true
  };
  const fingerprint = policyFingerprint(unsignedPolicy);
  const typedData = buildPolicyTypedData(unsignedPolicy, fingerprint);
  const signature = await account.signTypedData(typedData);

  return {
    policy: {
      ...unsignedPolicy,
      controllerSignature: signature
    },
    controller: account.address,
    fingerprint,
    typedData
  };
}

export function normalizePrivateKey(privateKey) {
  const key = String(privateKey || "").trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error("ALLOW_CONTROLLER_PRIVATE_KEY must be a 32-byte hex private key with 0x prefix");
  }
  return key;
}
