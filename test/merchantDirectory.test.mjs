import assert from "node:assert/strict";
import {
  merchantDirectoryEntryFromIntake,
  summarizeMerchantDirectory,
  validateMerchantDirectory,
  validateMerchantDirectoryEntry,
  validateMerchantDirectorySignatures
} from "../src/merchantDirectory.mjs";
import { signMerchantProfileWithPrivateKey } from "../src/merchantProfileSigner.mjs";

const validEntry = {
  id: "research_api",
  name: "Research API",
  status: "pilot_ready",
  surfaces: ["x402_preflight", "mcp_guard"],
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
    riskTags: ["looped_agent_calls"]
  },
  receipts: {
    supported: true,
    fields: ["policyId", "merchantId", "amountUsd", "intentHash", "intentNonce", "metadataHash"]
  },
  refundRules: "Pilot refunds and disputes are handled by written merchant agreement.",
  disputeContact: "@casey",
  publicProof: "",
  lastReviewedAt: "2026-06-08",
  notes: "Potential public case study."
};

const entryValidation = validateMerchantDirectoryEntry(validEntry, { now: "2026-06-08" });
assert.equal(entryValidation.valid, true);
assert.deepEqual(entryValidation.reasons, []);

const directory = {
  version: "0.1",
  generatedAt: "2026-06-08",
  merchants: [
    validEntry,
    {
      ...validEntry,
      id: "mcp_search",
      name: "MCP Search Index",
      status: "candidate",
      surfaces: ["wallet_policy_hook"],
      pricing: {
        model: "per_request",
        unitUsd: 0.018,
        currency: "USD"
      },
      risk: {
        dataHandlingClass: "low",
        sensitiveMetadataClasses: [],
        riskTags: ["metered"]
      }
    }
  ]
};

const validation = validateMerchantDirectory(directory, { now: "2026-06-08" });
assert.equal(validation.valid, true);
assert.equal(validation.entries.length, 2);

const summary = summarizeMerchantDirectory(directory, { now: "2026-06-08" });
assert.equal(summary.valid, true);
assert.equal(summary.merchantCount, 2);
assert.equal(summary.readyMerchantCount, 1);
assert.deepEqual(summary.readyMerchants, ["research_api"]);
assert.equal(summary.statusCounts.candidate, 1);
assert.equal(summary.surfaceCounts.wallet_policy_hook, 1);
assert.equal(summary.averageUnitUsd, 0.134);

const signedLive = await signMerchantProfileWithPrivateKey(
  {
    ...validEntry,
    status: "live",
    publicProof: "https://research.example/allow-proof"
  },
  "0x0000000000000000000000000000000000000000000000000000000000000001"
);

const liveSignatureValidation = await validateMerchantDirectorySignatures({
  version: "0.1",
  merchants: [signedLive.profile]
});

assert.equal(liveSignatureValidation.valid, true);
assert.equal(liveSignatureValidation.checkedCount, 1);
assert.equal(liveSignatureValidation.entries[0].recoveredSigner, signedLive.signer);

const tamperedLiveSignatureValidation = await validateMerchantDirectorySignatures({
  version: "0.1",
  merchants: [
    {
      ...signedLive.profile,
      pricing: {
        ...signedLive.profile.pricing,
        unitUsd: 0.99
      }
    }
  ]
});

assert.equal(tamperedLiveSignatureValidation.valid, false);
assert.ok(tamperedLiveSignatureValidation.reasons.some((reason) => reason.includes("research_api:")));

const invalid = validateMerchantDirectory({
  version: "0.1",
  merchants: [
    {
      id: "bad",
      status: "live",
      endpoint: { baseUrl: "not a url" },
      pricing: { unitUsd: 0 },
      payment: {},
      risk: {},
      receipts: { supported: false }
    }
  ]
});

assert.equal(invalid.valid, false);
assert.ok(invalid.reasons.some((reason) => reason.includes("bad: Missing name")));
assert.ok(invalid.reasons.some((reason) => reason.includes("bad: endpoint.baseUrl must be a valid URL")));

const intakeEntry = merchantDirectoryEntryFromIntake(
  {
    merchantId: "wallet_guarded_api",
    name: "Wallet Guarded API",
    website: "https://wallet.example",
    contact: { emailOrHandle: "@wallet" },
    service: {
      endpointType: "api",
      pricingModel: "per_request",
      examplePriceUsd: 0.05
    },
    agentPaymentFit: {
      expectsAgentUsers: true,
      currentX402Support: false,
      currentMcpSupport: true,
      needsSpendCaps: true,
      needsMetadataFilters: true,
      needsReplayProtection: true,
      needsReceipts: true
    },
    risk: {
      sensitiveMetadataClasses: [],
      abuseModes: ["looped_agent_calls"],
      maxSafeTestSpendUsd: 1
    },
    integration: {
      preferredSurface: "wallet_policy_hook",
      canTestThisWeek: true,
      testEndpoint: "https://wallet.example/pay",
      successMetric: "public demo"
    }
  },
  { reviewedAt: "2026-06-08" }
);

assert.equal(intakeEntry.status, "pilot_ready");
assert.deepEqual(intakeEntry.surfaces, ["wallet_policy_hook"]);
assert.equal(intakeEntry.payment.protocol, "wallet");
assert.equal(intakeEntry.disputeContact, "@wallet");

console.log("merchantDirectory tests passed");
