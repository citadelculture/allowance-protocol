import assert from "node:assert/strict";
import { DEFAULT_POLICY } from "../src/policyEngine.mjs";
import { productionPolicyRequirements, verifyProductionPolicy } from "../src/policyAudit.mjs";
import { EIP712_FIXTURE_CONTROLLER, productionFixturePolicy } from "../src/productionFixture.mjs";

const validFixture = await verifyProductionPolicy(productionFixturePolicy());
assert.equal(validFixture.valid, true);
assert.equal(validFixture.controller, EIP712_FIXTURE_CONTROLLER);
assert.equal(validFixture.recoveredController, EIP712_FIXTURE_CONTROLLER);
assert.equal(validFixture.signatureMode, "eip712");
assert.deepEqual(validFixture.reasons, []);

const demoPolicy = await verifyProductionPolicy(DEFAULT_POLICY);
assert.equal(demoPolicy.valid, false);
assert.ok(demoPolicy.reasons.includes("Production policy must use signatureMode=eip712"));
assert.ok(demoPolicy.reasons.includes("Production policy controller must be a 20-byte EVM address"));
assert.ok(demoPolicy.reasons.includes("Demo policy signatures are disabled in production"));

const tamperedPolicy = await verifyProductionPolicy(productionFixturePolicy({ perTxCapUsd: 2 }));
assert.equal(tamperedPolicy.valid, false);
assert.ok(tamperedPolicy.reasons.includes("Recovered controller does not match policy controller"));

assert.deepEqual(productionPolicyRequirements({}), [
  "Production policy must use signatureMode=eip712",
  "Production policy must set requireSignedPolicy=true",
  "Production policy must require intent nonces",
  "Production policy must require receipts",
  "Production policy controller must be a 20-byte EVM address",
  "Production policy must set a positive dailyCapUsd",
  "Production policy must set a positive perTxCapUsd"
]);

console.log("policyAudit tests passed");
