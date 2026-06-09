import assert from "node:assert/strict";
import { buildLiveResourceHandoffReport } from "../src/liveResourceHandoff.mjs";

const validManifest = {
  manifestId: "allow-live-resource-handoff-001",
  generatedAt: "2026-06-09",
  owner: "dom",
  wallet: {
    address: "0x1111111111111111111111111111111111111111",
    chain: "Base",
    network: "base_mainnet",
    declaredFundingUsd: 100,
    maxSingleActionUsd: 10,
    userControlled: true,
    noPrivateKeyShared: true,
    seedPhraseShared: false,
    privateKeyStoredInRepo: false,
    actionTimeApprovalRequired: true
  },
  xAccount: {
    handle: "allow_protocol",
    apiAccessReady: true,
    credentialsStoredOutsideRepo: true,
    noApiSecretsStored: true,
    postingRequiresApproval: true,
    automationDisabledUntilApproval: true
  },
  website: {
    status: "ready",
    url: "https://allow.example",
    userCanPublish: true,
    publishRequiresApproval: true,
    noSecretEnvInRepo: true
  }
};

const report = buildLiveResourceHandoffReport(validManifest, {
  generatedAt: "2026-06-09T12:10:00.000Z"
});

assert.equal(report.valid, true);
assert.equal(report.status, "ready_for_action_time_approval");
assert.equal(report.resources.wallet.ready, true);
assert.equal(report.resources.xAccount.handle, "@allow_protocol");
assert.equal(report.readyFor.firstPublicPostApproval, true);
assert.equal(report.readyFor.livePilotApproval, true);
assert.equal(report.evidenceBoundary.readsPrivateKeys, false);
assert.equal(report.evidenceBoundary.postsContent, false);
assert.equal(report.evidenceBoundary.movesFunds, false);

const missing = buildLiveResourceHandoffReport({
  ...validManifest,
  wallet: {
    ...validManifest.wallet,
    address: ""
  },
  xAccount: {
    ...validManifest.xAccount,
    apiAccessReady: false
  },
  website: {
    status: "offered",
    url: "",
    userCanPublish: true,
    publishRequiresApproval: true,
    noSecretEnvInRepo: true
  }
});

assert.equal(missing.valid, false);
assert.equal(missing.status, "needs_resource_handoff");
assert.ok(missing.reasons.includes("Missing wallet.address"));
assert.ok(missing.reasons.includes("xAccount.apiAccessReady must be true"));
assert.ok(missing.warnings.includes("website is offered but no URL is configured yet"));

const secret = buildLiveResourceHandoffReport({
  ...validManifest,
  xAccount: {
    ...validManifest.xAccount,
    accessToken: "sk-live-not-a-real-token"
  }
});

assert.equal(secret.valid, false);
assert.equal(secret.status, "unsafe_secret_exposure");
assert.ok(secret.reasons.some((reason) => reason.includes("xAccount.accessToken")));

const highBudget = buildLiveResourceHandoffReport({
  ...validManifest,
  wallet: {
    ...validManifest.wallet,
    declaredFundingUsd: 250,
    maxSingleActionUsd: 50
  }
});

assert.equal(highBudget.valid, true);
assert.ok(highBudget.warnings.some((warning) => warning.includes("$100 launch budget")));
assert.ok(highBudget.warnings.some((warning) => warning.includes("first live pilots")));

console.log("liveResourceHandoff tests passed");
