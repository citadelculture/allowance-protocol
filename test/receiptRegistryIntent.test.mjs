import assert from "node:assert/strict";
import {
  buildReceiptRegistryIntent,
  canonicalJson,
  computeRegistryReceiptId,
  registryWriteIntentHash
} from "../src/receiptRegistryIntent.mjs";

const registryPolicyId = `0x${"11".repeat(32)}`;
const contractAddress = "0x1234567890123456789012345678901234567890";
const recorder = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";

const record = {
  recordedAt: "2026-06-08T00:00:00.000Z",
  source: "allow-test",
  merchantId: "mcp_search",
  decision: "allow",
  evidence: {
    environment: "testnet",
    merchantApproved: true,
    rail: "x402",
    network: "Base Sepolia",
    settlement: "USDC",
    label: "merchant-approved smoke"
  },
  receipt: {
    id: "allow_receipt_001",
    createdAt: "2026-06-08T00:00:00.000Z",
    policyId: "allow_policy_live_001",
    agentId: "agent-alpha",
    merchantId: "mcp_search",
    merchantName: "MCP Search Index",
    amountUsd: 0.018,
    decision: "allow",
    riskScore: 12,
    intentNonce: "nonce-001",
    intentHash: "offchain-intent-hash",
    metadataHash: "offchain-metadata-hash",
    resource: "/paid-search?q=allow"
  }
};

const options = {
  registryPolicyId,
  contractAddress,
  chainId: 84532,
  network: "Base Sepolia",
  environment: "testnet",
  recorder,
  requireCredibleEvidence: true,
  requireMerchantApproval: true
};

const valid = buildReceiptRegistryIntent(record, options);
assert.equal(valid.valid, true);
assert.equal(valid.status, "ready_for_external_approval");
assert.equal(valid.mode, "dry_run");
assert.equal(valid.safety.broadcast, false);
assert.equal(valid.safety.signsTransaction, false);
assert.equal(valid.registry.args.policyId, registryPolicyId);
assert.equal(valid.registry.args.amount, "18000");
assert.match(valid.registry.args.merchantId, /^0x[0-9a-f]{64}$/);
assert.match(valid.registry.args.intentHash, /^0x[0-9a-f]{64}$/);
assert.match(valid.registry.args.intentNonce, /^0x[0-9a-f]{64}$/);
assert.match(valid.registry.args.metadataHash, /^0x[0-9a-f]{64}$/);
assert.ok(valid.registry.calldata.startsWith("0x"));
assert.match(valid.registry.expectedReceiptId, /^0x[0-9a-f]{64}$/);
assert.match(valid.registry.writeIntentHash, /^0x[0-9a-f]{64}$/);

const expectedReceiptId = computeRegistryReceiptId({
  policyId: valid.registry.args.policyId,
  merchantId: valid.registry.args.merchantId,
  amountUnits: valid.registry.args.amount,
  intentHash: valid.registry.args.intentHash,
  intentNonce: valid.registry.args.intentNonce,
  metadataHash: valid.registry.args.metadataHash,
  recorder,
  chainId: 84532
});
assert.equal(valid.registry.expectedReceiptId, expectedReceiptId);

const repeated = buildReceiptRegistryIntent(record, options);
assert.equal(repeated.registry.writeIntentHash, valid.registry.writeIntentHash);
assert.equal(repeated.registry.calldata, valid.registry.calldata);

const missingRegistryPolicy = buildReceiptRegistryIntent(record, {
  ...options,
  registryPolicyId: record.receipt.policyId
});
assert.equal(missingRegistryPolicy.valid, false);
assert.ok(
  missingRegistryPolicy.reasons.includes(
    "registryPolicyId must be the bytes32 policy id returned by AllowanceRegistry.createPolicy"
  )
);

const zeroRegistryPolicy = buildReceiptRegistryIntent(record, {
  ...options,
  registryPolicyId: `0x${"0".repeat(64)}`
});
assert.equal(zeroRegistryPolicy.valid, false);
assert.ok(zeroRegistryPolicy.reasons.includes("registryPolicyId must not be zero"));

const denied = buildReceiptRegistryIntent(
  {
    ...record,
    decision: "deny",
    receipt: {
      ...record.receipt,
      decision: "deny"
    }
  },
  options
);
assert.equal(denied.valid, false);
assert.ok(denied.reasons.includes("Only allowed payment receipts can be prepared for registry recording"));

const localEvidence = buildReceiptRegistryIntent(
  {
    ...record,
    evidence: {
      ...record.evidence,
      environment: "local",
      merchantApproved: false
    }
  },
  options
);
assert.equal(localEvidence.valid, false);
assert.ok(localEvidence.reasons.includes("Receipt registry intent requires merchant-approved testnet or mainnet evidence"));
assert.ok(localEvidence.reasons.includes("Receipt registry intent requires merchant-approved receipt evidence"));

const rawMetadata = buildReceiptRegistryIntent(
  {
    ...record,
    receipt: {
      ...record.receipt,
      metadata: "raw user prompt"
    }
  },
  options
);
assert.equal(rawMetadata.valid, false);
assert.ok(rawMetadata.reasons.includes("Receipt registry intent input must include metadataHash, not raw metadata"));

const secretField = buildReceiptRegistryIntent(
  {
    ...record,
    controllerPrivateKey: "0x0000000000000000000000000000000000000000000000000000000000000001"
  },
  options
);
assert.equal(secretField.valid, false);
assert.ok(secretField.reasons.some((reason) => reason.includes("controllerPrivateKey")));

assert.equal(
  canonicalJson({ b: 2, a: { d: 4, c: 3 } }),
  '{"a":{"c":3,"d":4},"b":2}'
);
assert.equal(registryWriteIntentHash({ a: 1 }), registryWriteIntentHash({ a: 1 }));

console.log("receiptRegistryIntent tests passed");
