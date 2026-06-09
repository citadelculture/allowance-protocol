import assert from "node:assert/strict";
import {
  buildRegistryLifecycleIntent,
  registryLifecycleIntentHash
} from "../src/registryLifecycleIntent.mjs";
import { merchantIdToRegistryBytes32 } from "../src/registryPolicyIntent.mjs";

const policyId = `0x${"11".repeat(32)}`;
const contractAddress = "0x1234567890123456789012345678901234567890";
const controller = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";

const baseOptions = {
  contractAddress,
  chainId: 84532,
  network: "Base Sepolia",
  environment: "testnet",
  controller,
  requireDeployedRegistry: true
};

const deactivate = buildRegistryLifecycleIntent(
  {
    action: "set_policy_active",
    policyId,
    active: false
  },
  baseOptions
);
assert.equal(deactivate.valid, true);
assert.equal(deactivate.status, "ready_for_external_approval");
assert.equal(deactivate.safety.broadcast, false);
assert.equal(deactivate.safety.approvalActionType, "registry_lifecycle_update");
assert.equal(deactivate.registry.functionName, "setPolicyActive");
assert.deepEqual(deactivate.registry.args, { policyId, active: false });
assert.ok(deactivate.registry.calldata.startsWith("0x"));
assert.match(deactivate.registry.writeIntentHash, /^0x[0-9a-f]{64}$/);

const allowMerchant = buildRegistryLifecycleIntent(
  {
    action: "set_merchant_allowed",
    policyId,
    merchantId: "research_api",
    allowed: true
  },
  baseOptions
);
assert.equal(allowMerchant.valid, true);
assert.equal(allowMerchant.registry.functionName, "setMerchantAllowed");
assert.deepEqual(allowMerchant.registry.args, {
  policyId,
  merchantId: merchantIdToRegistryBytes32("research_api"),
  allowed: true
});
assert.ok(
  allowMerchant.warnings.includes(
    "Derived registry merchantId from offchain merchantId; createPolicy must use the same allow-merchant:v1 namespace"
  )
);

const repeated = buildRegistryLifecycleIntent(
  {
    action: "set_policy_active",
    policyId,
    active: false
  },
  baseOptions
);
assert.equal(repeated.registry.calldata, deactivate.registry.calldata);
assert.equal(repeated.registry.writeIntentHash, deactivate.registry.writeIntentHash);

const zeroPolicy = buildRegistryLifecycleIntent(
  {
    action: "set_policy_active",
    policyId: `0x${"0".repeat(64)}`,
    active: false
  },
  baseOptions
);
assert.equal(zeroPolicy.valid, false);
assert.ok(zeroPolicy.reasons.includes("policyId must not be zero"));
assert.equal(zeroPolicy.registry.calldata, null);

const missingAllowed = buildRegistryLifecycleIntent(
  {
    action: "set_merchant_allowed",
    policyId,
    merchantId: "research_api"
  },
  baseOptions
);
assert.equal(missingAllowed.valid, false);
assert.ok(missingAllowed.reasons.includes("allowed must be true or false"));
assert.equal(missingAllowed.registry.calldata, null);

const invalidAction = buildRegistryLifecycleIntent(
  {
    action: "delete_policy",
    policyId,
    active: false
  },
  baseOptions
);
assert.equal(invalidAction.valid, false);
assert.ok(invalidAction.reasons.includes("Invalid registry lifecycle action"));

const secretField = buildRegistryLifecycleIntent(
  {
    action: "set_policy_active",
    policyId,
    active: true,
    controllerPrivateKey: "0x0000000000000000000000000000000000000000000000000000000000000001"
  },
  baseOptions
);
assert.equal(secretField.valid, false);
assert.ok(secretField.reasons.some((reason) => reason.includes("controllerPrivateKey")));
assert.equal(secretField.registry.calldata, null);

assert.equal(registryLifecycleIntentHash({ a: 1 }), registryLifecycleIntentHash({ a: 1 }));

console.log("registryLifecycleIntent tests passed");
