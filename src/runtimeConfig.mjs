import { readFile } from "node:fs/promises";
import { policyAgentSigner } from "./agentIntentSigner.mjs";
import { policyForRuntime } from "./productionFixture.mjs";

export function policyVerifierFromEnv(env = {}) {
  const production = env.ALLOW_PRODUCTION === "1" || env.NODE_ENV === "production";
  if (!production) return {};

  return {
    production: true,
    mode: "eip712"
  };
}

export function agentIntentVerifierFromEnv(env = {}) {
  const requireSignature = env.ALLOW_REQUIRE_AGENT_SIGNATURE === "1";
  if (!requireSignature) return {};

  return {
    requireSignature: true,
    mode: "eip712",
    expectedSigner: env.ALLOW_AGENT_ADDRESS || undefined
  };
}

export function runtimeMode(env = {}) {
  const production = env.ALLOW_PRODUCTION === "1" || env.NODE_ENV === "production";
  return production ? "production" : "development";
}

export function productionRuntimeReadiness(env = {}, policy = {}) {
  const reasons = [];
  const warnings = [];
  const mode = runtimeMode(env);

  if (mode !== "production") {
    return {
      valid: true,
      mode,
      reasons,
      warnings,
      checks: {
        requireAgentSignature: false,
        agentSignerBound: Boolean(policyAgentSigner(policy) || env.ALLOW_AGENT_ADDRESS),
        fixtureEnabled: false,
        controllerPrivateKeyPresent: false,
        agentPrivateKeyPresent: false
      }
    };
  }

  const requireAgentSignature = env.ALLOW_REQUIRE_AGENT_SIGNATURE === "1" || policy.requireAgentIntentSignature === true;
  const agentSigner = env.ALLOW_AGENT_ADDRESS || policyAgentSigner(policy);
  const fixtureEnabled = env.ALLOW_USE_FIXTURE === "1";
  const controllerPrivateKeyPresent = Boolean(env.ALLOW_CONTROLLER_PRIVATE_KEY);
  const agentPrivateKeyPresent = Boolean(env.ALLOW_AGENT_PRIVATE_KEY);

  if (!requireAgentSignature) reasons.push("Production runtime must set ALLOW_REQUIRE_AGENT_SIGNATURE=1 or policy.requireAgentIntentSignature=true");
  if (!agentSigner) reasons.push("Production runtime must bind agent intent signatures to policy.agentAddress or ALLOW_AGENT_ADDRESS");
  if (controllerPrivateKeyPresent) reasons.push("Production runtime must not include ALLOW_CONTROLLER_PRIVATE_KEY");
  if (agentPrivateKeyPresent) reasons.push("Production runtime must not include ALLOW_AGENT_PRIVATE_KEY");
  if (fixtureEnabled) warnings.push("ALLOW_USE_FIXTURE=1 is for local production smoke only, not public deployment");

  return {
    valid: reasons.length === 0,
    mode,
    reasons,
    warnings,
    checks: {
      requireAgentSignature,
      agentSignerBound: Boolean(agentSigner),
      fixtureEnabled,
      controllerPrivateKeyPresent,
      agentPrivateKeyPresent
    }
  };
}

export function assertProductionRuntimeReady(env = {}, policy = {}) {
  const readiness = productionRuntimeReadiness(env, policy);
  if (!readiness.valid) {
    throw new Error(`Production runtime is not ready: ${readiness.reasons.join("; ")}`);
  }
  return readiness;
}

export function policyFromEnv(env = {}) {
  const mode = runtimeMode(env);
  if (mode !== "production") return policyForRuntime(mode);

  if (env.ALLOW_POLICY_JSON) {
    return normalizeProductionPolicy(JSON.parse(env.ALLOW_POLICY_JSON), "ALLOW_POLICY_JSON");
  }

  if (env.ALLOW_USE_FIXTURE === "1") {
    return policyForRuntime("production");
  }

  throw new Error("Production mode requires ALLOW_POLICY_JSON, ALLOW_POLICY_PATH, or ALLOW_USE_FIXTURE=1 for local smoke tests");
}

export async function loadPolicyFromEnv(env = {}) {
  const mode = runtimeMode(env);
  if (mode !== "production") return policyForRuntime(mode);

  if (env.ALLOW_POLICY_PATH) {
    const raw = await readFile(env.ALLOW_POLICY_PATH, "utf8");
    return normalizeProductionPolicy(JSON.parse(raw), "ALLOW_POLICY_PATH");
  }

  return policyFromEnv(env);
}

function normalizeProductionPolicy(policy, source) {
  if (policy.signatureMode !== "eip712") {
    throw new Error(`${source} must provide an eip712 policy`);
  }
  if (!policy.controllerSignature || String(policy.controllerSignature).startsWith("sig_demo_")) {
    throw new Error(`${source} must provide a non-demo controller signature`);
  }
  return {
    ...policy,
    production: true
  };
}
