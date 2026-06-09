import assert from "node:assert/strict";
import { buildMerchantPromotionReport } from "../src/merchantPromotion.mjs";
import { signMerchantProfileWithPrivateKey } from "../src/merchantProfileSigner.mjs";

const baseProfile = {
  id: "research_api",
  name: "Research API",
  status: "live",
  surfaces: ["x402_preflight"],
  endpoint: {
    type: "api",
    baseUrl: "https://research.example",
    testPath: "/v1/search"
  },
  pricing: {
    model: "per_request",
    unitUsd: 0.25,
    currency: "USD"
  },
  payment: {
    protocol: "x402",
    asset: "USDC",
    chain: "Base"
  },
  risk: {
    dataHandlingClass: "sensitive",
    sensitiveMetadataClasses: ["query_text"],
    riskTags: ["query_text", "looped_agent_calls"]
  },
  receipts: {
    supported: true,
    fields: ["policyId", "merchantId", "amountUsd", "intentHash", "intentNonce", "metadataHash"]
  },
  refundRules: "Pilot refunds and disputes are handled by written merchant agreement.",
  disputeContact: "@casey",
  publicProof: "https://research.example/allow-proof",
  lastReviewedAt: "2026-06-08"
};

const signed = await signMerchantProfileWithPrivateKey(
  baseProfile,
  "0x0000000000000000000000000000000000000000000000000000000000000001"
);
const directory = {
  version: "0.1",
  generatedAt: "2026-06-08",
  merchants: [
    {
      ...baseProfile,
      status: "pilot_ready",
      publicProof: ""
    }
  ]
};
const records = [
  {
    merchantId: "research_api",
    decision: "allow",
    upstreamStatus: 200,
    evidence: {
      environment: "testnet",
      merchantApproved: true,
      rail: "x402",
      network: "eip155:84532"
    },
    receipt: {
      id: "allow_1",
      agentId: "agent-alpha",
      merchantId: "research_api",
      decision: "allow",
      amountUsd: 0.25
    }
  },
  {
    merchantId: "research_api",
    decision: "deny",
    evidence: {
      environment: "testnet",
      merchantApproved: true,
      rail: "x402",
      network: "eip155:84532"
    },
    receipt: {
      id: "deny_1",
      agentId: "agent-alpha",
      merchantId: "research_api",
      decision: "deny",
      amountUsd: 0.25
    }
  }
];
const disclosurePacket = {
  disclosureId: "pilot_disclosure_001",
  status: "approved",
  generatedAt: "2026-06-08",
  merchantId: "research_api",
  evidenceRef: "pilot-disclosure:pilot_disclosure_001",
  publicSummary: "Allow completed 2 merchant-approved testnet policy decisions for this pilot.",
  receiptIds: ["allow_1", "deny_1"],
  metrics: {
    environment: "testnet",
    policyDecisions: 2,
    crediblePolicyDecisions: 2,
    allowedReceipts: 1,
    deniedReceipts: 1,
    activeAgents: 1,
    blockedValueUsd: 0.25
  },
  merchantApproval: {
    approved: true,
    merchantId: "research_api",
    approvedAt: "2026-06-08",
    approverRef: "@merchant-reviewer",
    scope: ["public_metrics", "merchant_directory"],
    partnerClaimApproved: false,
    statement: "Approved for public directory evidence."
  },
  redaction: {
    rawMetadataRemoved: true,
    personalDataRemoved: true,
    secretsRemoved: true,
    receiptIdsOnly: true
  },
  redactedReceipts: [
    { id: "allow_1", decision: "allow", upstreamStatus: 200, reasonCategory: "policy_allowed" },
    { id: "deny_1", decision: "deny", upstreamStatus: null, reasonCategory: "metadata_risk_blocked" }
  ]
};
const promotion = {
  promotionId: "merchant_promotion_001",
  merchantId: "research_api",
  targetStatus: "live",
  approvedAt: "2026-06-08",
  approverRef: "@merchant-reviewer",
  publicProof: "https://research.example/allow-proof",
  evidenceRef: "pilot-disclosure:pilot_disclosure_001",
  approvals: {
    merchantApprovedLiveListing: true,
    operatorReviewedNoTokenClaims: true,
    publicProofReviewed: true,
    profileSignatureReviewed: true
  },
  merchantProfile: signed.profile
};

const valid = await buildMerchantPromotionReport({
  promotion,
  directory,
  disclosurePacket,
  receiptRecords: records
});
assert.equal(valid.valid, true);
assert.deepEqual(valid.reasons, []);
assert.equal(valid.signatureValidation.valid, true);
assert.equal(valid.disclosureReport.valid, true);

const missingScope = await buildMerchantPromotionReport({
  promotion,
  directory,
  disclosurePacket: {
    ...disclosurePacket,
    merchantApproval: {
      ...disclosurePacket.merchantApproval,
      scope: ["public_metrics"]
    }
  },
  receiptRecords: records
});
assert.equal(missingScope.valid, false);
assert.ok(missingScope.reasons.includes("Pilot disclosure merchantApproval.scope must include merchant_directory"));

const tamperedProfile = await buildMerchantPromotionReport({
  promotion: {
    ...promotion,
    merchantProfile: {
      ...signed.profile,
      pricing: {
        ...signed.profile.pricing,
        unitUsd: 0.99
      }
    }
  },
  directory,
  disclosurePacket,
  receiptRecords: records
});
assert.equal(tamperedProfile.valid, false);
assert.ok(tamperedProfile.reasons.some((reason) => reason.includes("Merchant profile signature:")));

const unapprovedFlags = await buildMerchantPromotionReport({
  promotion: {
    ...promotion,
    approvals: {
      ...promotion.approvals,
      publicProofReviewed: false
    }
  },
  directory,
  disclosurePacket,
  receiptRecords: records
});
assert.equal(unapprovedFlags.valid, false);
assert.ok(unapprovedFlags.reasons.includes("promotion.approvals.publicProofReviewed must be true"));

const localDisclosure = await buildMerchantPromotionReport({
  promotion,
  directory,
  disclosurePacket,
  receiptRecords: records.map((record) => ({
    ...record,
    evidence: {
      environment: "local",
      merchantApproved: false,
      rail: "x402",
      network: "eip155:84532"
    }
  }))
});
assert.equal(localDisclosure.valid, false);
assert.ok(localDisclosure.reasons.some((reason) => reason.includes("Pilot disclosure: Receipt")));

console.log("merchantPromotion tests passed");
