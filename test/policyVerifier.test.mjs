import assert from "node:assert/strict";
import {
  DEFAULT_POLICY,
  evaluatePaymentIntent,
  evaluatePaymentIntentAsync,
  policyFingerprint
} from "../src/policyEngine.mjs";
import {
  buildPolicyTypedData,
  demoPolicySignature,
  recoverControllerWithViem,
  verifyPolicySignatureAsync,
  verifyPolicySignature
} from "../src/policyVerifier.mjs";
import {
  EIP712_FIXTURE_CONTROLLER,
  EIP712_FIXTURE_SIGNATURE,
  productionFixturePolicy
} from "../src/productionFixture.mjs";

const policy = { ...DEFAULT_POLICY, spentTodayUsd: 0 };
const fingerprint = policyFingerprint(policy);

assert.equal(fingerprint, "10cee07e");
assert.equal(demoPolicySignature(fingerprint), policy.controllerSignature);

const typedData = buildPolicyTypedData(policy, fingerprint);
assert.equal(typedData.domain.name, "Allow Protocol");
assert.equal(typedData.primaryType, "AllowPolicy");
assert.equal(typedData.message.policyId, policy.policyId);
assert.equal(typedData.message.policyFingerprint, "0x0000000000000000000000000000000000000000000000000000000010cee07e");

const demoVerification = verifyPolicySignature(policy, fingerprint);
assert.equal(demoVerification.valid, true);
assert.equal(demoVerification.mode, "demo");
assert.ok(demoVerification.warnings[0].includes("Demo policy signature"));

const productionDemo = evaluatePaymentIntent(
  {
    merchantId: "mcp_search",
    amountUsd: 0.018,
    resource: "/v1/search",
    intentNonce: "prod-demo-001",
    metadata: "public"
  },
  {
    ...policy,
    production: true
  },
  []
);

assert.equal(productionDemo.decision, "deny");
assert.ok(productionDemo.reasons.includes("Demo policy signatures are disabled in production"));

const asyncProductionDemo = await evaluatePaymentIntentAsync(
  {
    merchantId: "mcp_search",
    amountUsd: 0.018,
    resource: "/v1/search",
    intentNonce: "prod-demo-async-001",
    metadata: "public"
  },
  {
    ...policy,
    production: true
  },
  [],
  {
    policyVerifier: {
      mode: "eip712",
      production: true
    }
  }
);

assert.equal(asyncProductionDemo.decision, "deny");
assert.ok(asyncProductionDemo.reasons.includes("Demo policy signatures are disabled in production"));

const invalidDemo = evaluatePaymentIntent(
  {
    merchantId: "mcp_search",
    amountUsd: 0.018,
    resource: "/v1/search",
    intentNonce: "invalid-demo-001",
    metadata: "public"
  },
  {
    ...policy,
    controllerSignature: "sig_demo_wrong"
  },
  []
);

assert.equal(invalidDemo.decision, "deny");
assert.ok(invalidDemo.reasons.includes("Invalid demo policy signature for policy fingerprint"));

const eip712Policy = {
  ...policy,
  signatureMode: "eip712",
  controllerSignature: "0xsigned"
};

const eip712Allowed = evaluatePaymentIntent(
  {
    merchantId: "mcp_search",
    amountUsd: 0.018,
    resource: "/v1/search",
    intentNonce: "eip712-allow-001",
    metadata: "public"
  },
  eip712Policy,
  [],
  {
    policyVerifier: {
      mode: "eip712",
      recoverController: ({ typedData }) => typedData.message.controller
    }
  }
);

assert.equal(eip712Allowed.decision, "allow");
assert.equal(eip712Allowed.receipt.policySignatureMode, "eip712");

const eip712Denied = evaluatePaymentIntent(
  {
    merchantId: "mcp_search",
    amountUsd: 0.018,
    resource: "/v1/search",
    intentNonce: "eip712-deny-001",
    metadata: "public"
  },
  eip712Policy,
  [],
  {
    policyVerifier: {
      mode: "eip712",
      recoverController: () => "0xDifferentController"
    }
  }
);

assert.equal(eip712Denied.decision, "deny");
assert.ok(eip712Denied.reasons.includes("Recovered controller does not match policy controller"));

const missingRecovery = verifyPolicySignature(eip712Policy, policyFingerprint(eip712Policy), { mode: "eip712" });
assert.equal(missingRecovery.valid, false);
assert.ok(missingRecovery.reasons.includes("Missing EIP-712 controller recovery function"));

const malformed = await verifyPolicySignatureAsync(
  {
    ...eip712Policy,
    controllerSignature: "0x1234"
  },
  policyFingerprint(eip712Policy),
  { mode: "eip712", production: true }
);

assert.equal(malformed.valid, false);
assert.ok(malformed.reasons[0].startsWith("EIP-712 signature recovery failed:"));

const fixturePolicy = productionFixturePolicy({ spentTodayUsd: 0 });

assert.equal(fixturePolicy.controller, EIP712_FIXTURE_CONTROLLER);
assert.equal(fixturePolicy.controllerSignature, EIP712_FIXTURE_SIGNATURE);

const fixtureFingerprint = policyFingerprint(fixturePolicy);
assert.equal(fixtureFingerprint, "3deb3ebb");

const fixtureTypedData = buildPolicyTypedData(fixturePolicy, fixtureFingerprint);
const recovered = await recoverControllerWithViem({
  typedData: fixtureTypedData,
  signature: fixturePolicy.controllerSignature
});

assert.equal(recovered, fixturePolicy.controller);

const asyncVerification = await verifyPolicySignatureAsync(fixturePolicy, fixtureFingerprint, {
  mode: "eip712",
  production: true
});

assert.equal(asyncVerification.valid, true);
assert.equal(asyncVerification.recoveredController, fixturePolicy.controller);

const asyncAllowed = await evaluatePaymentIntentAsync(
  {
    merchantId: "mcp_search",
    amountUsd: 0.018,
    resource: "/v1/search",
    intentNonce: "viem-fixture-001",
    metadata: "public"
  },
  fixturePolicy,
  [],
  {
    policyVerifier: {
      mode: "eip712",
      production: true
    }
  }
);

assert.equal(asyncAllowed.decision, "allow");
assert.equal(asyncAllowed.receipt.policySignatureMode, "eip712");

const tamperedPolicy = {
  ...fixturePolicy,
  controller: "0x0000000000000000000000000000000000000001"
};

const asyncDenied = await evaluatePaymentIntentAsync(
  {
    merchantId: "mcp_search",
    amountUsd: 0.018,
    resource: "/v1/search",
    intentNonce: "viem-fixture-002",
    metadata: "public"
  },
  tamperedPolicy,
  [],
  {
    policyVerifier: {
      mode: "eip712",
      production: true
    }
  }
);

assert.equal(asyncDenied.decision, "deny");
assert.ok(asyncDenied.reasons.includes("Recovered controller does not match policy controller"));

console.log("policyVerifier tests passed");
