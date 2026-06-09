import assert from "node:assert/strict";
import {
  DEFAULT_POLICY,
  evaluatePaymentIntent,
  detectMetadataRisk,
  hasReceiptReplay,
  intentHash,
  mergeMerchantCatalog,
  policyFingerprint,
  resolvePolicyId,
  stableHash
} from "../src/policyEngine.mjs";
import { intentFromHeaders, preflightPayment } from "../src/httpPreflight.mjs";
import { demoPolicySignature } from "../src/policyVerifier.mjs";

const policy = { ...DEFAULT_POLICY, spentTodayUsd: 0 };

const allowed = evaluatePaymentIntent(
  {
    merchantId: "mcp_search",
    amountUsd: 0.018,
    resource: "/v1/search?q=x402",
    intentNonce: "test-search-001",
    metadata: "public query"
  },
  policy,
  []
);

assert.equal(allowed.decision, "allow");
assert.equal(allowed.receipt.amountUsd, 0.018);
assert.ok(allowed.receipt.id.startsWith("allow_"));
assert.equal(allowed.receipt.policyId, "allow_policy_demo_alpha");
assert.equal(allowed.receipt.intentNonce, "test-search-001");
assert.equal(allowed.receipt.policySignatureMode, "demo");
assert.equal(hasReceiptReplay([allowed.receipt], resolvePolicyId(policy), "test-search-001", allowed.receipt.intentHash), true);
assert.ok(policyFingerprint(policy));

const replayed = evaluatePaymentIntent(
  {
    merchantId: "mcp_search",
    amountUsd: 0.018,
    resource: "/v1/search?q=x402",
    intentNonce: "test-search-001",
    metadata: "public query"
  },
  policy,
  [allowed.receipt]
);

assert.equal(replayed.decision, "deny");
assert.ok(replayed.reasons.includes("Intent nonce already used for this policy"));

const overCap = evaluatePaymentIntent(
  {
    merchantId: "vector_cloud",
    amountUsd: 99,
    resource: "/v1/embed/batch",
    intentNonce: "test-vector-001",
    metadata: "large job"
  },
  policy,
  []
);

assert.equal(overCap.decision, "deny");
assert.ok(overCap.reasons.some((reason) => reason.includes("per-transaction cap")));

const pii = evaluatePaymentIntent(
  {
    merchantId: "lead_graph",
    amountUsd: 0.35,
    resource: "/v1/leads/export",
    intentNonce: "test-leads-001",
    metadata: "ship to sam@example.com"
  },
  policy,
  []
);

assert.equal(pii.decision, "deny");
assert.deepEqual(detectMetadataRisk("seed phrase and 0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"), [
  "private_key",
  "seed_phrase"
]);

const trading = evaluatePaymentIntent(
  {
    merchantId: "wallet_swapper",
    amountUsd: 1,
    resource: "/swap/quote",
    intentNonce: "test-swap-001",
    metadata: "rebalance"
  },
  policy,
  []
);

assert.equal(trading.decision, "deny");
assert.equal(stableHash("allow"), stableHash("allow"));
assert.equal(intentHash({ merchantId: "mcp_search", amountUsd: 0.02, resource: "/v1/search", metadata: "public", intentNonce: "n1" }, policy), intentHash({ merchantId: "mcp_search", amountUsd: 0.02, resource: "/v1/search", metadata: "public", intentNonce: "n1" }, policy));

const missingNonce = evaluatePaymentIntent(
  {
    merchantId: "mcp_search",
    amountUsd: 0.02,
    resource: "/v1/search",
    metadata: "public"
  },
  policy,
  []
);

assert.equal(missingNonce.decision, "deny");
assert.ok(missingNonce.reasons.includes("Missing intent nonce for replay protection"));

const intent = intentFromHeaders({
  "X-Allow-Merchant": "mcp_search",
  "X-Allow-Amount-Usd": "0.02",
  "X-Allow-Resource": "/v1/search",
  "X-Allow-Nonce": "preflight-001",
  "X-Allow-Metadata": "public",
  "X-Allow-Agent": "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf",
  "X-Allow-Agent-Signature": "0xsigned",
  "X-Allow-Agent-Signature-Mode": "eip712"
});

assert.equal(intent.merchantId, "mcp_search");
assert.equal(intent.amountUsd, 0.02);
assert.equal(intent.intentNonce, "preflight-001");
assert.equal(intent.agentAddress, "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf");
assert.equal(intent.agentSignature, "0xsigned");
assert.equal(intent.agentSignatureMode, "eip712");

const invalidSignedPreflight = preflightPayment({ intent, policy });
assert.equal(invalidSignedPreflight.status, 402);
assert.ok(invalidSignedPreflight.body.evaluation.reasons.includes("Missing EIP-712 agent intent recovery function"));

const preflight = preflightPayment({
  intent: {
    merchantId: "mcp_search",
    amountUsd: 0.02,
    resource: "/v1/search",
    intentNonce: "preflight-clean-001",
    metadata: "public"
  },
  policy
});
assert.equal(preflight.status, 200);
assert.equal(preflight.headers["x-allow-decision"], "allow");

const researchMerchant = {
  id: "research_api",
  name: "Research API",
  domain: "research.example",
  category: "research",
  trustScore: 91,
  defaultPriceUsd: 0.25,
  riskTags: ["query_text"]
};
const researchPolicy = signedDemoPolicy({
  ...policy,
  allowedMerchants: ["research_api"],
  perTxCapUsd: 0.25,
  dailyCapUsd: 2
});
const researchAllowed = evaluatePaymentIntent(
  {
    merchantId: "research_api",
    amountUsd: 0.25,
    resource: "/v1/search",
    intentNonce: "research-custom-001",
    metadata: "public query"
  },
  researchPolicy,
  [],
  { merchants: [researchMerchant] }
);

assert.equal(researchAllowed.decision, "allow");
assert.equal(researchAllowed.receipt.merchantName, "Research API");
assert.equal(mergeMerchantCatalog([researchMerchant]).some((merchant) => merchant.id === "research_api"), true);

const researchWithoutCatalog = evaluatePaymentIntent(
  {
    merchantId: "research_api",
    amountUsd: 0.25,
    resource: "/v1/search",
    intentNonce: "research-custom-002",
    metadata: "public query"
  },
  researchPolicy,
  []
);

assert.equal(researchWithoutCatalog.decision, "deny");
assert.ok(researchWithoutCatalog.reasons.includes("Unknown merchant"));

const blockedPreflight = preflightPayment({
  intent: {
    merchantId: "lead_graph",
    amountUsd: 0.35,
    resource: "/v1/leads",
    intentNonce: "preflight-blocked-001",
    metadata: "email alex@example.com"
  },
  policy
});

assert.equal(blockedPreflight.status, 402);
assert.equal(blockedPreflight.headers["x-allow-decision"], "deny");

console.log("policyEngine tests passed");

function signedDemoPolicy(policyInput) {
  return {
    ...policyInput,
    controllerSignature: demoPolicySignature(policyFingerprint(policyInput))
  };
}
