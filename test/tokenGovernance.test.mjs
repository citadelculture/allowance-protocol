import assert from "node:assert/strict";
import { buildTokenGovernanceReport } from "../src/tokenGovernance.mjs";

const lockedManifest = {
  manifestId: "token_lock",
  phase: "locked",
  generatedAt: "2026-06-08",
  owner: "allow-operator",
  publicSummary: "Allow has no token at launch. Token plans are subject to legal review.",
  token: {
    launchEnabled: false,
    transferable: false,
    salePlanned: false,
    airdropPlanned: false,
    liquidityPlanned: false,
    marketMakingPlanned: false,
    influencerPromotionPlanned: false,
    returnClaimsPlanned: false
  },
  usageThresholds: {
    minActiveAgents: 100,
    minMerchants: 50,
    minCredibleReceipts: 10000,
    minThirdPartyReceiptSharePct: 20
  },
  usageEvidence: {
    thirdPartyReceiptSharePct: 0
  }
};

const emptyMetrics = {
  pilotEvidence: {
    activeAgentsWithCredibleEvidence: 0,
    credibleMerchantsWithReceipts: [],
    crediblePolicyDecisions: 0
  }
};

const locked = buildTokenGovernanceReport(lockedManifest, emptyMetrics);
assert.equal(locked.valid, true);
assert.equal(locked.readyForLegalReview, false);
assert.equal(locked.tokenLaunchPermitted, false);
assert.ok(locked.warnings.some((warning) => warning.includes("Token legal review requires")));

const unsafeToken = buildTokenGovernanceReport(
  {
    ...lockedManifest,
    token: {
      ...lockedManifest.token,
      launchEnabled: true
    }
  },
  emptyMetrics
);
assert.equal(unsafeToken.valid, false);
assert.ok(unsafeToken.reasons.includes("token.launchEnabled must be false"));

const hype = buildTokenGovernanceReport(
  {
    ...lockedManifest,
    publicSummary: "Allow token presale will be a 100x investment opportunity."
  },
  emptyMetrics
);
assert.equal(hype.valid, false);
assert.ok(hype.reasons.includes("Do not promote a token, airdrop, presale, or whitelist"));

const legalReadyManifest = {
  ...lockedManifest,
  phase: "legal_review_ready",
  usageEvidence: {
    thirdPartyReceiptSharePct: 25,
    evidenceBundleRef: "evidence-bundle:token-usage"
  },
  legal: {
    counselRef: "legal-review:outside-counsel",
    riskDisclosureRef: "docs/token-risk-disclosure"
  },
  governance: {
    treasuryMultisig: "0x1111111111111111111111111111111111111111",
    allocationPolicyRef: "governance:allocation-policy"
  },
  approvals: {
    independentCounselEngaged: true,
    riskDisclosuresReady: true,
    treasuryMultisigReady: true,
    independentContractReviewReady: true,
    externalActionApprovalPrepared: true,
    evidenceBundlePrepared: true
  }
};
const usageMetrics = {
  pilotEvidence: {
    activeAgentsWithCredibleEvidence: 100,
    credibleMerchantsWithReceipts: Array.from({ length: 50 }, (_, index) => `merchant_${index}`),
    crediblePolicyDecisions: 10000
  }
};

const legalReady = buildTokenGovernanceReport(legalReadyManifest, usageMetrics);
assert.equal(legalReady.valid, true);
assert.equal(legalReady.readyForLegalReview, true);
assert.equal(legalReady.tokenLaunchPermitted, false);

const missingReceipts = buildTokenGovernanceReport(
  legalReadyManifest,
  {
    pilotEvidence: {
      activeAgentsWithCredibleEvidence: 100,
      credibleMerchantsWithReceipts: Array.from({ length: 50 }, (_, index) => `merchant_${index}`),
      crediblePolicyDecisions: 9999
    }
  }
);
assert.equal(missingReceipts.valid, false);
assert.ok(missingReceipts.reasons.includes("Token legal review requires at least 10000 credible receipts"));

const missingLegalFlag = buildTokenGovernanceReport(
  {
    ...legalReadyManifest,
    approvals: {
      ...legalReadyManifest.approvals,
      independentCounselEngaged: false
    }
  },
  usageMetrics
);
assert.equal(missingLegalFlag.valid, false);
assert.ok(missingLegalFlag.reasons.includes("approvals.independentCounselEngaged must be true"));

console.log("tokenGovernance tests passed");
