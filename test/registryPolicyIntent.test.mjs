import assert from "node:assert/strict";
import {
  buildRegistryPolicyIntent,
  computeRegistryPolicyId,
  merchantIdToRegistryBytes32,
  registryPolicyIntentHash
} from "../src/registryPolicyIntent.mjs";

const controller = "0x1111111111111111111111111111111111111111";
const agentAddress = "0x2222222222222222222222222222222222222222";
const settlementToken = "0x3333333333333333333333333333333333333333";
const contractAddress = "0x1234567890123456789012345678901234567890";
const controllerNonce = `0x${"44".repeat(32)}`;

const policy = {
  policyId: "allow_policy_live_001",
  agentId: "agent-alpha",
  agentAddress,
  controller,
  chainId: 84532,
  chain: "Base Sepolia",
  settlementTokenAddress: settlementToken,
  dailyCapUsd: 25,
  perTxCapUsd: 1.5,
  allowedMerchants: ["mcp_search", "research_api"],
  requireReceipt: true,
  requireIntentNonce: true
};

const options = {
  contractAddress,
  chainId: 84532,
  network: "Base Sepolia",
  environment: "testnet",
  controllerNonce,
  amountDecimals: 6,
  requireDeployedRegistry: true
};

const valid = buildRegistryPolicyIntent(policy, options);
assert.equal(valid.valid, true);
assert.equal(valid.status, "ready_for_external_approval");
assert.equal(valid.mode, "dry_run");
assert.equal(valid.safety.broadcast, false);
assert.equal(valid.safety.signsTransaction, false);
assert.equal(valid.safety.approvalActionType, "registry_policy_create");
assert.equal(valid.registry.args.agent, agentAddress.toLowerCase());
assert.equal(valid.registry.args.settlementToken, settlementToken.toLowerCase());
assert.equal(valid.registry.args.epochCap, "25000000");
assert.equal(valid.registry.args.perTxCap, "1500000");
assert.equal(valid.registry.args.epochSeconds, "86400");
assert.equal(valid.registry.args.controllerNonce, controllerNonce);
assert.deepEqual(valid.registry.args.merchantIds, [
  merchantIdToRegistryBytes32("mcp_search"),
  merchantIdToRegistryBytes32("research_api")
]);
assert.ok(valid.registry.calldata.startsWith("0x"));
assert.match(valid.registry.expectedPolicyId, /^0x[0-9a-f]{64}$/);
assert.match(valid.registry.writeIntentHash, /^0x[0-9a-f]{64}$/);

const expectedPolicyId = computeRegistryPolicyId({
  controller,
  agent: agentAddress,
  settlementToken,
  epochCap: valid.registry.args.epochCap,
  perTxCap: valid.registry.args.perTxCap,
  epochSeconds: valid.registry.args.epochSeconds,
  chainId: 84532,
  controllerNonce
});
assert.equal(valid.registry.expectedPolicyId, expectedPolicyId);

const repeated = buildRegistryPolicyIntent(policy, options);
assert.equal(repeated.registry.calldata, valid.registry.calldata);
assert.equal(repeated.registry.writeIntentHash, valid.registry.writeIntentHash);

const missingController = buildRegistryPolicyIntent(
  {
    ...policy,
    controller: "0xController"
  },
  options
);
assert.equal(missingController.valid, false);
assert.ok(missingController.reasons.includes("Controller must be a 20-byte EVM address"));
assert.equal(missingController.registry.calldata, null);

const zeroNonce = buildRegistryPolicyIntent(policy, {
  ...options,
  controllerNonce: `0x${"0".repeat(64)}`
});
assert.equal(zeroNonce.valid, false);
assert.ok(zeroNonce.reasons.includes("controllerNonce must not be zero"));
assert.equal(zeroNonce.registry.calldata, null);

const perTxAboveEpoch = buildRegistryPolicyIntent(
  {
    ...policy,
    dailyCapUsd: 1,
    perTxCapUsd: 2
  },
  options
);
assert.equal(perTxAboveEpoch.valid, false);
assert.ok(perTxAboveEpoch.reasons.includes("perTxCap must not exceed epochCap"));

const emptyMerchants = buildRegistryPolicyIntent(
  {
    ...policy,
    allowedMerchants: []
  },
  options
);
assert.equal(emptyMerchants.valid, false);
assert.ok(emptyMerchants.reasons.includes("At least one allowed merchant is required for registry policy creation"));

const secretField = buildRegistryPolicyIntent(
  {
    ...policy,
    controllerPrivateKey: "0x0000000000000000000000000000000000000000000000000000000000000001"
  },
  options
);
assert.equal(secretField.valid, false);
assert.ok(secretField.reasons.some((reason) => reason.includes("controllerPrivateKey")));

assert.equal(registryPolicyIntentHash({ a: 1 }), registryPolicyIntentHash({ a: 1 }));

console.log("registryPolicyIntent tests passed");
