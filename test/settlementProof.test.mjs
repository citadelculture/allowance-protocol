import assert from "node:assert/strict";
import {
  SETTLEMENT_REQUIRED,
  expectedSettlementFromContext,
  settlementProofFromHeaders,
  settlementRequiredResponse,
  verifySettlementProof
} from "../src/settlementProof.mjs";

const expected = {
  merchantId: "mcp_search",
  amountUsd: 0.018,
  chain: "Base",
  asset: "USDC",
  policyId: "allow_policy_demo_alpha",
  receiptId: "allow_receipt_001",
  intentNonce: "settlement-001"
};

const proof = settlementProofFromHeaders({
  "x-allow-settlement-proof": "proof-token",
  "x-allow-settlement-proof-type": "mock-facilitator",
  "x-allow-settlement-chain": "Base",
  "x-allow-settlement-asset": "USDC",
  "x-allow-settlement-amount-usd": "0.018",
  "x-allow-settlement-merchant": "mcp_search",
  "x-allow-settlement-policy": "allow_policy_demo_alpha",
  "x-allow-settlement-receipt": "allow_receipt_001",
  "x-allow-settlement-nonce": "settlement-001",
  "x-allow-settlement-tx": "0xabc"
});

assert.equal(proof.proof, "proof-token");
assert.equal(proof.amountUsd, 0.018);
assert.equal(proof.txHash, "0xabc");

const optional = await verifySettlementProof({}, expected);
assert.equal(optional.valid, true);
assert.equal(optional.mode, "not_required");

const missing = await verifySettlementProof({}, expected, { required: true });
assert.equal(missing.valid, false);
assert.deepEqual(missing.reasons, ["Missing settlement proof"]);

const mismatch = await verifySettlementProof(
  {
    ...proof,
    amountUsd: 1
  },
  expected,
  {
    required: true,
    verifier: async () => ({ valid: true })
  }
);

assert.equal(mismatch.valid, false);
assert.ok(mismatch.reasons.includes("Settlement amount does not match expected amount"));

const noVerifier = await verifySettlementProof(proof, expected, { required: true });
assert.equal(noVerifier.valid, false);
assert.ok(noVerifier.reasons.includes("Missing settlement proof verifier"));

const verified = await verifySettlementProof(proof, expected, {
  required: true,
  mode: "mock-facilitator",
  verifier: async ({ proof: settlementProof, expected: settlementExpected, mode }) => ({
    valid: settlementProof.proof === "proof-token" && settlementExpected.asset === "USDC" && mode === "mock-facilitator",
    warnings: ["mock verifier only"]
  })
});

assert.equal(verified.valid, true);
assert.deepEqual(verified.warnings, ["mock verifier only"]);

const response = settlementRequiredResponse(missing);
assert.equal(response.status, 402);
assert.equal(response.body.error, SETTLEMENT_REQUIRED);
assert.equal(response.headers["x-allow-settlement-decision"], "deny");

const fromContext = expectedSettlementFromContext({
  route: {
    merchantId: "mcp_search",
    amountUsd: 0.018
  },
  policy: {
    chain: "Base",
    settlementAsset: "USDC"
  },
  result: {
    body: {
      evaluation: {
        receipt: {
          id: "allow_receipt_001",
          policyId: "allow_policy_demo_alpha",
          intentNonce: "settlement-001"
        }
      }
    }
  }
});

assert.deepEqual(fromContext, expected);

console.log("settlementProof tests passed");
