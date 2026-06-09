import { buildOutreachDrafts } from "./outreachDrafts.mjs";
import { validateOutreachDrafts } from "./outreachApproval.mjs";

export const OUTREACH_ACTION_PACK_STATUSES = ["ready_for_human_approval", "needs_draft_fixes"];

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

export function buildOutreachActionPack(input = {}, options = {}) {
  const candidates = Array.isArray(input.candidates) ? input.candidates : [];
  const prospects = Array.isArray(input.prospects) ? input.prospects : [];
  const drafts = Array.isArray(input.drafts) ? input.drafts : buildOutreachDrafts(candidates, prospects);
  const validation = validateOutreachDrafts(drafts, options.outreachOptions || {});
  const requestedBy = String(options.requestedBy || "allow-operator").trim();
  const requestedAt = String(options.requestedAt || isoDate()).trim();
  const approvalIdPrefix = String(options.approvalIdPrefix || "merchant_outreach").trim();
  const packets = drafts.map((draft) =>
    buildOutreachExternalActionPacket(draft, {
      requestedBy,
      requestedAt,
      approvalIdPrefix
    })
  );
  const reasons = [...validation.reasons];

  if (drafts.length === 0) reasons.push("No outreach drafts available for action approval");

  return {
    generatedAt: new Date().toISOString(),
    valid: reasons.length === 0,
    status: reasons.length === 0 ? "ready_for_human_approval" : "needs_draft_fixes",
    count: packets.length,
    validDraftCount: validation.validCount,
    reasons,
    warnings: validation.warnings,
    entries: validation.entries,
    packets,
    nextAction:
      reasons.length === 0
        ? "Review each packet with the account owner, then run npm run external-action-approval on the approved packet before sending"
        : "Fix outreach drafts before preparing external action approvals",
    evidenceBoundary: {
      sendsOutreach: false,
      postsContent: false,
      signsWalletPayloads: false,
      startsPilotTraffic: false,
      movesFunds: false,
      storesSecrets: false,
      marksApproved: false,
      requiresHumanApproval: true,
      finalExternalActionApprovalRequired: true
    }
  };
}

export function buildOutreachExternalActionPacket(draft = {}, options = {}) {
  const approvalIdPrefix = String(options.approvalIdPrefix || "merchant_outreach").trim();
  const candidateId = String(draft.candidateId || "candidate").trim();
  const approvalId = `${approvalIdPrefix}_${slug(candidateId)}`;

  return {
    approvalId,
    actionType: "merchant_outreach",
    status: "draft",
    requestedBy: String(options.requestedBy || "allow-operator").trim(),
    requestedAt: String(options.requestedAt || isoDate()).trim(),
    approvedBy: "",
    approvedAt: "",
    action: {
      summary: `Human sends product-feedback ask to ${draft.candidateId || "merchant candidate"}`,
      channel: draft.channel || "",
      destination: draft.destination || "",
      subject: draft.subject || "",
      executionMode: "human_only",
      exactText: draft.message || "",
      automated: false
    },
    approvals: Object.fromEntries(APPROVAL_FLAGS.map((flag) => [flag, false])),
    payload: {
      outreachDraft: draft
    },
    notes: [
      "Generated from review-only outreach drafts.",
      "This packet must remain draft until the account owner reviews the exact message and sets every approval flag.",
      "Run npm run external-action-approval on the approved packet before any human sends the message."
    ]
  };
}

function slug(value) {
  const text = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return text || "candidate";
}

function isoDate() {
  return new Date().toISOString().slice(0, 10);
}
