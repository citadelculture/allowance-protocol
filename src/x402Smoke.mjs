import { normalizeGatewayConfig } from "./gateway.mjs";
import {
  X402_FACILITATOR_PROOF_TYPES,
  createX402FacilitatorVerifier,
  normalizeX402FacilitatorConfig,
  parseX402PaymentHeader,
  paymentRequirementsFromSettlement
} from "./x402Facilitator.mjs";
import { CREDIBLE_PILOT_ENVIRONMENTS, normalizeReceiptEvidence } from "./receiptStore.mjs";

export async function runX402FacilitatorSmoke(options = {}) {
  const env = options.env || {};
  const config = normalizeGatewayConfig(options.config || {});
  const live = Boolean(options.live ?? (env.ALLOW_X402_LIVE === "1"));
  const paymentSignature = options.paymentSignature || env.ALLOW_X402_PAYMENT_SIGNATURE || env.PAYMENT_SIGNATURE || "";
  const selectedRoute = options.routePath || env.ALLOW_X402_ROUTE || "";
  const routes = x402SettlementRoutes(config).filter((route) => !selectedRoute || route.pathPrefix === selectedRoute);

  const results = [];
  for (const route of routes) {
    results.push(await smokeX402Route({ config, route, env, live, paymentSignature, fetchImpl: options.fetchImpl }));
  }

  const reasons = [];
  if (routes.length === 0) {
    reasons.push(selectedRoute ? `No x402 facilitator route matched ${selectedRoute}` : "No x402 facilitator routes found");
  }

  return {
    generatedAt: new Date().toISOString(),
    mode: live ? "live" : "dry_run",
    valid: reasons.length === 0 && results.every((result) => result.valid),
    reasons,
    routeCount: routes.length,
    results
  };
}

export function x402SettlementRoutes(config = {}) {
  const normalized = normalizeGatewayConfig(config);
  return (normalized.routes || []).filter((route) => {
    const proofType = String(route.settlement?.proofType || "").toLowerCase();
    return X402_FACILITATOR_PROOF_TYPES.has(proofType);
  });
}

export async function smokeX402Route({ config = {}, route = {}, env = {}, live = false, paymentSignature = "", fetchImpl } = {}) {
  const settlement = route.settlement || {};
  const expected = {
    merchantId: route.merchantId,
    amountUsd: route.amountUsd,
    asset: settlement.asset || "",
    chain: settlement.chain || ""
  };
  const paymentRequirements = paymentRequirementsFromSettlement(settlement, expected);
  const facilitator = normalizeX402FacilitatorConfig({
    ...(settlement.facilitator || {}),
    baseUrl: settlement.facilitator?.baseUrl || env.ALLOW_X402_FACILITATOR_URL || ""
  }, env);
  const reasons = [];
  const warnings = [];

  if (!paymentRequirements) reasons.push("Missing x402 payment requirements");
  if (live && !facilitator.baseUrl) reasons.push("Missing x402 facilitator base URL");

  const signature = paymentSignature || (!live && paymentRequirements ? syntheticPaymentSignature({ config, route, paymentRequirements }) : "");
  if (live && !signature) reasons.push("Missing live x402 payment signature");

  let paymentPayload = null;
  if (signature) {
    try {
      paymentPayload = parseX402PaymentHeader(signature);
    } catch (error) {
      reasons.push(error.message);
    }
  }

  if (paymentPayload && paymentRequirements) {
    reasons.push(...paymentPayloadRequirementMismatches(paymentPayload, paymentRequirements));
  }

  const liveReadiness = validateX402LiveReadiness({
    route,
    settlement,
    facilitator,
    paymentRequirements,
    paymentPayload,
    paymentSignature: signature,
    live
  });

  if (live) {
    pushUnique(reasons, liveReadiness.reasons);
  }

  if (!live) {
    if (!facilitator.baseUrl) warnings.push("Dry run skipped facilitator URL requirement");
    return {
      route: route.pathPrefix,
      merchantId: route.merchantId,
      valid: reasons.length === 0,
      mode: "dry_run",
      reasons,
      warnings,
      syntheticPayment: !paymentSignature,
      liveReadiness,
      facilitator: sanitizeFacilitator(facilitator),
      plannedRequest: plannedFacilitatorRequest({ facilitator, paymentPayload, paymentRequirements, settlement })
    };
  }

  if (reasons.length > 0) {
    return {
      route: route.pathPrefix,
      merchantId: route.merchantId,
      valid: false,
      mode: "live",
      reasons,
      warnings,
      liveReadiness,
      facilitator: sanitizeFacilitator(facilitator)
    };
  }

  const verifier = createX402FacilitatorVerifier({
    facilitator,
    fetchImpl
  });
  const verification = await verifier({
    proof: {
      proof: signature,
      rawPaymentHeader: signature
    },
    expected,
    mode: settlement.proofType,
    settlement
  });

  return {
    route: route.pathPrefix,
    merchantId: route.merchantId,
    valid: verification.valid,
    mode: "live",
    reasons: verification.reasons,
    warnings: verification.warnings,
    liveReadiness,
    facilitator: sanitizeFacilitator(facilitator),
    payer: verification.payer || null,
    verification: verification.verification || null,
    settlement: verification.settlement || null
  };
}

