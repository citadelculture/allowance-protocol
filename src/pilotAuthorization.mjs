import { validateDistributionClaims } from "./distributionClaims.mjs";
import { summarizeMerchantReadiness } from "./merchantIntake.mjs";

export const PILOT_AUTHORIZATION_ENVIRONMENTS = ["testnet", "mainnet"];
export const PILOT_AUTHORIZATION_NETWORKS = ["eip155:84532", "eip155:8453"];
export const PILOT_AUTHORIZATION_RAILS = ["x402", "manual_usdc"];

const REQUIRED_APPROVAL_FLAGS = [
  "merchantApprovedPilot",
  "merchantUnderstandsExperimental",
  "noProductionSla",
  "noSecretsShared",
  "noCustodyOrEscrow",
  "noTokenPitch",
  "dataUseApproved",
  "disputePathApproved",
  "publicClaimsRequireSeparateApproval"
];

const REQUIRED_SAFETY_FLAGS = [
  "noTradingAuthority",
  "merchantScoped",
  "spendCapsReviewed",
  "metadataPolicyReviewed",
  "rateLimitReviewed",
  "settlementProofRequired"
];

const SENSITIVE_TEXT_PATTERNS = [
  { id: "private_key", pattern: /\b0x[0-9a-fA-F]{64}\b/, reason: "Pilot authorization must not include private keys or seed-like hex values" },
  { id: "seed_phrase", pattern: /\b(?:seed phrase|mnemonic|recovery phrase)\b/i, reason: "Pilot authorization must not include wallet seed or recovery phrase material" },
  { id: "bearer_token", pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b/i, reason: "Pilot authorization must not include bearer tokens" },
  { id: "api_key", pattern: /\b(api[_-]?key|secret|password)\s*[:=]\s*\S+/i, reason: "Pilot authorization must not include API keys, secrets, or passwords" }
];

