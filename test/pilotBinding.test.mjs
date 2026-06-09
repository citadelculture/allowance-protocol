import assert from "node:assert/strict";
import { privateKeyToAccount } from "viem/accounts";
import { policyFingerprint } from "../src/policyEngine.mjs";
import { EIP712_FIXTURE_AGENT, productionFixturePolicy } from "../src/productionFixture.mjs";
import {
  buildPilotWalletControlMessage,
  summarizePilotBinding,
  validatePilotBinding,
  validatePolicyDocumentBinding,
  verifyPilotWalletControlSignatureAsync
} from "../src/pilotBinding.mjs";

const fixturePrivateKey = "0x0000000000000000000000000000000000000000000000000000000000000001";
const account = privateKeyToAccount(fixturePrivateKey);
const agentAddress = EIP712_FIXTURE_AGENT;
const policy = productionFixturePolicy({
  policyId: "allow_policy_pilot_alpha",
  agentId: "agent-alpha",
  agentAddress,
  chainId: 84532,
  chain: "Base Sepolia",
  allowedMerchants: ["mcp_search"],
  requireAgentIntentSignature: true,
  requireIntentNonce: true,
  blockPii: true,
  perTxCapUsd: 0.5,
  dailyCapUsd: 5
});

const validBinding = {
  bindingId: "allow-pilot-alpha-binding",
  generatedAt: "2026-06-08",
  pilot: {
    merchantId: "mcp_search",
    environment: "testnet",
    network: "eip155:84532",
    approvalRef: "merchant-email:2026-06-08",
    approvedBy: "merchant-operator",
    approvedAt: "2026-06-08"
  },
  agent: {
    agentId: "agent-alpha",
    walletType: "eoa",
    walletAddress: agentAddress,
    controlEvidenceRef: "wallet-signed-message:2026-06-08",
    controlChallenge: "",
    controlSignature: "",
    approvedBy: "pilot-operator",
    approvedAt: "2026-06-08"
  },
  policy: {
    policyId: policy.policyId,
    policyPath: "ops/signed-policy.local.json",
    policyFingerprint: policyFingerprint(policy),
    requireAgentIntentSignature: true
  },
  runtime: {
    allowProduction: true,
    requireAgentSignature: true,
    allowAgentAddress: agentAddress,
    fixtureEnabled: false,
    agentPrivateKeyExposed: false,
    controllerPrivateKeyExposed: false
  },
  safety: {
    noTradingAuthority: true,
    merchantScoped: true,
    spendCapsReviewed: true,
    metadataPolicyReviewed: true
  }
};

validBinding.agent.controlChallenge = buildPilotWalletControlMessage(validBinding);
validBinding.agent.controlSignature = await account.signMessage({ message: validBinding.agent.controlChallenge });

const valid = validatePilotBinding(validBinding, { policy });
assert.equal(valid.valid, true);
assert.deepEqual(valid.reasons, []);

const walletControl = await verifyPilotWalletControlSignatureAsync(validBinding);
assert.equal(walletControl.valid, true);
assert.equal(walletControl.recoveredSigner, agentAddress);

const summary = summarizePilotBinding(validBinding, { policy });
assert.equal(summary.valid, true);
assert.equal(summary.walletAddress, agentAddress);

const noPolicy = validatePilotBinding(validBinding);
assert.equal(noPolicy.valid, false);
assert.ok(noPolicy.reasons.includes("A signed policy document is required to validate pilot binding"));

const zeroWallet = validatePilotBinding(
  {
    ...validBinding,
    agent: {
      ...validBinding.agent,
      walletAddress: "0x0000000000000000000000000000000000000000"
    }
  },
  { policy }
);
assert.equal(zeroWallet.valid, false);
assert.ok(zeroWallet.reasons.includes("agent.walletAddress must not be the zero address"));

const badChallenge = validatePilotBinding(
  {
    ...validBinding,
    agent: {
      ...validBinding.agent,
      controlChallenge: "different challenge"
    }
  },
  { policy }
);
assert.equal(badChallenge.valid, false);
assert.ok(badChallenge.reasons.includes("agent.controlChallenge must match the pilot binding challenge"));

const fixtureRuntime = validatePilotBinding(
  {
    ...validBinding,
    runtime: {
      ...validBinding.runtime,
      fixtureEnabled: true
    }
  },
  { policy }
);
assert.equal(fixtureRuntime.valid, false);
assert.ok(fixtureRuntime.reasons.includes("runtime.fixtureEnabled must be false for production pilot binding"));

const wrongPolicy = validatePilotBinding(validBinding, {
  policy: {
    ...policy,
    agentAddress: "0x0000000000000000000000000000000000000002",
    requireAgentIntentSignature: false,
    allowedMerchants: ["vector_cloud"]
  }
});
assert.equal(wrongPolicy.valid, false);
assert.ok(wrongPolicy.reasons.includes("Policy document agent address does not match binding wallet"));
assert.ok(wrongPolicy.reasons.includes("Policy document must allow the pilot merchant"));
assert.ok(wrongPolicy.reasons.includes("Policy document must require agent intent signatures"));

const policyChecks = validatePolicyDocumentBinding(validBinding, policy);
assert.equal(policyChecks.valid, true);
assert.equal(policyChecks.policyAgentAddress, agentAddress);

console.log("pilotBinding tests passed");
