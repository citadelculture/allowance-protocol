import { buildSecretExposureResponseReport } from "./secretExposureResponse.mjs";

export const CREDENTIAL_ROTATION_ACTION_PACK_STATUSES = [
  "ready_for_owner_rotation",
  "no_rotation_needed",
  "unsafe_secret_material",
  "needs_incident_record"
];

export const CREDENTIAL_ROTATION_ACTION_TYPES = [
  "wallet_funds_move",
  "wallet_retirement",
  "x_token_revocation",
  "api_token_revocation",
  "secret_rotation"
];

export function buildCredentialRotationActionPack(incident = {}, options = {}) {
  const generatedAt = options.generatedAt || new Date().toISOString();
  const incidentReport = buildSecretExposureResponseReport(incident, {
    generatedAt,
    sourceErrors: options.sourceErrors || []
  });
  const incidentRecordReady = incidentHasMinimumShape(incident);
  const actions = incidentReport.status === "needs_owner_rotation"
    ? unresolvedActions(incidentReport.exposures)
    : [];
  const status = statusFor({
    incidentReport,
    incidentRecordReady,
    actions
  });
  const reasons = [];

  if (status === "unsafe_secret_material") {
    reasons.push("Incident record contains raw secret-like material; remove it before preparing an owner action pack");
  }
  if (status === "needs_incident_record") {
    reasons.push("Create a redacted incident record with incidentId, reportedAt, owner notification, and exposure records");
  }

  return {
    generatedAt,
    valid: status === "ready_for_owner_rotation" || status === "no_rotation_needed",
    status,
    incidentId: incidentReport.incidentId,
    incidentStatus: incidentReport.status,
    exposureCount: incidentReport.exposureCount || 0,
    unresolvedCount: incidentReport.unresolvedCount || 0,
    actions,
    incidentBlockers: incidentReport.reasons || [],
    reasons: unique(reasons),
    warnings: incidentReport.warnings || [],
    postRotationCommands: [
      "npm run secret-exposure-response",
      "npm run live-resource-handoff",
      "npm run readiness",
      "npm run operate"
    ],
    nextAction: nextActionFor(status),
    evidenceBoundary: boundary()
  };
}

export function publicCredentialRotationActionPack(report = {}) {
  return {
    ...report,
    secretFindings: undefined
  };
}

function unresolvedActions(exposures = []) {
  return exposures
    .filter((exposure) => !exposure.contained)
    .flatMap((exposure, index) => actionsForExposure(exposure, index));
}

