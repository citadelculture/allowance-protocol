import assert from "node:assert/strict";
import {
  agentIntentVerifierFromEnv,
  assertProductionRuntimeReady,
  loadPolicyFromEnv,
  policyFromEnv,
  productionRuntimeReadiness,
  policyVerifierFromEnv,
  runtimeMode
} from "../src/runtimeConfig.mjs";
import { productionFixturePolicy } from "../src/productionFixture.mjs";

assert.equal(runtimeMode({}), "development");
assert.deepEqual(policyVerifierFromEnv({}), {});
assert.deepEqual(agentIntentVerifierFromEnv({}), {});
assert.equal(policyFromEnv({}).signatureMode, "demo");

assert.equal(runtimeMode({ ALLOW_PRODUCTION: "1" }), "production");
assert.deepEqual(policyVerifierFromEnv({ ALLOW_PRODUCTION: "1" }), {
  production: true,
  mode: "eip712"
});
assert.deepEqual(agentIntentVerifierFromEnv({ ALLOW_REQUIRE_AGENT_SIGNATURE: "1" }), {
  requireSignature: true,
  mode: "eip712",
  expectedSigner: undefined
});
assert.deepEqual(
  agentIntentVerifierFromEnv({
    ALLOW_REQUIRE_AGENT_SIGNATURE: "1",
    ALLOW_AGENT_ADDRESS: "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf"
  }),
  {
    requireSignature: true,
    mode: "eip712",
    expectedSigner: "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf"
  }
);
assert.throws(
  () => policyFromEnv({ ALLOW_PRODUCTION: "1" }),
  /Production mode requires/
);
assert.equal(policyFromEnv({ ALLOW_PRODUCTION: "1", ALLOW_USE_FIXTURE: "1" }).signatureMode, "eip712");
assert.equal(policyFromEnv({ ALLOW_PRODUCTION: "1", ALLOW_USE_FIXTURE: "1" }).production, true);

const missingRuntimeGuard = productionRuntimeReadiness(
  { ALLOW_PRODUCTION: "1" },
  productionFixturePolicy()
);
assert.equal(missingRuntimeGuard.valid, false);
assert.ok(missingRuntimeGuard.reasons.includes("Production runtime must set ALLOW_REQUIRE_AGENT_SIGNATURE=1 or policy.requireAgentIntentSignature=true"));

const readyRuntime = assertProductionRuntimeReady(
  { ALLOW_PRODUCTION: "1", ALLOW_REQUIRE_AGENT_SIGNATURE: "1" },
  productionFixturePolicy()
);
assert.equal(readyRuntime.valid, true);
assert.equal(readyRuntime.checks.requireAgentSignature, true);
assert.equal(readyRuntime.checks.agentSignerBound, true);

assert.throws(
  () =>
    assertProductionRuntimeReady(
      {
        ALLOW_PRODUCTION: "1",
        ALLOW_REQUIRE_AGENT_SIGNATURE: "1",
        ALLOW_AGENT_PRIVATE_KEY: "0x0000000000000000000000000000000000000000000000000000000000000001"
      },
      productionFixturePolicy()
    ),
  /ALLOW_AGENT_PRIVATE_KEY/
);

assert.throws(
  () =>
    assertProductionRuntimeReady(
      { ALLOW_PRODUCTION: "1", ALLOW_REQUIRE_AGENT_SIGNATURE: "1" },
      productionFixturePolicy({ agentAddress: "" })
    ),
  /bind agent intent signatures/
);

const signedPolicy = productionFixturePolicy({ spentTodayUsd: 0 });
const fromJson = policyFromEnv({
  ALLOW_PRODUCTION: "1",
  ALLOW_POLICY_JSON: JSON.stringify(signedPolicy)
});

assert.equal(fromJson.signatureMode, "eip712");
assert.equal(fromJson.production, true);

await assert.rejects(
  () => loadPolicyFromEnv({ ALLOW_PRODUCTION: "1", ALLOW_POLICY_PATH: "/no/such/policy.json" }),
  /no such file/
);

assert.equal(runtimeMode({ NODE_ENV: "production" }), "production");

console.log("runtimeConfig tests passed");
