import assert from "node:assert/strict";
import { buildSecretExposureResponseReport } from "../src/secretExposureResponse.mjs";

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

const open = buildSecretExposureResponseReport(openIncident);
assert.equal(open.valid, false);
assert.equal(open.status, "needs_owner_rotation");
assert.equal(open.unresolvedCount, 2);
assert.ok(open.reasons.includes("exposures[0].contained.fundsMovedToFreshWallet must be true"));
assert.ok(open.reasons.includes("exposures[1].contained.tokenRevoked must be true"));
assert.equal(open.evidenceBoundary.movesFunds, false);
assert.equal(open.evidenceBoundary.revokesTokens, false);

const contained = buildSecretExposureResponseReport({
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
assert.equal(contained.status, "contained");
assert.equal(contained.containedCount, 2);

const unsafe = buildSecretExposureResponseReport({
  ...openIncident,
  privateKey: "0x1111111111111111111111111111111111111111111111111111111111111111"
});

assert.equal(unsafe.valid, false);
assert.equal(unsafe.status, "unsafe_secret_material");
assert.ok(unsafe.reasons.some((reason) => reason.includes("privateKey")));

console.log("secretExposureResponse tests passed");
