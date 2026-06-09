import assert from "node:assert/strict";
import {
  EIP712_FIXTURE_CONTROLLER,
  EIP712_FIXTURE_SIGNATURE
} from "../src/productionFixture.mjs";
import { DEFAULT_POLICY, policyFingerprint } from "../src/policyEngine.mjs";
import { signPolicyWithPrivateKey } from "../src/policySigner.mjs";
import { recoverControllerWithViem } from "../src/policyVerifier.mjs";

const signed = await signPolicyWithPrivateKey(
  { ...DEFAULT_POLICY, spentTodayUsd: 0 },
  "0x0000000000000000000000000000000000000000000000000000000000000001"
);

assert.equal(signed.controller, EIP712_FIXTURE_CONTROLLER);
assert.equal(signed.fingerprint, "3deb3ebb");
assert.equal(signed.policy.controllerSignature, EIP712_FIXTURE_SIGNATURE);
assert.equal(policyFingerprint(signed.policy), signed.fingerprint);

const recovered = await recoverControllerWithViem({
  typedData: signed.typedData,
  signature: signed.policy.controllerSignature
});

assert.equal(recovered, EIP712_FIXTURE_CONTROLLER);

await assert.rejects(
  () => signPolicyWithPrivateKey(DEFAULT_POLICY, "not-a-key"),
  /32-byte hex private key/
);

console.log("policySigner tests passed");
