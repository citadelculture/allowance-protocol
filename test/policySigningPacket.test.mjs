import assert from "node:assert/strict";
import { DEFAULT_POLICY, policyFingerprint } from "../src/policyEngine.mjs";
import { buildPolicySigningPacket } from "../src/policySigningPacket.mjs";

const controller = "0x1111111111111111111111111111111111111111";
const packet = buildPolicySigningPacket(DEFAULT_POLICY, { controller });

assert.equal(packet.valid, true);
assert.equal(packet.status, "ready_for_controller_signature");
assert.equal(packet.controller, controller);
assert.equal(packet.unsignedPolicy.signatureMode, "eip712");
assert.equal(packet.unsignedPolicy.production, true);
assert.equal(packet.unsignedPolicy.requireAgentIntentSignature, true);
assert.equal(packet.unsignedPolicy.controllerSignature, "0x");
assert.equal(packet.fingerprint, policyFingerprint(packet.unsignedPolicy));
assert.equal(packet.typedData.message.policyId, DEFAULT_POLICY.policyId);
assert.equal(packet.typedData.message.controller, controller);
assert.equal(packet.signedPolicyShape.controllerSignature, "<wallet-signTypedData-signature>");
assert.equal(packet.evidenceBoundary.signedByThisPacket, false);
assert.equal(packet.evidenceBoundary.includesPrivateKeyMaterial, false);
assert.ok(packet.commands.verifySignedPolicy.includes("verify-policy"));
assert.ok(packet.humanApprovalChecklist.some((item) => item.includes("not by pasting a private key")));

const invalid = buildPolicySigningPacket(DEFAULT_POLICY);
assert.equal(invalid.valid, false);
assert.equal(invalid.status, "action_required");
assert.ok(invalid.reasons.includes("Production policy controller must be a 20-byte EVM address"));
assert.ok(invalid.warnings.includes("Controller still matches the demo placeholder"));

console.log("policySigningPacket tests passed");
