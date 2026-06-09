import assert from "node:assert/strict";
import { buildCredentialRotationActionPack } from "../src/credentialRotationActionPack.mjs";
import {
  buildCredentialRotationHandoff,
  publicCredentialRotationHandoffReport
} from "../src/credentialRotationHandoff.mjs";

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

const actionPack = buildCredentialRotationActionPack(openIncident, {
  generatedAt: "2026-06-09T17:45:00.000Z"
});
const handoff = buildCredentialRotationHandoff(
  {
    actionPack,
    paths: {
      incident: "ops/secret_exposure_incident.template.json"
    }
  },
  {
    generatedAt: "2026-06-09T17:46:00.000Z"
  }
);

assert.equal(handoff.valid, true);
assert.equal(handoff.status, "ready_for_owner_rotation");
assert.equal(handoff.incidentId, "credential-exposure-2026-06-09");
assert.equal(handoff.actionPack.actionCount, 3);
assert.equal(handoff.actions.every((action) => action.executionMode === "owner_only"), true);
assert.equal(handoff.blockers.length, 0);
assert.ok(handoff.incidentGaps.some((gap) => gap.includes("fundsMovedToFreshWallet")));
assert.ok(handoff.commands.validateIncident.includes("secret-exposure-response"));
assert.ok(handoff.commands.actionPack.includes("credential-rotation-action-pack"));
assert.ok(handoff.markdown.includes("## Owner Actions"));
assert.ok(handoff.markdown.includes("redacted incident update"));
assert.equal(handoff.evidenceBoundary.movesFunds, false);
assert.equal(handoff.evidenceBoundary.revokesTokens, false);
assert.equal(handoff.evidenceBoundary.storesReplacementCredentials, false);

const containedActionPack = buildCredentialRotationActionPack({
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
        capturedAt: "2026-06-09T17:00:00.000Z",
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
        capturedAt: "2026-06-09T17:05:00.000Z",
        redacted: true
      }
    }
  ]
});
const contained = buildCredentialRotationHandoff({ actionPack: containedActionPack });

assert.equal(contained.status, "rotation_contained");
assert.equal(contained.actions.length, 0);
assert.equal(contained.incidentGaps.length, 0);
assert.ok(contained.nextAction.includes("live-resource handoff"));

const unsafe = buildCredentialRotationHandoff({
  actionPack: buildCredentialRotationActionPack({
    ...openIncident,
    bearerToken: "sk-live-not-a-real-token"
  })
});

assert.equal(unsafe.status, "blocked_by_incident_record");
assert.ok(unsafe.blockers.some((blocker) => blocker.includes("raw secret-like material")));
assert.ok(unsafe.nextAction.includes("Remove raw secret-like material"));

const publicReport = publicCredentialRotationHandoffReport(handoff);
assert.equal(publicReport.markdown, undefined);
assert.equal(publicReport.status, "ready_for_owner_rotation");

console.log("credentialRotationHandoff tests passed");
