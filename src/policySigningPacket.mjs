import { DEFAULT_POLICY, policyFingerprint } from "./policyEngine.mjs";
import { buildPolicyTypedData } from "./policyVerifier.mjs";
import { productionPolicyRequirements } from "./policyAudit.mjs";

export function buildPolicySigningPacket(template = DEFAULT_POLICY, options = {}) {
  const controller = String(options.controller || template.controller || "").trim();
  const policy = normalizeUnsignedProductionPolicy(template, {
    controller,
    policyId: options.policyId,
    agentId: options.agentId
  });
  const fingerprint = policyFingerprint(policy);
  const typedData = buildPolicyTypedData(policy, fingerprint);
  const reasons = productionPolicyRequirements(policy);
  const warnings = signingWarnings(policy, options);
  const valid = reasons.length === 0;

  return {
    generatedAt: new Date().toISOString(),
    valid,
    status: valid ? "ready_for_controller_signature" : "action_required",
    policyId: policy.policyId,
    controller: policy.controller,
    fingerprint,
    reasons,
    warnings,
    unsignedPolicy: policy,
    typedData,
    signedPolicyShape: {
      ...policy,
      controllerSignature: "<wallet-signTypedData-signature>"
    },
    humanApprovalChecklist: [
      "Controller wallet address matches the intended policy owner",
      "Merchant allowlist, caps, blocked categories, and metadata limits are reviewed",
      "Typed data is signed in the controller wallet, not by pasting a private key into chat or a repository",
      "Signed policy is stored outside the repository or in a gitignored local file",
      "`npm run verify-policy -- <signed-policy.json>` passes after the signature is attached",
      "`npm run ceremony-audit -- <signed-policy.json>` passes with ALLOW_PRODUCTION=1 and signed agent intents required"
    ],
    evidenceBoundary: {
      signedByThisPacket: false,
      includesPrivateKeyMaterial: false,
      productionPolicyConfigured: false,
      validProductionPolicyRequires: [
        "controllerSignature set to the wallet EIP-712 signature",
        "signatureMode=eip712",
        "production=true",
        "verify-policy passes",
        "ceremony-audit passes",
        "runtime points to ALLOW_POLICY_PATH or ALLOW_POLICY_JSON"
      ]
    },
    commands: {
      verifySignedPolicy: "npm run verify-policy -- <signed-policy.json>",
      auditCeremony: "ALLOW_PRODUCTION=1 ALLOW_REQUIRE_AGENT_SIGNATURE=1 ALLOW_EXPECTED_CONTROLLER=<controller> npm run ceremony-audit -- <signed-policy.json>",
      runtimeSmoke: "ALLOW_PRODUCTION=1 ALLOW_REQUIRE_AGENT_SIGNATURE=1 ALLOW_POLICY_PATH=<signed-policy.json> npm start"
    },
    nextAction: valid
      ? "Sign typedData with the controller wallet, attach the signature, then run verify-policy and ceremony-audit"
      : "Set a real EVM controller address and review production policy requirements before signing"
  };
}

function normalizeUnsignedProductionPolicy(template = DEFAULT_POLICY, options = {}) {
  return {
    ...DEFAULT_POLICY,
    ...template,
    policyId: options.policyId || template.policyId || DEFAULT_POLICY.policyId,
    agentId: options.agentId || template.agentId || DEFAULT_POLICY.agentId,
    controller: options.controller || template.controller || DEFAULT_POLICY.controller,
    controllerSignature: "0x",
    signatureMode: "eip712",
    production: true,
    spentTodayUsd: 0,
    requireReceipt: true,
    requireSignedPolicy: true,
    requireIntentNonce: true,
    requireAgentIntentSignature: true,
    allowedMerchants: Array.isArray(template.allowedMerchants)
      ? template.allowedMerchants
      : DEFAULT_POLICY.allowedMerchants,
    blockedCategories: Array.isArray(template.blockedCategories)
      ? template.blockedCategories
      : DEFAULT_POLICY.blockedCategories
  };
}

function signingWarnings(policy, options = {}) {
  const warnings = [];

  if (policy.verifyingContract === "0x0000000000000000000000000000000000000000") {
    warnings.push("verifyingContract is zero address; set the deployed verifier or registry before public mainnet use");
  }
  if ((policy.allowedMerchants || []).length === 0) {
    warnings.push("Policy has no allowed merchants");
  }
  if (!options.controller && policy.controller === DEFAULT_POLICY.controller) {
    warnings.push("Controller still matches the demo placeholder");
  }

  return warnings;
}