export function validateX402LiveReadiness({
  route = {},
  settlement = {},
  facilitator = {},
  paymentRequirements = null,
  paymentPayload = null,
  paymentSignature = "",
  live = false
} = {}) {
  const reasons = [];
  const warnings = [];
  const evidence = normalizeReceiptEvidence(route.evidence || {});
  const approval = settlement?.merchantApproval || route?.merchantApproval || {};
  const proofType = String(settlement?.proofType || "").toLowerCase();
  const settleRequested = Boolean(facilitator?.settle || settlement?.settle);

  if (!X402_FACILITATOR_PROOF_TYPES.has(proofType)) reasons.push("Live x402 route must use an x402 facilitator proof type");
  if (settlement?.required !== true) reasons.push("Live x402 route must require settlement proof");
  if (!paymentRequirements) reasons.push("Missing x402 payment requirements");
  if (!facilitator?.baseUrl) {
    reasons.push("Missing x402 facilitator base URL");
  } else if (isLocalUrl(facilitator.baseUrl)) {
    reasons.push("Live x402 facilitator URL must not be local");
  }
  if (!facilitator?.bearerToken && settlement?.facilitator?.authRequired !== false) {
    reasons.push("Live x402 facilitator token is required unless authRequired is false");
  }
  if (!settleRequested) reasons.push("Live x402 smoke must request facilitator settlement");
  if (!paymentSignature) reasons.push("Missing live x402 payment signature");
  if (paymentPayload?.payload?.signature === "dry_run_signature") {
    reasons.push("Live x402 smoke cannot use synthetic dry-run payment signatures");
  }

  if (approval.approved !== true) reasons.push("Live x402 payment requirements need merchantApproval.approved=true");
  if (!approval.source && !approval.evidenceRef && !approval.approvalRef) {
    reasons.push("Live x402 merchant approval needs a source, evidenceRef, or approvalRef");
  }
  if (!isValidDate(approval.approvedAt)) reasons.push("Live x402 merchant approval needs a valid approvedAt date");
  if (approval.merchantId && route.merchantId && String(approval.merchantId) !== String(route.merchantId)) {
    reasons.push("Live x402 merchant approval merchantId does not match route merchantId");
  }

  if (!evidence.merchantApproved) reasons.push("Live x402 route evidence must be merchant-approved");
  if (!CREDIBLE_PILOT_ENVIRONMENTS.has(evidence.environment)) {
    reasons.push("Live x402 route evidence environment must be testnet or mainnet");
  }
  if (evidence.rail !== "x402") reasons.push("Live x402 route evidence rail must be x402");
  if (evidence.network && paymentRequirements?.network && String(evidence.network).toLowerCase() !== String(paymentRequirements.network).toLowerCase()) {
    reasons.push("Live x402 route evidence network does not match payment requirements");
  }

  if (paymentPayload && paymentRequirements) {
    const authorization = paymentPayload.payload?.authorization || {};
    if (authorization.to && paymentRequirements.payTo && String(authorization.to).toLowerCase() !== String(paymentRequirements.payTo).toLowerCase()) {
      reasons.push("x402 authorization recipient does not match route requirements");
    }
    if (authorization.value && paymentRequirements.amount && String(authorization.value) !== String(paymentRequirements.amount)) {
      reasons.push("x402 authorization value does not match route requirements");
    }
  }

  return {
    valid: reasons.length === 0,
    enforced: Boolean(live),
    reasons,
    warnings,
    settlementRequired: settlement?.required === true,
    settleRequested,
    evidence,
    merchantApproval: {
      approved: approval.approved === true,
      merchantId: approval.merchantId || null,
      approvedAt: approval.approvedAt || null,
      source: approval.source || approval.evidenceRef || approval.approvalRef || null
    },
    facilitator: sanitizeFacilitator(facilitator),
    paymentSignaturePresent: Boolean(paymentSignature),
    syntheticPayment: paymentPayload?.payload?.signature === "dry_run_signature"
  };
}

