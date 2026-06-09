import assert from "node:assert/strict";
import { buildControllerSigningActionPack } from "../src/controllerSigningActionPack.mjs";
import { buildProductionPolicyHandoff, publicProductionPolicyHandoffReport } from "../src/productionPolicyHandoff.mjs";
import { DEFAULT_POLICY } from "../src/policyEngine.mjs";
import { EIP712_FIXTURE_CONTROLLER } from "../src/productionFixture.mjs";

const readyActionPack = buildControllerSigningActionPack(DEFAULT_POLICY, {
  controller: EIP712_FIXTURE_CONTROLLER
});

const ready = buildProductionPolicyHandoff(
  {
    actionPack: readyActionPack,
    executionEvidenceReport: {
      valid: false,
      status: "needs_controller_signing_evidence",
      reasons: ["Missing evidenceId", "signedPolicy must include the post-signature production policy JSON"],
      warnings: []
    }
  },
  {
    generatedAt: "2026-06-09T16:50:00.000Z"
  }
);

assert.equal(ready.valid, true);
assert.equal(ready.status, "ready_for_controller_signature");
assert.equal(ready.controller, EIP712_FIXTURE_CONTROLLER);
assert.equal(ready.actionPack.packetCount, 1);
assert.equal(ready.blockers.length, 0);
assert.equal(ready.evidenceGaps.length, 2);
assert.ok(ready.commands.signingPacket.includes("npm run policy-signing-packet"));
assert.ok(ready.commands.approvePacket.includes("external-action-approval"));
assert.ok(ready.commands.pilotEvidenceHandoff.includes("ALLOW_POLICY_PATH=<signed-policy.json>"));
assert.ok(ready.markdown.includes("## Evidence Gaps"));
assert.equal(ready.evidenceBoundary.signsPolicy, false);
assert.equal(ready.evidenceBoundary.finalExternalActionApprovalRequired, true);

const blocked = buildProductionPolicyHandoff(
  {
    actionPack: buildControllerSigningActionPack(DEFAULT_POLICY),
    executionEvidenceReport: {
      valid: false,
      reasons: ["Missing evidenceId"],
      warnings: []
    }
  },
  {
    generatedAt: "2026-06-09T16:51:00.000Z"
  }
);

assert.equal(blocked.status, "blocked_by_policy_template");
assert.ok(blocked.blockers.includes("controller signing action pack: Production policy controller must be a 20-byte EVM address"));
assert.ok(blocked.nextAction.includes("ALLOW_EXPECTED_CONTROLLER"));

const verified = buildProductionPolicyHandoff(
  {
    actionPack: readyActionPack,
    executionEvidenceReport: {
      valid: true,
      status: "verified_controller_signing_execution",
      policy: {
        policyId: "allow_policy_demo_alpha",
        fingerprint: readyActionPack.signing.fingerprint,
        controller: EIP712_FIXTURE_CONTROLLER
      },
      storage: {
        path: "ops/signed-policy.local.json",
        repoCommitted: false,
        accessLimited: true
      },
      reasons: [],
      warnings: []
    }
  },
  {
    generatedAt: "2026-06-09T16:52:00.000Z"
  }
);

assert.equal(verified.status, "signed_policy_verified");
assert.equal(verified.blockers.length, 0);
assert.equal(verified.evidenceGaps.length, 0);
assert.ok(verified.nextAction.includes("ALLOW_POLICY_PATH"));

const publicReport = publicProductionPolicyHandoffReport(ready);
assert.equal(publicReport.markdown, undefined);
assert.equal(publicReport.status, "ready_for_controller_signature");

console.log("productionPolicyHandoff tests passed");
