import { buildPilotKit } from "./pilotKit.mjs";
import { runLocalGatewaySmoke } from "./gatewaySmoke.mjs";
import { DEFAULT_POLICY, policyFingerprint } from "./policyEngine.mjs";
import { demoPolicySignature } from "./policyVerifier.mjs";

export async function buildMerchantPilotPacket(intake = {}, options = {}) {
  const kit = buildPilotKit(intake, options);
  const smokeOptions = {
    ...(options.smoke || {}),
    policy: options.policy || smokePolicyFromPatch(kit.policyPatch),
    merchants: options.smoke?.merchants || [kit.merchant].filter((merchant) => merchant?.id)
  };
  const localSmoke = await smokeGatewaySafely(kit.gatewayConfig, smokeOptions);
  const valid = kit.readiness.readyForTest === true && localSmoke.valid === true;
  const reasons = [
    ...kit.readiness.reasons,
    ...localSmoke.checks.filter((check) => check.status !== "pass").map((check) => check.message)
  ];
  const warnings = [
    ...kit.readiness.warnings,
    ...localSmoke.warnings,
    "Packet is review-only and must not be treated as merchant approval."
  ];

  return {
    generatedAt: new Date().toISOString(),
    valid,
    status: valid ? "ready_for_human_review" : "action_required",
    merchantId: kit.merchantId,
    merchantName: intake?.name || null,
    contact: intake?.contact || null,
    reasons,
    warnings,
    readiness: kit.readiness,
    gatewayConfig: kit.gatewayConfig,
    policyPatch: kit.policyPatch,
    merchant: kit.merchant,
    localSmoke: summarizeSmoke(localSmoke),
    commands: buildPacketCommands(kit.merchantId),
    acceptanceCriteria: kit.acceptanceCriteria,
    humanApprovalChecklist: [
      "Merchant confirms endpoint, price, and path prefix",
      "Merchant confirms local smoke output is not public pilot evidence",
      "Merchant approves the test environment and receipt evidence label",
      "Agent wallet binding packet validates before production-mode pilot traffic",
      "Controller-signed policy is stored outside the repository before production-mode pilot traffic",
      "Dispute packet path and contact are agreed before paid test traffic",
      "No private keys, seed phrases, or settlement credentials are shared with Allow"
    ],
    evidenceBoundary: {
      localSmokeCountsAsPilotEvidence: false,
      crediblePilotRequires: [
        "merchantApproved=true",
        "environment=testnet or mainnet",
        "one allowed 2xx delivery receipt",
        "one denied guard receipt for the same merchant",
        "at least one active agent id in credible receipts"
      ]
    },
    nextAction: valid
      ? "Review packet with merchant and request approval for one protected endpoint test"
      : kit.nextAction
  };
}

function smokePolicyFromPatch(policyPatch = {}) {
  const policy = {
    ...DEFAULT_POLICY,
    ...policyPatch,
    spentTodayUsd: 0,
    allowedMerchants: [
      ...new Set([...(DEFAULT_POLICY.allowedMerchants || []), ...(policyPatch.allowedMerchants || [])])
    ]
  };

  return {
    ...policy,
    controllerSignature: demoPolicySignature(policyFingerprint(policy))
  };
}

async function smokeGatewaySafely(gatewayConfig, smokeOptions) {
  try {
    return await runLocalGatewaySmoke(gatewayConfig, smokeOptions);
  } catch (error) {
    return failedSmokeFromError(error, gatewayConfig);
  }
}

function summarizeSmoke(smoke) {
  return {
    valid: smoke.valid,
    gateway: smoke.gateway,
    route: smoke.route,
    checks: smoke.checks,
    upstreamCalls: smoke.upstreamCalls,
    receipts: smoke.receipts,
    warnings: smoke.warnings
  };
}

function failedSmokeFromError(error, gatewayConfig = {}) {
  const route = gatewayConfig.routes?.[0] || {};
  return {
    valid: false,
    gateway: gatewayConfig.name || "allow-pilot",
    route: {
      pathPrefix: route.pathPrefix || null,
      merchantId: route.merchantId || null,
      amountUsd: route.amountUsd || null
    },
    checks: [
      {
        id: "local_smoke.runnable",
        status: "fail",
        message: `Local gateway smoke could not run: ${error.message}`
      }
    ],
    results: {},
    upstreamCalls: [],
    receipts: [],
    warnings: [
      "Local gateway smoke could not run; complete action items before merchant review."
    ]
  };
}

function buildPacketCommands(merchantId) {
  const receiptPath = "ops/gateway-receipts.local.jsonl";
  return {
    validateIntake: "npm run validate-merchant -- ops/merchant_intake.example.json",
    buildPilotKit: "npm run pilot-kit -- ops/merchant_intake.example.json",
    localGatewaySmoke: "npm run gateway-smoke -- <pilot-gateway-config.json>",
    runGateway: "npm run gateway -- <pilot-gateway-config.json>",
    validatePilotEvidence: `ALLOW_PILOT_MERCHANT_ID=${merchantId || "merchant_id"} npm run pilot-report -- ${receiptPath}`,
    validateDisputePacket: "npm run validate-dispute -- ops/dispute_template.json",
    validatePilotBinding: "npm run validate-pilot-binding -- ops/pilot_binding.template.json ops/signed-policy.local.json"
  };
}
