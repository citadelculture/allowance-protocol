import assert from "node:assert/strict";
import {
  createX402FacilitatorVerifier,
  normalizeX402FacilitatorConfig,
  parseX402PaymentHeader,
  paymentRequirementsFromSettlement,
  shouldUseX402Facilitator,
  x402FacilitatorVerifierFromEnv
} from "../src/x402Facilitator.mjs";
import { settlementProofFromHeaders } from "../src/settlementProof.mjs";

const paymentPayload = {
  x402Version: 2,
  accepted: {
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
  },
  payload: {
    signature: "0xabc",
    authorization: {
      from: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
      to: "0x122F8Fcaf2152420445Aa424E1D8C0306935B5c9",
      value: "1000",
      validAfter: "1716150000",
      validBefore: "1716150060",
      nonce: "0x1234"
    }
  },
  resource: {
    url: "https://api.example.com/paid-search",
    description: "Paid search",
    mimeType: "application/json"
  }
};
const encodedPayment = Buffer.from(JSON.stringify(paymentPayload)).toString("base64url");
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

assert.deepEqual(parseX402PaymentHeader(encodedPayment), paymentPayload);
assert.deepEqual(parseX402PaymentHeader(JSON.stringify(paymentPayload)), paymentPayload);
assert.throws(() => parseX402PaymentHeader("not-json"), /must be JSON/);

const proof = settlementProofFromHeaders({
  "payment-signature": encodedPayment
});
assert.equal(proof.proof, encodedPayment);
assert.equal(proof.rawPaymentHeader, encodedPayment);

assert.deepEqual(
  normalizeX402FacilitatorConfig({
    baseUrl: "https://facilitator.example/",
    bearerToken: "secret",
    settle: true
  }),
  {
    baseUrl: "https://facilitator.example",
    verifyPath: "/verify",
    settlePath: "/settle",
    supportedPath: "/supported",
    timeoutMs: 10000,
    settle: true,
    bearerToken: "secret",
    headers: {}
  }
);

assert.equal(
  shouldUseX402Facilitator({
    routes: [
      {
        settlement: {
          proofType: "x402-facilitator"
        }
      }
    ]
  }),
  true
);
assert.equal(shouldUseX402Facilitator({ routes: [] }), false);

assert.deepEqual(
  paymentRequirementsFromSettlement({
    scheme: "exact",
    network: "eip155:84532",
    assetAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    amount: "1000",
    payTo: "0x122F8Fcaf2152420445Aa424E1D8C0306935B5c9"
  }, { asset: "USDC" }),
  {
    scheme: "exact",
    network: "eip155:84532",
    asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    amount: "1000",
    payTo: "0x122F8Fcaf2152420445Aa424E1D8C0306935B5c9",
    maxTimeoutSeconds: 60,
    extra: {
      name: "USDC"
    }
  }
);

const calls = [];
const verifier = createX402FacilitatorVerifier({
  facilitator: {
    baseUrl: "https://facilitator.example",
    bearerToken: "secret",
    settle: true
  },
  fetchImpl: async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    if (url.endsWith("/verify")) {
      return new Response(JSON.stringify({ isValid: true, payer: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e" }), {
        status: 200
      });
    }
    return new Response(JSON.stringify({ success: true, transaction: "0xsettled", network: "base", amount: "1000" }), {
      status: 200
    });
  }
});

const verified = await verifier({
  proof,
  expected: {
    merchantId: "mcp_search",
    asset: "USDC",
    amountUsd: 0.001
  },
  mode: "x402-facilitator",
  settlement: {
    proofType: "x402-facilitator",
    paymentRequirements
  }
});

assert.equal(verified.valid, true);
assert.equal(verified.payer, "0x742d35Cc6634C0532925a3b844Bc454e4438f44e");
assert.equal(verified.settlement.transaction, "0xsettled");
assert.equal(calls.length, 2);
assert.equal(calls[0].url, "https://facilitator.example/verify");
assert.equal(calls[1].url, "https://facilitator.example/settle");
assert.equal(calls[0].init.headers.authorization, "Bearer secret");
assert.deepEqual(calls[0].body.paymentPayload, paymentPayload);
assert.deepEqual(calls[0].body.paymentRequirements, paymentRequirements);

const rejectedVerifier = createX402FacilitatorVerifier({
  facilitator: {
    baseUrl: "https://facilitator.example"
  },
  fetchImpl: async () =>
    new Response(JSON.stringify({ isValid: false, invalidReason: "insufficient_funds", invalidMessage: "Insufficient funds" }), {
      status: 200
    })
});

const rejected = await rejectedVerifier({
  proof,
  mode: "x402-facilitator",
  settlement: {
    proofType: "x402-facilitator",
    paymentRequirements
  }
});
assert.equal(rejected.valid, false);
assert.deepEqual(rejected.reasons, ["Insufficient funds"]);

const missingRequirements = await verifier({
  proof,
  mode: "x402-facilitator",
  settlement: {
    proofType: "x402-facilitator"
  }
});
assert.equal(missingRequirements.valid, false);
assert.deepEqual(missingRequirements.reasons, ["Missing x402 payment requirements"]);

const fromEnv = x402FacilitatorVerifierFromEnv(
  {
    ALLOW_X402_FACILITATOR_URL: "https://facilitator.example",
    ALLOW_X402_SETTLE: "1"
  },
  {
    config: {
      routes: []
    },
    fetchImpl: async () => new Response(JSON.stringify({ isValid: true }), { status: 200 })
  }
);
assert.equal(typeof fromEnv, "function");
assert.equal(x402FacilitatorVerifierFromEnv({}, { config: { routes: [] } }), null);

console.log("x402Facilitator tests passed");