export function syntheticPaymentSignature({ config = {}, route = {}, paymentRequirements = {} } = {}) {
  const payload = {
    x402Version: 2,
    accepted: paymentRequirements,
    payload: {
      signature: "dry_run_signature",
      authorization: {
        from: "0x0000000000000000000000000000000000000001",
        to: paymentRequirements.payTo || "0x0000000000000000000000000000000000000000",
        value: String(paymentRequirements.amount || "0"),
        validAfter: "0",
        validBefore: String(paymentRequirements.maxTimeoutSeconds || 60),
        nonce: "0x0000000000000000000000000000000000000000000000000000000000000000"
      }
    },
    resource: {
      url: `${config.upstream?.baseUrl || "https://merchant.example"}${route.pathPrefix || "/"}`,
      description: `Allow dry-run payment for ${route.merchantId || "merchant"}`,
      mimeType: "application/json"
    }
  };

  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

export function paymentPayloadRequirementMismatches(paymentPayload = {}, paymentRequirements = {}) {
  const accepted = paymentPayload.accepted || {};
  const checks = [
    ["scheme", "x402 payment scheme does not match route requirements"],
    ["network", "x402 payment network does not match route requirements"],
    ["asset", "x402 payment asset does not match route requirements"],
    ["amount", "x402 payment amount does not match route requirements"],
    ["payTo", "x402 payment payTo does not match route requirements"]
  ];
  const reasons = [];

  for (const [field, message] of checks) {
    if (!accepted[field] || !paymentRequirements[field]) continue;
    if (String(accepted[field]).toLowerCase() !== String(paymentRequirements[field]).toLowerCase()) {
      reasons.push(message);
    }
  }

  return reasons;
}

function pushUnique(target, values = []) {
  for (const value of values) {
    if (!target.includes(value)) target.push(value);
  }
}

function isValidDate(value) {
  if (!value) return false;
  return Number.isFinite(new Date(value).getTime());
}

function isLocalUrl(value) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === "localhost" || hostname === "0.0.0.0" || hostname === "::1" || hostname.startsWith("127.") || hostname.endsWith(".local");
  } catch {
    return false;
  }
}

function plannedFacilitatorRequest({ facilitator, paymentPayload, paymentRequirements, settlement }) {
  return {
    verifyUrl: facilitator.baseUrl ? `${facilitator.baseUrl}${ensureLeadingSlash(facilitator.verifyPath)}` : null,
    settleUrl: facilitator.baseUrl ? `${facilitator.baseUrl}${ensureLeadingSlash(facilitator.settlePath)}` : null,
    settleRequested: Boolean(facilitator.settle || settlement?.settle),
    body: {
      x402Version: Number(settlement?.x402Version || paymentPayload?.x402Version || 2),
      paymentPayload: summarizePaymentPayload(paymentPayload),
      paymentRequirements
    }
  };
}

function summarizePaymentPayload(paymentPayload) {
  if (!paymentPayload) return null;
  return {
    x402Version: paymentPayload.x402Version,
    accepted: paymentPayload.accepted || null,
    payload: {
      authorization: paymentPayload.payload?.authorization || null,
      signaturePresent: Boolean(paymentPayload.payload?.signature)
    },
    resource: paymentPayload.resource || null
  };
}

function sanitizeFacilitator(facilitator) {
  return {
    baseUrl: facilitator.baseUrl || null,
    verifyPath: facilitator.verifyPath,
    settlePath: facilitator.settlePath,
    supportedPath: facilitator.supportedPath,
    timeoutMs: facilitator.timeoutMs,
    settle: facilitator.settle,
    bearerTokenConfigured: Boolean(facilitator.bearerToken)
  };
}

function ensureLeadingSlash(value) {
  const path = String(value || "");
  return path.startsWith("/") ? path : `/${path}`;
}
