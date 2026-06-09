import { buildLivePilotPreflight } from "./livePilotPreflight.mjs";

export const PILOT_TRAFFIC_STEPS = ["allowed_delivery", "denied_guard"];

const APPROVAL_FLAGS = [
  "humanWillExecute",
  "automationDisabled",
  "exactActionReviewed",
  "externalSideEffectAcknowledged",
  "noPrivateKeys",
  "noCustodyOrEscrow",
  "noTokenPitch",
  "noMarketManipulation",
  "legalEthicsReviewed"
];

export async function buildPilotTrafficActionPack(input = {}, options = {}) {
  const preflightInput = input.preflight || input;
  const runtimeEnv = safePilotRuntimeEnv(input.runtimeEnv || options.env || {});
  const walletControlResult = input.walletControlResult || options.walletControlResult || null;
  const sourceErrors = input.sourceErrors || options.sourceErrors || [];
  const preflight = await buildLivePilotPreflight(preflightInput, {
    env: runtimeEnv,
    sourceErrors,
    walletControlResult,
    walletControlVerifier: options.walletControlVerifier
  });
  const requestedBy = String(options.requestedBy || "allow-operator").trim();
  const requestedAt = String(options.requestedAt || isoDate()).trim();
  const approvalIdPrefix = String(options.approvalIdPrefix || "live_pilot").trim();
  const requests = buildPilotTrafficRequests(preflight, options);
  const packets = requests.map((request) =>
    buildPilotTrafficExternalActionPacket(request, {
      preflight: preflightInput,
      runtimeEnv,
      walletControlResult,
      sourceErrors,
      requestedBy,
      requestedAt,
      approvalIdPrefix
    })
  );
  const reasons = [
    ...preflight.reasons.map((reason) => `preflight: ${reason}`)
  ];

  if (!preflight.gateway?.route?.merchantId) reasons.push("Preflight must identify the pilot gateway merchant route");
  if (!preflight.gateway?.receiptPath) reasons.push("Preflight must identify the pilot receipt log path");
  if (requests.length !== 2) reasons.push("Pilot traffic action pack requires allowed and denied request drafts");

  return {
    generatedAt: new Date().toISOString(),
    valid: preflight.valid && reasons.length === 0,
    status: preflight.valid && reasons.length === 0 ? "ready_for_human_approval" : "needs_preflight_fixes",
    preflight: {
      valid: preflight.valid,
      status: preflight.status,
      reasons: preflight.reasons,
      warnings: preflight.warnings,
      merchantId: preflight.gateway?.route?.merchantId || null,
      route: preflight.gateway?.route || null,
      receiptPath: preflight.gateway?.receiptPath || null,
      evidence: preflight.gateway?.evidence || null
    },
    count: packets.length,
    requests,
    packets,
    reasons: unique(reasons),
    warnings: preflight.warnings,
    nextAction:
      preflight.valid && reasons.length === 0
        ? "Review both live_pilot packets, fill human approval fields, run external-action-approval on each, then execute exactly those commands."
        : "Fix live pilot preflight before preparing human-approved pilot traffic.",
    evidenceBoundary: {
      startsPilotTraffic: false,
      movesFunds: false,
      signsWalletPayloads: false,
      storesSecrets: false,
      countsAsPilotEvidence: false,
      approvesExternalAction: false,
      requiresHumanApproval: true,
      finalExternalActionApprovalRequired: true,
      readyPilotRequiresReceiptsAfterExecution: [
        "one merchant-approved allowed 2xx receipt",
        "one merchant-approved denied guard receipt",
        "pilot-report passes for the merchant receipt log"
      ]
    }
  };
}

