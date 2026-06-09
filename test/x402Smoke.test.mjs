import assert from "node:assert/strict";
import {
  paymentPayloadRequirementMismatches,
  runX402FacilitatorSmoke,
  syntheticPaymentSignature,
  validateX402LiveReadiness,
  x402SettlementRoutes
} from "../src/x402Smoke.mjs";

const paymentRequirements = {
  scheme: "exact",
  network: "eip155:84532",
  asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  amount: "1000",
  payTo: "0x122F8Fcaf2152420445Aa424E1D8C0306935B5c9",
  maxTimeoutSeconds: 60,
  extra: {
    name: "USDC",
    version: "2"
  }
};
const config = {
  upstream: {
    baseUrl: "https://merchant.example"
  },
  settlement: {
    required: true,
    chain: "Base Sepolia",
    asset: "USDC",
    proofType: "x402-facilitator",
    paymentRequirements
  },
  routes: [
    {
      pathPrefix: "/paid-search",
      merchantId: "mcp_search",
      amountUsd: 0.001
    }
  ]
};

const routes = x402SettlementRoutes(config);
assert.equal(routes.length, 1);
assert.equal(routes[0].pathPrefix, "/paid-search");

const dryRun = await runX402FacilitatorSmoke({ config });
assert.equal(dryRun.valid, true);
assert.equal(dryRun.mode, "dry_run");
assert.equal(dryRun.results[0].syntheticPayment, true);
assert.equal(dryRun.results[0].liveReadiness.valid, false);
assert.equal(dryRun.results[0].liveReadiness.enforced, false);
assert.ok(dryRun.results[0].liveReadiness.reasons.includes("Live x402 payment requirements need merchantApproval.approved=true"));
assert.equal(dryRun.results[0].plannedRequest.body.paymentRequirements.amount, "1000");
assert.equal(dryRun.results[0].plannedRequest.body.paymentPayload.payload.signaturePresent, true);
assert.ok(dryRun.results[0].warnings.includes("Dry run skipped facilitator URL requirement"));

const signature = syntheticPaymentSignature({
  config: {
    upstream: {
      baseUrl: "https://merchant.example"
    }
  },
  route: routes[0],
  paymentRequirements
});
const dryRunWithSignature = await runX402FacilitatorSmoke({
  config,
  paymentSignature: signature
});
assert.equal(dryRunWithSignature.valid, true);
assert.equal(dryRunWithSignature.results[0].syntheticPayment, false);

const mismatchedSignature = syntheticPaymentSignature({
  config,
  route: routes[0],
  paymentRequirements: {
    ...paymentRequirements,
    amount: "2000"
  }
});
const mismatch = await runX402FacilitatorSmoke({
  config,
  paymentSignature: mismatchedSignature
});
assert.equal(mismatch.valid, false);
assert.ok(mismatch.results[0].reasons.includes("x402 payment amount does not match route requirements"));

assert.deepEqual(
  paymentPayloadRequirementMismatches(
    {
      accepted: {
        ...paymentRequirements,
        network: "eip155:8453"
      }
    },
    paymentRequirements
  ),
  ["x402 payment network does not match route requirements"]
);

const missingSignature = await runX402FacilitatorSmoke({
  config,
  env: {
    ALLOW_X402_LIVE: "1",
    ALLOW_X402_FACILITATOR_URL: "https://facilitator.example"
  }
});
assert.equal(missingSignature.valid, false);
assert.ok(missingSignature.results[0].reasons.includes("Missing live x402 payment signature"));
assert.ok(missingSignature.results[0].reasons.includes("Live x402 route evidence must be merchant-approved"));

const calls = [];
const liveConfig = {
  ...config,
  evidence: {
    environment: "testnet",
    merchantApproved: true,
    rail: "x402",
    network: "eip155:84532",
    label: "merchant-approved-live-smoke"
  },
  settlement: {
    ...config.settlement,
    settle: true,
    merchantApproval: {
      approved: true,
      merchantId: "mcp_search",
      approvedAt: "2026-06-08",
      source: "merchant-email:casey-2026-06-08"
    }
  }
};
const liveSignature = Buffer.from(
  JSON.stringify({
    x402Version: 2,
    accepted: paymentRequirements,
    payload: {
      signature: "0xlive-payment-signature",
      authorization: {
        from: "0x0000000000000000000000000000000000000001",
        to: paymentRequirements.payTo,
        value: paymentRequirements.amount,
        validAfter: "0",
        validBefore: "60",
        nonce: "0x0000000000000000000000000000000000000000000000000000000000000042"
      }
    },
    resource: {
      url: "https://merchant.example/paid-search",
      description: "Allow live smoke payment for mcp_search",
      mimeType: "application/json"
    }
  })
).toString("base64url");
const directLiveReadiness = validateX402LiveReadiness({
  route: {
    ...routes[0],
    evidence: liveConfig.evidence
  },
  settlement: liveConfig.settlement,
  facilitator: {
    baseUrl: "https://facilitator.example",
    verifyPath: "/verify",
    settlePath: "/settle",
    supportedPath: "/supported",
    timeoutMs: 10000,
    settle: true,
    bearerToken: "secret"
  },
  paymentRequirements,
  paymentPayload: JSON.parse(Buffer.from(liveSignature, "base64url").toString("utf8")),
  paymentSignature: liveSignature,
  live: true
});
assert.equal(directLiveReadiness.valid, true);
assert.equal(directLiveReadiness.settleRequested, true);

const live = await runX402FacilitatorSmoke({
  config: liveConfig,
  live: true,
  paymentSignature: liveSignature,
  env: {
    ALLOW_X402_FACILITATOR_URL: "https://facilitator.example",
    ALLOW_X402_SETTLE: "1",
    ALLOW_X402_FACILITATOR_TOKEN: "secret"
  },
  fetchImpl: async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    if (url.endsWith("/verify")) {
      return new Response(JSON.stringify({ isValid: true, payer: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e" }), {
        status: 200
      });
    }
    return new Response(JSON.stringify({ success: true, transaction: "0xsettled" }), {
      status: 200
    });
  }
});

assert.equal(live.valid, true);
assert.equal(live.mode, "live");
assert.equal(live.results[0].payer, "0x742d35Cc6634C0532925a3b844Bc454e4438f44e");
assert.equal(live.results[0].settlement.transaction, "0xsettled");
assert.equal(calls.length, 2);
assert.equal(calls[0].url, "https://facilitator.example/verify");
assert.equal(calls[1].url, "https://facilitator.example/settle");
assert.equal(calls[0].init.headers.authorization, "Bearer secret");

console.log("x402Smoke tests passed");
