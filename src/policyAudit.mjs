import { validatePolicyEnvelopeAsync } from "./policyEngine.mjs";

export async function verifyProductionPolicy(policy, options = {}) {
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) {
    return {
      valid: false,
      reasons: ["Policy must be a JSON object"],
      warnings: [],
      fingerprint: null,
      policyId: null,
      controller: null,
      recoveredController: null,
      signatureMode: null,
      verifierMode: null
    };
  }

  const requirements = productionPolicyRequirements(policy);
  const envelope = await validatePolicyEnvelopeAsync(policy, {
    policyVerifier: {
      production: true,
      mode: "eip712",
      ...(options.policyVerifier || {})
    }
  });
  const warnings = [...envelope.warnings];

  if (policy.production !== true) {
    warnings.push("Policy does not set production=true; runtime will normalize policies loaded from env");
  }

  const reasons = [...requirements, ...envelope.reasons];

  return {
    valid: reasons.length === 0,
    reasons,
    warnings,
    fingerprint: envelope.fingerprint,
    policyId: envelope.policyId,
    controller: policy.controller || null,
    recoveredController: envelope.signature.recoveredController,
    signatureMode: policy.signatureMode || null,
    verifierMode: envelope.signature.mode
  };
}

export function productionPolicyRequirements(policy) {
  const reasons = [];

  if (policy.signatureMode !== "eip712") {
    reasons.push("Production policy must use signatureMode=eip712");
  }

  if (!policy.requireSignedPolicy) {
    reasons.push("Production policy must set requireSignedPolicy=true");
  }

  if (!policy.requireIntentNonce) {
    reasons.push("Production policy must require intent nonces");
  }

  if (!policy.requireReceipt) {
    reasons.push("Production policy must require receipts");
  }

  if (!isEvmAddress(policy.controller)) {
    reasons.push("Production policy controller must be a 20-byte EVM address");
  }

  if (!isPositiveNumber(policy.dailyCapUsd)) {
    reasons.push("Production policy must set a positive dailyCapUsd");
  }

  if (!isPositiveNumber(policy.perTxCapUsd)) {
    reasons.push("Production policy must set a positive perTxCapUsd");
  }

  if (isPositiveNumber(policy.dailyCapUsd) && isPositiveNumber(policy.perTxCapUsd)) {
    if (Number(policy.perTxCapUsd) > Number(policy.dailyCapUsd)) {
      reasons.push("Production policy perTxCapUsd must not exceed dailyCapUsd");
    }
  }

  return reasons;
}

function isEvmAddress(value) {
  return /^0x[0-9a-fA-F]{40}$/.test(String(value || ""));
}

function isPositiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0;
}
