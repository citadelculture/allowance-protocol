import { validateMerchantDirectoryEntry } from "./merchantDirectory.mjs";
import { verifyMerchantProfileSignatureAsync } from "./merchantProfileSigner.mjs";
import { buildPilotDisclosureReport } from "./pilotDisclosure.mjs";

export const MERCHANT_PROMOTION_TARGET_STATUSES = ["live"];

export async function buildMerchantPromotionReport(input = {}, options = {}) {
  const reasons = [];
  const warnings = [];

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {
      valid: false,
      reasons: ["Merchant promotion input must be a JSON object"],
      warnings: [],
      evidenceBoundary: boundary()
    };
  }

  const promotion = input.promotion || {};
  const directory = input.directory || {};
  const disclosurePacket = input.disclosurePacket || {};
  const receiptRecords = input.receiptRecords || [];
  const merchantId = String(promotion.merchantId || "").trim();
  const directoryEntry = findMerchant(directory, merchantId);
  const merchantProfile = promotion.merchantProfile || directoryEntry || {};

  requireText(reasons, promotion.promotionId, "promotion.promotionId");
  requireText(reasons, merchantId, "promotion.merchantId");
  requireKnown(reasons, promotion.targetStatus, MERCHANT_PROMOTION_TARGET_STATUSES, "promotion.targetStatus");
  requireText(reasons, promotion.publicProof, "promotion.publicProof");
  requireText(reasons, promotion.evidenceRef, "promotion.evidenceRef");
  requireText(reasons, promotion.approvedAt, "promotion.approvedAt");
  requireText(reasons, promotion.approverRef, "promotion.approverRef");

  if (promotion.approvedAt && !isValidDate(promotion.approvedAt)) reasons.push("promotion.approvedAt must be a valid date");
  validateApprovalFlags(reasons, promotion.approvals || {});
  validateUrl(reasons, promotion.publicProof, "promotion.publicProof");

  if (!directoryEntry) {
    reasons.push(`Merchant ${merchantId || "(missing)"} is not present in the directory`);
  } else if (!["pilot_ready", "live"].includes(directoryEntry.status)) {
    reasons.push(`Merchant ${merchantId} must be pilot_ready or live before live promotion`);
  }

  if (merchantProfile?.id && merchantId && merchantProfile.id !== merchantId) {
    reasons.push("promotion.merchantProfile.id must match promotion.merchantId");
  }
  if (merchantProfile?.status !== "live") reasons.push("promotion.merchantProfile.status must be live");
  if (merchantProfile?.publicProof !== promotion.publicProof) {
    reasons.push("promotion.publicProof must match merchantProfile.publicProof");
  }

  const entryValidation = validateMerchantDirectoryEntry(merchantProfile, options.directoryOptions || {});
  reasons.push(...entryValidation.reasons.map((reason) => `Merchant profile: ${reason}`));
  warnings.push(...entryValidation.warnings.map((warning) => `Merchant profile: ${warning}`));

  const signatureValidation = await verifyMerchantProfileSignatureAsync(merchantProfile, {
    requireSignature: true,
    mode: merchantProfile?.signatureMode,
    recoverSigner: options.recoverMerchantSigner
  });
  reasons.push(...signatureValidation.reasons.map((reason) => `Merchant profile signature: ${reason}`));
  warnings.push(...signatureValidation.warnings.map((warning) => `Merchant profile signature: ${warning}`));

  const disclosureReport = buildPilotDisclosureReport(disclosurePacket, receiptRecords, {
    requireApproved: true,
    minimumActiveAgents: options.minimumActiveAgents || 1,
    requireExperimentalDisclosure: options.requireExperimentalDisclosure
  });
  reasons.push(...disclosureReport.reasons.map((reason) => `Pilot disclosure: ${reason}`));
  warnings.push(...disclosureReport.warnings.map((warning) => `Pilot disclosure: ${warning}`));

  if (disclosurePacket?.merchantId && merchantId && disclosurePacket.merchantId !== merchantId) {
    reasons.push("Disclosure merchantId must match promotion merchantId");
  }
  if (disclosurePacket?.evidenceRef && promotion.evidenceRef && disclosurePacket.evidenceRef !== promotion.evidenceRef) {
    reasons.push("promotion.evidenceRef must match disclosure evidenceRef");
  }
  if (!disclosureReport.approval?.scope?.includes("merchant_directory")) {
    reasons.push("Pilot disclosure merchantApproval.scope must include merchant_directory");
  }

  return {
    valid: reasons.length === 0,
    promotionId: promotion.promotionId || null,
    merchantId: merchantId || null,
    targetStatus: promotion.targetStatus || null,
    publicProof: promotion.publicProof || null,
    evidenceRef: promotion.evidenceRef || null,
    directoryEntry: directoryEntry
      ? {
          id: directoryEntry.id,
          status: directoryEntry.status,
          publicProof: directoryEntry.publicProof || null
        }
      : null,
    merchantProfile: {
      id: merchantProfile?.id || null,
      status: merchantProfile?.status || null,
      signer: merchantProfile?.signer || null,
      signatureMode: merchantProfile?.signatureMode || null
    },
    signatureValidation,
    disclosureReport,
    reasons: unique(reasons),
    warnings: unique(warnings),
    evidenceBoundary: boundary()
  };
}

function findMerchant(directory = {}, merchantId = "") {
  if (!merchantId || !Array.isArray(directory.merchants)) return null;
  return directory.merchants.find((merchant) => merchant?.id === merchantId) || null;
}

function validateApprovalFlags(reasons, approvals) {
  for (const field of [
    "merchantApprovedLiveListing",
    "operatorReviewedNoTokenClaims",
    "publicProofReviewed",
    "profileSignatureReviewed"
  ]) {
    if (approvals[field] !== true) reasons.push(`promotion.approvals.${field} must be true`);
  }
}

function requireText(reasons, value, field) {
  if (!String(value || "").trim()) reasons.push(`Missing ${field}`);
}

function requireKnown(reasons, value, allowed, field) {
  if (!allowed.includes(String(value || ""))) reasons.push(`Invalid ${field}`);
}

function validateUrl(reasons, value, field) {
  if (!String(value || "").trim()) return;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") reasons.push(`${field} must use https`);
  } catch {
    reasons.push(`${field} must be a valid URL`);
  }
}

function isValidDate(value) {
  return Number.isFinite(new Date(value).getTime());
}

function unique(values) {
  return [...new Set(values)];
}

function boundary() {
  return {
    updatesDirectory: false,
    publishesContent: false,
    contactsMerchant: false,
    movesFunds: false,
    storesSecrets: false,
    requiresMerchantApprovalBeforeLiveListing: true
  };
}
