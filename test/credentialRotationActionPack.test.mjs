import assert from "node:assert/strict";
import { buildCredentialRotationActionPack } from "../src/credentialRotationActionPack.mjs";

const openIncident = {
  incidentId: "credential-exposure-2026-06-09",
  reportedAt: "2026-06-09T12:50:00.000Z",
  reportedBy: "project-owner",
  source: "chat_message",
  responseOwner: "project-owner",
  noRawSecretValuesStored: true,
  ownerNotified: true,
  exposures: [
    {
      type: "wallet_private_key",
      label: "Base wallet funding key",
      compromised: true,
      secretMaterialStored: false,
      contained: {
        rotationRequired: true,
        fundsMovedToFreshWallet: false,
        oldWalletNoLongerUsed: false,
        replacementStoredOutsideRepo: false
      },
      proof: {
        ref: "",
        capturedAt: "",
        redacted: false
      }
    },
    {
      type: "x_bearer_token",
      label: "X account bearer token",
      compromised: true,
      secretMaterialStored: false,
      contained: {
        rotationRequired: true,
        tokenRevoked: false,
        replacementStoredOutsideRepo: false
      },
      proof: {
        ref: "",
        capturedAt: "",
        redacted: false
      }
    }
  ],
  externalActions: {
    moveFunds: false,
    revokeToken: false,
    postToX: false,
    deployContracts: false
  }
};

const pack = buildCredentialRotationActionPack(openIncident, {
  generatedAt: "2026-06-09T13:40:00.000Z"
});

assert.equal(pack.valid, true);
assert.equal(pack.status, "ready_for_owner_rotation");
assert.equal(pack.incidentStatus, "needs_owner_rotation");
assert.equal(pack.unresolvedCount, 2);
assert.equal(pack.actions.length, 3);
assert.deepEqual(pack.actions.map((action) => action.actionType), [
  "wallet_funds_move",
  "wallet_retirement",
  "x_token_revocation"
]);
assert.equal(pack.actions.every((action) => action.executionMode === "owner_only"), true);
assert.equal(pack.actions[0].incidentUpdate.contained.fundsMovedToFreshWallet, true);
assert.equal(pack.actions[2].incidentUpdate.contained.tokenRevoked, true);
assert.equal(pack.evidenceBoundary.movesFunds, false);
assert.equal(pack.evidenceBoundary.revokesTokens, false);
assert.equal(pack.evidenceBoundary.postsContent, false);
assert.equal(pack.evidenceBoundary.storesSecrets, false);
assert.ok(pack.postRotationCommands.includes("npm run secret-exposure-response"));

const contained = buildCredentialRotationActionPack({
  ...openIncident,
  exposures: [
    {
      ...openIncident.exposures[0],
      contained: {
        rotationRequired: true,
        fundsMovedToFreshWallet: true,
        oldWalletNoLongerUsed: true,
        replacementStoredOutsideRepo: true
      },
      proof: {
        ref: "redacted-wallet-transfer-proof",
        capturedAt: "2026-06-09T13:05:00.000Z",
        redacted: true
      }
    },
    {
      ...openIncident.exposures[1],
      contained: {
        rotationRequired: true,
        tokenRevoked: true,
        replacementStoredOutsideRepo: true
      },
      proof: {
        ref: "redacted-x-token-revocation-proof",
        capturedAt: "2026-06-09T13:10:00.000Z",
        redacted: true
      }
    }
  ]
});

assert.equal(contained.valid, true);
assert.equal(contained.status, "no_rotation_needed");
assert.equal(contained.actions.length, 0);

const unsafe = buildCredentialRotationActionPack({
  ...openIncident,
  bearerToken: "sk-live-not-a-real-token"
});

assert.equal(unsafe.valid, false);
assert.equal(unsafe.status, "unsafe_secret_material");
assert.equal(unsafe.actions.length, 0);
assert.ok(unsafe.reasons.some((reason) => reason.includes("raw secret-like material")));

const missing = buildCredentialRotationActionPack(null);

assert.equal(missing.valid, false);
assert.equal(missing.status, "needs_incident_record");

console.log("credentialRotationActionPack tests passed");
