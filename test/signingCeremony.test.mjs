import assert from "node:assert/strict";
import { DEFAULT_POLICY } from "../src/policyEngine.mjs";
import { EIP712_FIXTURE_CONTROLLER, productionFixturePolicy } from "../src/productionFixture.mjs";
import { buildSigningCeremonyAudit } from "../src/signingCeremony.mjs";

const valid = await buildSigningCeremonyAudit({
  policy: productionFixturePolicy(),
  expectedController: EIP712_FIXTURE_CONTROLLER,
  env: {
    ALLOW_PRODUCTION: "1",
    ALLOW_REQUIRE_AGENT_SIGNATURE: "1",
    ALLOW_POLICY_PATH: "/secure/signed-policy.json"
  },
  policyPath: "/secure/signed-policy.json"
});

assert.equal(valid.valid, true);
assert.equal(valid.policy.controller, EIP712_FIXTURE_CONTROLLER);
assert.equal(valid.checks.find((check) => check.id === "policy.signature").status, "pass");
assert.equal(valid.checks.find((check) => check.id === "policy.expected_controller").status, "pass");
assert.equal(valid.checks.find((check) => check.id === "runtime.fixture_disabled").status, "pass");
assert.deepEqual(valid.nextActions, []);

const noExpected = await buildSigningCeremonyAudit({
  policy: productionFixturePolicy(),
  env: {
    ALLOW_PRODUCTION: "1",
    ALLOW_REQUIRE_AGENT_SIGNATURE: "1",
    ALLOW_POLICY_PATH: "/secure/signed-policy.json"
  }
});
assert.equal(noExpected.valid, true);
assert.equal(noExpected.checks.find((check) => check.id === "policy.expected_controller").status, "pass");

const warnings = await buildSigningCeremonyAudit({
  policy: productionFixturePolicy(),
  expectedController: EIP712_FIXTURE_CONTROLLER,
  env: {}
});
assert.equal(warnings.valid, true);
assert.equal(warnings.checks.find((check) => check.id === "runtime.production_mode").status, "warning");
assert.equal(warnings.checks.find((check) => check.id === "runtime.policy_source").status, "warning");
assert.equal(warnings.checks.find((check) => check.id === "runtime.agent_intent_required").status, "warning");
assert.ok(warnings.nextActions.includes("Run the smoke with production mode and ALLOW_REQUIRE_AGENT_SIGNATURE=1"));
assert.ok(warnings.nextActions.includes("Set ALLOW_REQUIRE_AGENT_SIGNATURE=1 for production runtime"));

const wrongController = await buildSigningCeremonyAudit({
  policy: productionFixturePolicy(),
  expectedController: "0x0000000000000000000000000000000000000002",
  env: {
    ALLOW_PRODUCTION: "1",
    ALLOW_REQUIRE_AGENT_SIGNATURE: "1",
    ALLOW_POLICY_PATH: "/secure/signed-policy.json"
  }
});
assert.equal(wrongController.valid, false);
assert.equal(wrongController.checks.find((check) => check.id === "policy.expected_controller").status, "fail");

const badRuntime = await buildSigningCeremonyAudit({
  policy: productionFixturePolicy(),
  expectedController: EIP712_FIXTURE_CONTROLLER,
  env: {
    ALLOW_PRODUCTION: "1",
    ALLOW_REQUIRE_AGENT_SIGNATURE: "1",
    ALLOW_POLICY_PATH: "/secure/signed-policy.json",
    ALLOW_USE_FIXTURE: "1",
    ALLOW_CONTROLLER_PRIVATE_KEY: "0x0000000000000000000000000000000000000000000000000000000000000001",
    ALLOW_AGENT_PRIVATE_KEY: "0x0000000000000000000000000000000000000000000000000000000000000001"
  }
});
assert.equal(badRuntime.valid, false);
assert.equal(badRuntime.checks.find((check) => check.id === "runtime.fixture_disabled").status, "fail");
assert.equal(badRuntime.checks.find((check) => check.id === "secrets.no_private_key_env").status, "fail");
assert.equal(badRuntime.checks.find((check) => check.id === "secrets.no_agent_private_key_env").status, "fail");

const demo = await buildSigningCeremonyAudit({
  policy: DEFAULT_POLICY,
  env: {
    ALLOW_PRODUCTION: "1",
    ALLOW_REQUIRE_AGENT_SIGNATURE: "1",
    ALLOW_POLICY_PATH: "/secure/signed-policy.json"
  }
});
assert.equal(demo.valid, false);
assert.equal(demo.checks.find((check) => check.id === "policy.signature").status, "fail");

console.log("signingCeremony tests passed");
