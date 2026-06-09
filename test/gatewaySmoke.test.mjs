import assert from "node:assert/strict";
import { runLocalGatewaySmoke } from "../src/gatewaySmoke.mjs";
import { DEFAULT_POLICY, policyFingerprint } from "../src/policyEngine.mjs";
import { demoPolicySignature } from "../src/policyVerifier.mjs";

const smoke = await runLocalGatewaySmoke({
  name: "allow-smoke-test",
  upstream: {
    baseUrl: "https://upstream.example"
  },
  evidence: {
    environment: "local",
    merchantApproved: false,
    rail: "demo",
    network: "local",
    label: "local-gateway-smoke"
  },
  routes: [
    {
      pathPrefix: "/paid-search",
      merchantId: "mcp_search",
      amountUsd: 0.018
    }
  ]
});

assert.equal(smoke.valid, true);
assert.equal(smoke.gateway, "allow-smoke-test");
assert.equal(smoke.route.merchantId, "mcp_search");
assert.equal(smoke.results.health.status, 200);
assert.equal(smoke.results.allowed.status, 200);
assert.equal(smoke.results.allowed.headers["x-allow-decision"], "allow");
assert.equal(smoke.results.denied.status, 402);
assert.equal(smoke.upstreamCalls.length, 1);
assert.equal(smoke.receipts.length, 2);
assert.deepEqual(
  smoke.receipts.map((receipt) => receipt.decision),
  ["allow", "deny"]
);
assert.ok(smoke.warnings[0].includes("not merchant-approved pilot evidence"));

const customSmoke = await runLocalGatewaySmoke(
  {
    name: "allow-custom-merchant-smoke-test",
    upstream: {
      baseUrl: "https://research.example"
    },
    evidence: {
      environment: "local",
      merchantApproved: false,
      rail: "demo",
      network: "local",
      label: "local-custom-merchant-smoke"
    },
    routes: [
      {
        pathPrefix: "/v1/search",
        merchantId: "research_api",
        amountUsd: 0.25
      }
    ]
  },
  {
    policy: signedDemoPolicy({
      ...DEFAULT_POLICY,
      spentTodayUsd: 0,
      allowedMerchants: ["research_api"],
      perTxCapUsd: 0.25,
      dailyCapUsd: 2
    }),
    merchants: [
      {
        id: "research_api",
        name: "Research API",
        domain: "research.example",
        category: "research",
        trustScore: 91,
        defaultPriceUsd: 0.25,
        riskTags: ["query_text"]
      }
    ]
  }
);

assert.equal(customSmoke.valid, true);
assert.equal(customSmoke.route.merchantId, "research_api");
assert.equal(customSmoke.results.allowed.headers["x-allow-decision"], "allow");

const failedSmoke = await runLocalGatewaySmoke({
  name: "allow-smoke-test",
  upstream: {
    baseUrl: "https://upstream.example"
  },
  settlement: {
    required: true,
    chain: "Base",
    asset: "USDC",
    proofType: "mock"
  },
  routes: [
    {
      pathPrefix: "/paid-search",
      merchantId: "mcp_search",
      amountUsd: 0.018
    }
  ]
});

assert.equal(failedSmoke.valid, false);
assert.equal(failedSmoke.results.allowed.status, 402);
assert.equal(failedSmoke.upstreamCalls.length, 0);

console.log("gatewaySmoke tests passed");

function signedDemoPolicy(policyInput) {
  return {
    ...policyInput,
    controllerSignature: demoPolicySignature(policyFingerprint(policyInput))
  };
}