export function buildPilotAuthorizationReport(packet = {}, context = {}, options = {}) {
  const reasons = [];
  const warnings = [];

  if (!packet || typeof packet !== "object" || Array.isArray(packet)) {
    return {
      valid: false,
      reasons: ["Pilot authorization packet must be a JSON object"],
      warnings: [],
      merchantReadiness: null,
      interview: null,
      redactionFlags: [],
      evidenceBoundary: boundary()
    };
  }

  const merchant = packet.merchant || {};
  const pilot = packet.pilot || {};
  const approvals = packet.approvals || {};
  const safety = packet.safety || {};
  const dispute = packet.dispute || {};
  const evidence = packet.evidence || {};
  const intake = context.intake || packet.intake || null;
  const interview = interviewForPacket(packet, context);

  requireText(reasons, packet.authorizationId, "authorizationId");
  requireText(reasons, packet.generatedAt, "generatedAt");
  if (packet.generatedAt && !isValidDate(packet.generatedAt)) reasons.push("generatedAt must be a valid date");

  requireText(reasons, merchant.merchantId, "merchant.merchantId");
  requireText(reasons, merchant.name, "merchant.name");
  requireText(reasons, merchant.approverRef, "merchant.approverRef");
  requireText(reasons, merchant.approvedAt, "merchant.approvedAt");
  if (merchant.approvedAt && !isValidDate(merchant.approvedAt)) reasons.push("merchant.approvedAt must be a valid date");

  requireText(reasons, packet.interviewId, "interviewId");
  requireText(reasons, packet.intakeRef, "intakeRef");
  requireText(reasons, packet.pilotPacketRef, "pilotPacketRef");

  requireKnown(reasons, pilot.environment, PILOT_AUTHORIZATION_ENVIRONMENTS, "pilot.environment");
  requireKnown(reasons, pilot.network, PILOT_AUTHORIZATION_NETWORKS, "pilot.network");
  requireKnown(reasons, pilot.paymentRail, PILOT_AUTHORIZATION_RAILS, "pilot.paymentRail");
  requireText(reasons, pilot.testEndpoint, "pilot.testEndpoint");
  requireText(reasons, pilot.pathPrefix, "pilot.pathPrefix");
  requireText(reasons, pilot.receiptLogPath, "pilot.receiptLogPath");
  requireText(reasons, pilot.expiresAt, "pilot.expiresAt");
  requirePositive(reasons, pilot.amountUsd, "pilot.amountUsd");
  requirePositive(reasons, pilot.maxRequests, "pilot.maxRequests");
  requirePositive(reasons, pilot.maxTotalSpendUsd, "pilot.maxTotalSpendUsd");
  if (pilot.expiresAt && !isValidDate(pilot.expiresAt)) reasons.push("pilot.expiresAt must be a valid date");
  if (pilot.environment === "testnet" && pilot.network !== "eip155:84532") reasons.push("testnet pilot authorization must use eip155:84532");
  if (pilot.environment === "mainnet" && pilot.network !== "eip155:8453") reasons.push("mainnet pilot authorization must use eip155:8453");
  if (pilot.testEndpoint && !isHttpsUrl(pilot.testEndpoint)) reasons.push("pilot.testEndpoint must be an https URL");
  if (pilot.pathPrefix && !String(pilot.pathPrefix).startsWith("/")) reasons.push("pilot.pathPrefix must start with /");
  if (Number(pilot.amountUsd || 0) * Number(pilot.maxRequests || 0) > Number(pilot.maxTotalSpendUsd || 0) + 1e-9) {
    reasons.push("pilot.maxTotalSpendUsd must cover amountUsd * maxRequests");
  }

  for (const flag of REQUIRED_APPROVAL_FLAGS) {
    if (approvals[flag] !== true) reasons.push(`approvals.${flag} must be true`);
  }
  for (const flag of REQUIRED_SAFETY_FLAGS) {
    if (safety[flag] !== true) reasons.push(`safety.${flag} must be true`);
  }

  requireText(reasons, dispute.contact, "dispute.contact");
  requireText(reasons, dispute.processRef, "dispute.processRef");
  requireText(reasons, evidence.label, "evidence.label");
  if (evidence.publicUseApproved === true) {
    reasons.push("evidence.publicUseApproved must remain false until pilot-disclosure passes");
  }
  if (evidence.caseStudyApproved === true) {
    reasons.push("evidence.caseStudyApproved must remain false until separate merchant promotion approval passes");
  }

  const merchantReadiness = intake ? summarizeMerchantReadiness(intake) : null;
  if (!merchantReadiness) {
    reasons.push("A validated merchant intake is required for pilot authorization");
  } else {
    if (!merchantReadiness.valid) reasons.push(...merchantReadiness.reasons.map((reason) => `intake: ${reason}`));
    warnings.push(...merchantReadiness.warnings.map((warning) => `intake: ${warning}`));
    if (!merchantReadiness.readyForTest) reasons.push("Merchant intake is not readyForTest");
    if (merchant.merchantId && intake.merchantId && merchant.merchantId !== intake.merchantId) {
      reasons.push("merchant.merchantId must match intake.merchantId");
    }
    if (pilot.testEndpoint && intake.integration?.testEndpoint && pilot.testEndpoint !== intake.integration.testEndpoint) {
      reasons.push("pilot.testEndpoint must match intake.integration.testEndpoint");
    }
    if (Number(pilot.maxTotalSpendUsd || 0) > Number(intake.risk?.maxSafeTestSpendUsd || 0)) {
      reasons.push("pilot.maxTotalSpendUsd must not exceed intake.risk.maxSafeTestSpendUsd");
    }
  }

  const interviewReport = validateInterviewLink(packet, interview);
  reasons.push(...interviewReport.reasons);
  warnings.push(...interviewReport.warnings);

  const claimReport = validateDistributionClaims(textForClaimScan(packet), {
    partnershipApproved: false,
    requireExperimentalDisclosure: options.requireExperimentalDisclosure === true
  });
  reasons.push(...claimReport.reasons);
  warnings.push(...claimReport.warnings);

  const redactionFlags = sensitiveFlags(textForSensitiveScan(packet));
  reasons.push(...redactionFlags.map((flag) => flag.reason));

  return {
    valid: reasons.length === 0,
    status: reasons.length === 0 ? "ready_for_pilot_binding" : "needs_authorization_fixes",
    authorizationId: packet.authorizationId || null,
    approvalRef: packet.authorizationId ? `pilot-authorization:${packet.authorizationId}` : null,
    merchantId: merchant.merchantId || null,
    environment: pilot.environment || null,
    network: pilot.network || null,
    paymentRail: pilot.paymentRail || null,
    scope: {
      testEndpoint: pilot.testEndpoint || null,
      pathPrefix: pilot.pathPrefix || null,
      amountUsd: Number(pilot.amountUsd || 0),
      maxRequests: Number(pilot.maxRequests || 0),
      maxTotalSpendUsd: Number(pilot.maxTotalSpendUsd || 0),
      expiresAt: pilot.expiresAt || null,
      receiptLogPath: pilot.receiptLogPath || null
    },
    merchantReadiness,
    interview: interviewReport,
    claimFlags: claimReport.flags,
    redactionFlags,
    reasons: unique(reasons),
    warnings: unique(warnings),
    nextAction:
      reasons.length === 0
        ? "Use approvalRef in the pilot binding, gateway merchant approval, and live pilot preflight packet"
        : "Fix merchant authorization, intake, interview, or safety fields before pilot binding",
    evidenceBoundary: boundary()
  };
}

