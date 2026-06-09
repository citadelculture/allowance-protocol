import { DEFAULT_POLICY } from "./policyEngine.mjs";

export const EIP712_FIXTURE_CONTROLLER = "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf";
export const EIP712_FIXTURE_AGENT = "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf";

export const EIP712_FIXTURE_SIGNATURE =
  "0x36d82e4535c199e6b33b645b727a122c20d1082e382e2ed3c9d7bdbde5a4b98b0b5e9d5a823a7dd970044f0529a75926f169db4106374b77439809b448d0fb3d1c";

export function productionFixturePolicy(overrides = {}) {
  return {
    ...DEFAULT_POLICY,
    controller: EIP712_FIXTURE_CONTROLLER,
    agentAddress: EIP712_FIXTURE_AGENT,
    controllerSignature: EIP712_FIXTURE_SIGNATURE,
    signatureMode: "eip712",
    production: true,
    ...overrides
  };
}

export function policyForRuntime(mode) {
  return mode === "production" ? productionFixturePolicy() : DEFAULT_POLICY;
}
