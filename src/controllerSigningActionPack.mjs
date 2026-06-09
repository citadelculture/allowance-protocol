import { buildPolicySigningPacket } from "./policySigningPacket.mjs";

export const CONTROLLER_SIGNING_ACTION_PACK_STATUSES = ["ready_for_human_approval", "needs_policy_fixes"];

const APPROVAL_FLAGS = [
  "humanWillExecute",
  "automationDisabled",
  "exactActionReviewed",
  "externalSideEffectAcknowledged",
  "noPrivateKeys",
  "noCustodyOrEscrow",
  "noTokenPitch",
  "noMarketManipulation",
  "legalEthicsReviewed"
];

export function buildControllerSigningActionPack(template = {}, options = {}) {
  const signing = buildPolicySigningPacket(template, {
    controller: options.controller,
    policyId: options.policyId,
    agentId: options.agentId
  });
  const packet = buildControllerSigningExternalActionPacket(signing, template, options);
  const reasons = [...signing.reasons];

  return {
    generatedAt: new Date().toISOString(),
    valid: signing.valid,
    status: signing.valid ? "ready_for_human_approval" : "needs_policy_fixes",
    signing: {
      valid: signing.valid,
      status: signing.status,
      policyId: signing.policyId,
      controller: signing.controller,
      fingerprint: signing.fingerprint,
      reasons: signing.reasons,
      warnings: signing.warnings,
      commands: signing.commands
    },
    packets: [packet],
    reasons,
    warnings: signing.warnings,
    nextAction: signing.valid
      ? "Review the controller_policy_signature packet, fill human approval fields, run external-action-approval, then sign typedData in the controller wallet."
      : "Fix the production policy template or controller address before preparing a signing approval packet.",
    evidenceBoundary: {
      signsWalletPayloads: false,
      signsPolicy: false,
      approvesExternalAction: false,
      storesSecrets: false,
      storesSignedPolicy: false,
      movesFunds: false,
      startsRuntime: false,
      requiresHumanApproval: true,
      finalExternalActionApprovalRequired: true
    }
  };
}

export function buildControllerSigningExternalActionPacket(signing = {}, template = {}, options = {}) {
  const controller = String(signing.controller || options.controller || "").trim();
  const approvalIdPrefix = String(options.approvalIdPrefix || "controller_policy_signature").trim();
  const approvalId = `${approvalIdPrefix}_${slug(signing.policyId || template.policyId || "policy")}`;

  return {
    approvalId,
    actionType: "controller_policy_signature",
    status: "draft",
    requestedBy: String(options.requestedBy || "allow-operator").trim(),
    requestedAt: String(options.requestedAt || isoDate()).trim(),
    approvedBy: "",
    approvedAt: "",
    action: {
      summary: `Controller wallet signs Allow production policy ${signing.policyId || template.policyId || "policy"}`,
      channel: "wallet",
      destination: controller,
      walletAddress: controller,
      command: `Sign EIP-712 policy typedData fingerprint ${signing.fingerprint || "<policy-fingerprint>"} in the controller wallet`,
      executionMode: "human_only",
      automated: false
    },
    approvals: Object.fromEntries(APPROVAL_FLAGS.map((flag) => [flag, false])),
    payload: {
      controller,
      policyId: signing.policyId || template.policyId || "",
      policyFingerprint: signing.fingerprint || "",
      policyTemplate: signing.unsignedPolicy || template,
      typedData: signing.typedData || null,
      signedPolicyShape: signing.signedPolicyShape || null,
      verificationCommands: signing.commands || {}
    },
    notes: [
      "Generated from a no-secret policy signing packet.",
      "This packet must remain draft until the controller wallet owner reviews the exact typed data and sets every approval flag.",
      "Run npm run external-action-approval on the approved packet before signing typedData.",
      "Do not paste private keys, seed phrases, or wallet secrets into this packet."
    ]
  };
}

function slug(value) {
  const text = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return text || "policy";
}

function isoDate() {
  return new Date().toISOString().slice(0, 10);
}