function actionsForExposure(exposure, index) {
  if (exposure.type === "wallet_private_key" || exposure.type === "seed_phrase") {
    return [
      {
        actionId: `wallet_move_funds_${index + 1}`,
        actionType: "wallet_funds_move",
        status: "owner_action_required",
        executionMode: "owner_only",
        title: `Move funds out of ${exposure.label || "exposed wallet"}`,
        steps: [
          "Create or choose a fresh wallet controlled outside this repository.",
          "Transfer all funds from the exposed wallet to the fresh wallet using your wallet app.",
          "Do not paste private keys, seed phrases, signed payloads, transaction hashes with sensitive notes, or wallet screenshots containing secrets into chat or repo files.",
          "Record only a redacted proof reference after the transfer is complete."
        ],
        incidentUpdate: {
          contained: {
            fundsMovedToFreshWallet: true,
            oldWalletNoLongerUsed: true,
            replacementStoredOutsideRepo: true
          },
          proof: {
            ref: "redacted-wallet-transfer-proof",
            capturedAt: "ISO-8601 timestamp",
            redacted: true
          }
        }
      },
      {
        actionId: `wallet_retire_${index + 1}`,
        actionType: "wallet_retirement",
        status: "owner_action_required",
        executionMode: "owner_only",
        title: `Retire ${exposure.label || "exposed wallet"} from Allow Protocol`,
        steps: [
          "Remove the exposed wallet from future Allow Protocol handoff manifests.",
          "Replace it with only the fresh public wallet address and public readiness fields.",
          "Keep replacement wallet secrets in a local wallet or secret manager, outside this repository."
        ],
        incidentUpdate: {
          contained: {
            oldWalletNoLongerUsed: true,
            replacementStoredOutsideRepo: true
          }
        }
      }
    ];
  }

  if (exposure.type === "x_bearer_token") {
    return [
      {
        actionId: `x_token_revoke_${index + 1}`,
        actionType: "x_token_revocation",
        status: "owner_action_required",
        executionMode: "owner_only",
        title: `Revoke ${exposure.label || "exposed X token"}`,
        steps: [
          "Open the X developer portal as the account owner.",
          "Revoke or regenerate the exposed bearer token.",
          "Store any replacement token only in a local secret manager or deployment provider.",
          "Do not paste replacement tokens into chat, repo files, approval packets, or execution evidence.",
          "Record only a redacted revocation proof reference after the token is revoked."
        ],
        incidentUpdate: {
          contained: {
            tokenRevoked: true,
            replacementStoredOutsideRepo: true
          },
          proof: {
            ref: "redacted-x-token-revocation-proof",
            capturedAt: "ISO-8601 timestamp",
            redacted: true
          }
        }
      }
    ];
  }

  if (exposure.type === "api_token") {
    return [
      {
        actionId: `api_token_revoke_${index + 1}`,
        actionType: "api_token_revocation",
        status: "owner_action_required",
        executionMode: "owner_only",
        title: `Revoke ${exposure.label || "exposed API token"}`,
        steps: [
          "Open the provider console as the account owner.",
          "Revoke or regenerate the exposed API token.",
          "Store any replacement token only in a local secret manager or deployment provider.",
          "Record only a redacted revocation proof reference after the token is revoked."
        ],
        incidentUpdate: {
          contained: {
            tokenRevoked: true,
            replacementStoredOutsideRepo: true
          },
          proof: {
            ref: "redacted-api-token-revocation-proof",
            capturedAt: "ISO-8601 timestamp",
            redacted: true
          }
        }
      }
    ];
  }

  return [
    {
      actionId: `secret_rotate_${index + 1}`,
      actionType: "secret_rotation",
      status: "owner_action_required",
      executionMode: "owner_only",
      title: `Rotate ${exposure.label || "exposed secret"}`,
      steps: [
        "Revoke, rotate, or replace the exposed secret in the owning provider.",
        "Store the replacement outside this repository.",
        "Record only a redacted proof reference after rotation is complete."
      ],
      incidentUpdate: {
        contained: {
          revokedOrRotated: true,
          replacementStoredOutsideRepo: true
        },
        proof: {
          ref: "redacted-secret-rotation-proof",
          capturedAt: "ISO-8601 timestamp",
          redacted: true
        }
      }
    }
  ];
}

function statusFor({ incidentReport, incidentRecordReady, actions }) {
  if (incidentReport.status === "unsafe_secret_material") return "unsafe_secret_material";
  if (!incidentRecordReady || incidentReport.status === "needs_incident_record") return "needs_incident_record";
  if (incidentReport.valid) return "no_rotation_needed";
  if (actions.length > 0) return "ready_for_owner_rotation";
  return "needs_incident_record";
}

function incidentHasMinimumShape(incident) {
  return Boolean(
    incident &&
    typeof incident === "object" &&
    !Array.isArray(incident) &&
    String(incident.incidentId || "").trim() &&
    String(incident.reportedAt || "").trim() &&
    incident.noRawSecretValuesStored === true &&
    incident.ownerNotified === true &&
    Array.isArray(incident.exposures) &&
    incident.exposures.length > 0
  );
}

function nextActionFor(status) {
  const actions = {
    ready_for_owner_rotation: "Owner completes each rotation action, updates only redacted incident proof fields, then reruns the post-rotation commands.",
    no_rotation_needed: "Incident is contained; rerun live-resource handoff and readiness before preparing any live approval.",
    unsafe_secret_material: "Remove raw secret-like material from the incident record before continuing.",
    needs_incident_record: "Create or repair the redacted incident record before preparing owner rotation steps."
  };
  return actions[status] || actions.needs_incident_record;
}

function boundary() {
  return {
    readsIncidentMetadata: true,
    readsPrivateKeys: false,
    readsSeedPhrases: false,
    readsApiSecrets: false,
    writesFiles: false,
    revokesTokens: false,
    movesFunds: false,
    postsContent: false,
    sendsOutreach: false,
    signsWalletPayloads: false,
    deploysContracts: false,
    startsPilotTraffic: false,
    storesSecrets: false,
    updatesCanonicalState: false,
    approvesExternalAction: false,
    enablesToken: false,
    requiresOwnerAction: true
  };
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