function validateInterviewLink(packet, interview) {
  const reasons = [];
  const warnings = [];
  const merchantId = packet.merchant?.merchantId || "";

  if (!interview) {
    warnings.push("Linked interview was not loaded for validation");
    return { valid: false, reasons, warnings };
  }
  if (interview.status !== "completed") reasons.push("Linked interview must be completed before pilot authorization");
  if (interview.valid === false) reasons.push("Linked interview validation must pass before pilot authorization");
  if (packet.interviewId && interview.id && packet.interviewId !== interview.id) reasons.push("interviewId must match linked interview id");
  if (packet.merchant?.merchantId && interview.pilotApproval?.merchantId && merchantId !== interview.pilotApproval.merchantId) {
    reasons.push("merchant.merchantId must match interview pilotApproval.merchantId");
  }
  if (interview.pilotApproval?.merchantApprovedTestEndpoint !== true) {
    reasons.push("Linked interview must include pilotApproval.merchantApprovedTestEndpoint=true");
  }
  if (interview.pilotApproval?.testEndpoint && packet.pilot?.testEndpoint && interview.pilotApproval.testEndpoint !== packet.pilot.testEndpoint) {
    reasons.push("pilot.testEndpoint must match interview pilotApproval.testEndpoint");
  }
  return {
    valid: reasons.length === 0,
    id: interview.id || null,
    status: interview.status || null,
    reasons,
    warnings
  };
}

function interviewForPacket(packet, context) {
  if (context.interview) return context.interview;
  const interviews = Array.isArray(context.interviews) ? context.interviews : [];
  return interviews.find((interview) => interview.id === packet.interviewId) || null;
}

function textForClaimScan(packet) {
  return [
    packet.publicSummary,
    packet.notes,
    packet.evidence?.label,
    packet.dispute?.processRef
  ]
    .flat()
    .filter(Boolean)
    .join("\n");
}

function textForSensitiveScan(packet) {
  return [
    packet.authorizationId,
    packet.publicSummary,
    packet.notes,
    packet.merchant?.approverRef,
    packet.pilot?.testEndpoint,
    packet.pilot?.receiptLogPath,
    packet.dispute?.contact,
    packet.dispute?.processRef,
    packet.evidence?.label
  ]
    .flat()
    .filter(Boolean)
    .join("\n");
}

function sensitiveFlags(text) {
  return SENSITIVE_TEXT_PATTERNS.filter((rule) => rule.pattern.test(String(text || ""))).map((rule) => ({
    id: rule.id,
    reason: rule.reason
  }));
}

function requireText(reasons, value, field) {
  if (!String(value || "").trim()) reasons.push(`Missing ${field}`);
}

function requireKnown(reasons, value, allowed, field) {
  if (!allowed.includes(String(value || ""))) reasons.push(`Invalid ${field}`);
}

function requirePositive(reasons, value, field) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) reasons.push(`${field} must be positive`);
}

function isValidDate(value) {
  return Number.isFinite(new Date(value).getTime());
}

function isHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

function unique(values) {
  return [...new Set(values)];
}

function boundary() {
  return {
    startsPilotTraffic: false,
    movesFunds: false,
    signsWalletPayloads: false,
    countsAsPilotEvidence: false,
    approvesPublicClaims: false,
    marksMerchantLive: false,
    storesSecrets: false,
    marksTokenReady: false
  };
}
