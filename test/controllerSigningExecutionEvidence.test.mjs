import assert from "node:assert/strict";
import { buildControllerSigningActionPack } from "../src/controllerSigningActionPack.mjs";
import { buildControllerSigningExecutionEvidenceReport } from "../src/controllerSigningExecutionEvidence.mjs";
import { DEFAULT_POLICY } from "../src/policyEngine.mjs";
import { EIP712_FIXTURE_CONTROLLER, productionFixturePolicy } from "../src/productionFixture.mjs";

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
  controller: EIP712_FIXTURE_CONTROLLER,
  requestedAt: "2026-06-08"
});
const approvalPacket = {
  ...pack.packets[0],
  status: "approved",
  approvedBy: "controller-owner",
  approvedAt: "2026-06-08",
  approvals
};
const signedPolicy = productionFixturePolicy();

function evidence(overrides = {}) {
  return {
    evidenceId: "controller-signing-exec-001",
    generatedAt: "2026-06-08T12:00:00.000Z",
    executionStatus: "signed_policy_stored",
    approvalRef: "external-action:controller_policy_signature_allow_policy_demo_alpha",
    approvalPacket,
    signedPolicy,
    signing: {
      signedAt: "2026-06-08T12:05:00.000Z",
      signedBy: "controller-owner",
      walletAddress: EIP712_FIXTURE_CONTROLLER,
      method: "wallet_ui",
      humanExecuted: true,
      walletOwnerApproved: true,
      automationUsed: false,
      privateKeyMaterialExposed: false,
      privateKeyInRuntimeEnv: false,
      policyFingerprint: pack.signing.fingerprint
    },
    storage: {
      type: "gitignored_local",
      path: "ops/signed-policy.local.json",
      storedAt: "2026-06-08T12:10:00.000Z",
      storedBy: "controller-owner",
      repoCommitted: false,
      accessLimited: true,
      noPrivateKeyMaterial: true,
      runtimeSourceConfigured: true
    },
    ceremony: {
      env: {
        ALLOW_PRODUCTION: "1",
        ALLOW_REQUIRE_AGENT_SIGNATURE: "1",
        ALLOW_POLICY_PATH: "ops/signed-policy.local.json"
      }
    },
    proof: {
      type: "ceremony_audit",
      ref: "ops/evidence/redacted-controller-signing-audit.json",
      capturedAt: "2026-06-08T12:11:00.000Z",
      redacted: true
    },
    ...overrides
  };
}

const valid = await buildControllerSigningExecutionEvidenceReport(evidence());
assert.equal(valid.valid, true);
assert.equal(valid.status, "verified_controller_signing_execution");
assert.equal(valid.approvalReport.valid, true);
assert.equal(valid.policyAudit.valid, true);
assert.equal(valid.ceremonyAudit.valid, true);
assert.equal(valid.policy.controller, EIP712_FIXTURE_CONTROLLER);
assert.equal(valid.policy.fingerprint, pack.signing.fingerprint);
assert.equal(valid.evidenceBoundary.signsWalletPayloads, false);
assert.equal(valid.evidenceBoundary.marksProductionPolicyConfigured, false);

const unapproved = await buildControllerSigningExecutionEvidenceReport(
  evidence({
    approvalPacket: {
      ...approvalPacket,
      status: "draft",
      approvedBy: "",
      approvals: {
        ...approvals,
        humanWillExecute: false
      }
    }
  })
);
assert.equal(unapproved.valid, false);
assert.ok(unapproved.reasons.includes("approvalPacket: External action must be approved before execution"));
assert.ok(unapproved.reasons.includes("approvalPacket.status must be approved"));

const placeholderSignature = await buildControllerSigningExecutionEvidenceReport(
  evidence({
    signedPolicy: {
      ...signedPolicy,
      controllerSignature: "0x"
    }
  })
);
assert.equal(placeholderSignature.valid, false);
assert.ok(placeholderSignature.reasons.includes("signedPolicy.controllerSignature must contain the wallet signature, not the unsigned placeholder"));

const wrongWallet = await buildControllerSigningExecutionEvidenceReport(
  evidence({
    signing: {
      ...evidence().signing,
      walletAddress: "0x2222222222222222222222222222222222222222"
    }
  })
);
assert.equal(wrongWallet.valid, false);
assert.ok(wrongWallet.reasons.includes("signing.walletAddress must match approved controller wallet"));
assert.ok(wrongWallet.reasons.includes("signing.walletAddress must match signedPolicy.controller"));

const missingRuntimeGuard = await buildControllerSigningExecutionEvidenceReport(
  evidence({
    ceremony: {
      env: {
        ALLOW_PRODUCTION: "1",
        ALLOW_POLICY_PATH: "ops/signed-policy.local.json"
      }
    }
  })
);
assert.equal(missingRuntimeGuard.valid, false);
assert.ok(missingRuntimeGuard.reasons.includes("ceremony: runtime.agent_intent_required: Set ALLOW_REQUIRE_AGENT_SIGNATURE=1 for production runtime"));

const committedPolicy = await buildControllerSigningExecutionEvidenceReport(
  evidence({
    storage: {
      ...evidence().storage,
      repoCommitted: true
    }
  })
);
assert.equal(committedPolicy.valid, false);
assert.ok(committedPolicy.reasons.includes("storage.repoCommitted must be false"));

const secretNote = await buildControllerSigningExecutionEvidenceReport(
  evidence({
    notes: ["api_key=abc123"]
  })
);
assert.equal(secretNote.valid, false);
assert.ok(secretNote.reasons.includes("Controller signing evidence must not include API keys, secrets, or passwords"));

const localCli = await buildControllerSigningExecutionEvidenceReport(
  evidence({
    signing: {
      ...evidence().signing,
      method: "local_dev_cli"
    }
  })
);
assert.equal(localCli.valid, true);
assert.ok(localCli.warnings.includes("local_dev_cli signing is acceptable only for local smoke; prefer wallet UI, hardware wallet, or Safe for production"));

console.log("controllerSigningExecutionEvidence tests passed");