export function buildPilotTrafficRequests(preflight = {}, options = {}) {
  const route = preflight.gateway?.route || {};
  const merchantId = route.merchantId || "";
  const routePath = normalizePath(route.pathPrefix || "/");
  const gatewayBaseUrl = stripTrailingSlash(options.gatewayBaseUrl || "$ALLOW_GATEWAY_BASE_URL");
  const receiptPath = preflight.gateway?.receiptPath || "";
  const allowNonce = options.allowNonce || `pilot-allow-${slug(merchantId)}-${isoDate()}`;
  const denyNonce = options.denyNonce || `pilot-deny-${slug(merchantId)}-${isoDate()}`;
  const allowedMetadata = options.allowedMetadata || "pilot_safe_metadata";
  const deniedMetadata = options.deniedMetadata || "email=user@example.com";

  if (!merchantId || !route.pathPrefix) return [];

  return [
    {
      step: "allowed_delivery",
      merchantId,
      route: {
        pathPrefix: route.pathPrefix,
        amountUsd: route.amountUsd
      },
      destination: `gateway:${route.pathPrefix}`,
      expectedOutcome: "merchant_approved_allowed_2xx_receipt",
      receiptPath,
      command: [
        `curl -sS "${gatewayBaseUrl}${routePath}?allow_pilot=1"`,
        `  -H "x-allow-nonce: ${allowNonce}"`,
        `  -H "x-allow-metadata: ${allowedMetadata}"`,
        `  -H "PAYMENT-SIGNATURE: <x402-payment-signature-from-approved-agent-wallet>"`
      ].join(" \\\n"),
      notes: [
        "Human must obtain the x402 payment payload from the approved agent wallet/facilitator.",
        "The command is a template until the placeholder payment signature is replaced during human execution."
      ]
    },
    {
      step: "denied_guard",
      merchantId,
      route: {
        pathPrefix: route.pathPrefix,
        amountUsd: route.amountUsd
      },
      destination: `gateway:${route.pathPrefix}`,
      expectedOutcome: "merchant_approved_denied_guard_receipt",
      receiptPath,
      command: [
        `curl -sS "${gatewayBaseUrl}${routePath}?deny_pilot=1"`,
        `  -H "x-allow-nonce: ${denyNonce}"`,
        `  -H "x-allow-metadata: ${deniedMetadata}"`
      ].join(" \\\n"),
      notes: [
        "This request intentionally uses blocked metadata to prove the guard denies unsafe intent.",
        "It should not reach upstream delivery or require settlement."
      ]
    }
  ];
}

export function buildPilotTrafficExternalActionPacket(request = {}, options = {}) {
  const approvalIdPrefix = String(options.approvalIdPrefix || "live_pilot").trim();
  const approvalId = `${approvalIdPrefix}_${slug(request.merchantId)}_${slug(request.step)}`;

  return {
    approvalId,
    actionType: "live_pilot",
    status: "draft",
    requestedBy: String(options.requestedBy || "allow-operator").trim(),
    requestedAt: String(options.requestedAt || isoDate()).trim(),
    approvedBy: "",
    approvedAt: "",
    action: {
      summary: `Human runs ${request.step || "pilot"} request for ${request.merchantId || "merchant"} live pilot`,
      channel: "gateway",
      destination: request.destination || "",
      command: request.command || "",
      executionMode: "human_only",
      automated: false
    },
    approvals: Object.fromEntries(APPROVAL_FLAGS.map((flag) => [flag, false])),
    payload: {
      pilotStep: request.step || "",
      request,
      preflight: options.preflight || {},
      runtimeEnv: options.runtimeEnv || {},
      walletControlResult: options.walletControlResult || null,
      sourceErrors: options.sourceErrors || []
    },
    notes: [
      "Generated from a live pilot preflight report.",
      "This packet must remain draft until the human owner reviews the exact command and sets every approval flag.",
      "Run npm run external-action-approval on the approved packet before executing any live pilot request.",
      "After execution, validate the receipt log with npm run pilot-report."
    ]
  };
}

export function safePilotRuntimeEnv(env = {}) {
  const output = {};
  for (const key of ["ALLOW_PRODUCTION", "NODE_ENV", "ALLOW_REQUIRE_AGENT_SIGNATURE", "ALLOW_POLICY_PATH"]) {
    if (env[key] !== undefined) output[key] = String(env[key]);
  }
  return output;
}

function normalizePath(path) {
  const value = String(path || "/");
  return value.startsWith("/") ? value : `/${value}`;
}

function stripTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function slug(value) {
  const text = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return text || "pilot";
}

function isoDate() {
  return new Date().toISOString().slice(0, 10);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
