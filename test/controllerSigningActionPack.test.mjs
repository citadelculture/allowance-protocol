import assert from "node:assert/strict";
import { buildControllerSigningActionPack } from "../src/controllerSigningActionPack.mjs";
import { buildExternalActionApprovalReport } from "../src/externalActionApproval.mjs";
import { DEFAULT_POLICY } from "../src/policyEngine.mjs";

const controller = "0x1111111111111111111111111111111111111111";
const approvals = {
  humanWillExecute: true,
  automationDisabled: true,
  exactActionReviewed: true,
  externalSideEffectAcknowledged: true,
  noPrivateKeys: true,
  noCustodyOrEscrow: true,
  noTokenPitch: true,
  noMarketManipulation: true,
  legalEthicsReviewed: true
};

const pack = buildControllerSigningActionPack(DEFAULT_POLICY, {
  controller,
  requestedAt: "2026-06-08"
});
assert.equal(pack.valid, true);
assert.equal(pack.status, "ready_for_human_approval");
assert.equal(pack.signing.controller, controller);
assert.equal(pack.packets.length, 1);
assert.equal(pack.evidenceBoundary.signsWalletPayloads, false);
assert.equal(pack.evidenceBoundary.finalExternalActionApprovalRequired, true);

const packet = pack.packets[0];
assert.equal(packet.actionType, "controller_policy_signature");
assert.equal(packet.status, "draft");
assert.equal(packet.action.walletAddress, controller);
assert.equal(packet.payload.controller, controller);
assert.equal(packet.payload.policyFingerprint, pack.signing.fingerprint);
assert.equal(packet.payload.typedData.message.controller, controller);
assert.equal(packet.payload.policyTemplate.signatureMode, "eip712");
assert.equal(packet.payload.policyTemplate.controllerSignature, "0x");
assert.equal(packet.payload.signedPolicyShape.controllerSignature, "<wallet-signTypedData-signature>");
assert.equal(packet.approvals.noPrivateKeys, false);

const approvedPacket = {
  ...packet,
  status: "approved",
  approvedBy: "controller-owner",
  approvedAt: "2026-06-08",
  approvals
};
const approvalReport = await buildExternalActionApprovalReport(approvedPacket);
assert.equal(approvalReport.valid, true);
assert.equal(approvalReport.typeReport.signing.controller, controller);
assert.equal(approvalReport.evidenceBoundary.signsWalletPayloads, false);

const invalid = buildControllerSigningActionPack(DEFAULT_POLICY);
assert.equal(invalid.valid, false);
assert.equal(invalid.status, "needs_policy_fixes");
assert.ok(invalid.reasons.includes("Production policy controller must be a 20-byte EVM address"));
assert.equal(invalid.packets[0].status, "draft");

const secretCommand = await buildExternalActionApprovalReport({
  ...approvedPacket,
  action: {
    ...approvedPacket.action,
    command: "ALLOW_CONTROLLER_PRIVATE_KEY=0xabc sign"
  }
});
assert.equal(secretCommand.valid, false);
assert.ok(secretCommand.reasons.includes("controller_policy_signature: action.command must not use ALLOW_CONTROLLER_PRIVATE_KEY"));

const tamperedTypedData = await buildExternalActionApprovalReport({
  ...approvedPacket,
  payload: {
    ...approvedPacket.payload,
    typedData: {
      ...approvedPacket.payload.typedData,
      message: {
        ...approvedPacket.payload.typedData.message,
        controller: "0x2222222222222222222222222222222222222222"
      }
    }
  }
});
assert.equal(tamperedTypedData.valid, false);
assert.ok(tamperedTypedData.reasons.includes("controller_policy_signature: payload.typedData must match generated policy signing packet typedData"));

console.log("controllerSigningActionPack tests passed");
