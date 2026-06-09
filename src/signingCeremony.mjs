import { verifyProductionPolicy } from "./policyAudit.mjs";

export async function buildSigningCeremonyAudit({ policy, expectedController = "", env = {}, policyPath = "" } = {}) {
  const policyAudit = await verifyProductionPolicy(policy);
  const expected = String(expectedController || env.ALLOW_EXPECTED_CONTROLLER || "").trim();
  const checks = [
    ceremonyCheck("policy.signature", policyAudit.valid, {
      pass: "Production policy signature verifies",
      fail: "Production policy signature or requirements failed",
      details: {
        reasons: policyAudit.reasons,
        warnings: policyAudit.warnings
      }
    }),
    ceremonyCheck("policy.controller", Boolean(policyAudit.controller && policyAudit.recoveredController && policyAudit.controller === policyAudit.recoveredController), {
      pass: "Recovered controller matches policy controller",
      fail: "Recovered controller does not match policy controller",
      details: {
        controller: policyAudit.controller,
        recoveredController: policyAudit.recoveredController
      }
    }),
    ceremonyCheck("policy.expected_controller", !expected || sameAddress(policyAudit.controller, expected), {
      pass: expected ? "Policy controller matches expected controller" : "No expected controller supplied",
      fail: "Policy controller does not match expected controller",
      severity: expected ? "fail" : "warning",
      details: {
        expectedController: expected || null,
        controller: policyAudit.controller
      }
    }),
    ceremonyCheck("runtime.production_mode", env.ALLOW_PRODUCTION === "1" || env.NODE_ENV === "production", {
      pass: "Production mode is enabled for runtime smoke",
      fail: "Enable production mode and signed agent intents before production smoke",
      severity: "warning"
    }),
    ceremonyCheck("runtime.policy_source", Boolean(policyPath || env.ALLOW_POLICY_PATH || env.ALLOW_POLICY_JSON), {
      pass: "Runtime policy source is configured",
      fail: "Set ALLOW_POLICY_PATH or ALLOW_POLICY_JSON for production runtime",
      severity: "warning",
      details: {
        policyPath: policyPath || env.ALLOW_POLICY_PATH || null,
        policyJsonConfigured: Boolean(env.ALLOW_POLICY_JSON)
      }
    }),
    ceremonyCheck("runtime.agent_intent_required", env.ALLOW_REQUIRE_AGENT_SIGNATURE === "1", {
      pass: "Runtime requires signed agent intents",
      fail: "Set ALLOW_REQUIRE_AGENT_SIGNATURE=1 for production runtime",
      severity: "warning"
    }),
    ceremonyCheck("runtime.fixture_disabled", env.ALLOW_USE_FIXTURE !== "1", {
      pass: "Demo fixture is disabled",
      fail: "ALLOW_USE_FIXTURE=1 must not be used for public production",
      details: {
        allowUseFixture: env.ALLOW_USE_FIXTURE || null
      }
    }),
    ceremonyCheck("secrets.no_private_key_env", !env.ALLOW_CONTROLLER_PRIVATE_KEY, {
      pass: "Controller private key is not present in runtime env",
      fail: "Remove ALLOW_CONTROLLER_PRIVATE_KEY from runtime env after signing"
    }),
    ceremonyCheck("secrets.no_agent_private_key_env", !env.ALLOW_AGENT_PRIVATE_KEY, {
      pass: "Agent private key is not present in runtime env",
      fail: "Remove ALLOW_AGENT_PRIVATE_KEY from runtime env after signing"
    })
  ];

  return {
    generatedAt: new Date().toISOString(),
    valid: checks.every((check) => check.status !== "fail"),
    policy: {
      policyId: policyAudit.policyId,
      fingerprint: policyAudit.fingerprint,
      controller: policyAudit.controller,
      recoveredController: policyAudit.recoveredController,
      signatureMode: policyAudit.signatureMode,
      verifierMode: policyAudit.verifierMode
    },
    checks,
    policyAudit,
    nextActions: checks
      .filter((check) => check.status !== "pass")
      .map((check) => actionForCeremonyCheck(check.id))
  };
}

function ceremonyCheck(id, condition, options) {
  if (condition) {
    return {
      id,
      status: "pass",
      message: options.pass,
      details: options.details || null
    };
  }

  return {
    id,
    status: options.severity || "fail",
    message: options.fail,
    details: options.details || null
  };
}

function actionForCeremonyCheck(id) {
  const actions = {
    "policy.signature": "Regenerate and verify the EIP-712 signed production policy",
    "policy.controller": "Re-sign the policy with the intended controller wallet",
    "policy.expected_controller": "Confirm the expected controller address or rotate the policy owner",
    "runtime.production_mode": "Run the smoke with production mode and ALLOW_REQUIRE_AGENT_SIGNATURE=1",
    "runtime.policy_source": "Set ALLOW_POLICY_PATH or ALLOW_POLICY_JSON for production runtime",
    "runtime.agent_intent_required": "Set ALLOW_REQUIRE_AGENT_SIGNATURE=1 for production runtime",
    "runtime.fixture_disabled": "Remove ALLOW_USE_FIXTURE=1 before public production",
    "secrets.no_private_key_env": "Remove ALLOW_CONTROLLER_PRIVATE_KEY from runtime environment after signing",
    "secrets.no_agent_private_key_env": "Remove ALLOW_AGENT_PRIVATE_KEY from runtime environment after signing"
  };
  return actions[id] || "Review signing ceremony check";
}

function sameAddress(a, b) {
  return String(a || "").toLowerCase() === String(b || "").toLowerCase();
}
