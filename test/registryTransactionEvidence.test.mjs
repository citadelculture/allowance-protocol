import assert from "node:assert/strict";
import { buildRegistryTransactionEvidenceReport } from "../src/registryTransactionEvidence.mjs";

const registryAddress = "0x1234567890123456789012345678901234567890";
const controller = "0x1111111111111111111111111111111111111111";
const txHash = `0x${"aa".repeat(32)}`;
const writeIntentHash = `0x${"bb".repeat(32)}`;
const policyId = `0x${"cc".repeat(32)}`;
const receiptId = `0x${"dd".repeat(32)}`;
const merchantId = `0x${"ee".repeat(32)}`;

const baseEvidence = {
  evidenceId: "registry_tx_001",
  actionType: "registry_policy_create",
  status: "confirmed",
  generatedAt: "2026-06-08",
  approvalRef: "external-action:approval_005",
  network: "Base Sepolia",
  chainId: 84532,
  registryAddress,
  transaction: {
    txHash,
    status: "success",
    from: controller,
    to: registryAddress,
    blockNumber: 123456,
    blockTimestamp: "2026-06-08T00:00:00.000Z",
    explorerUrl: `https://sepolia.basescan.org/tx/${txHash}`
  },
  intent: {
    writeIntentHash,
    functionName: "createPolicy",
    calldataSha256: "f".repeat(64)
  },
  result: {
    eventName: "PolicyCreated",
    expectedPolicyId: policyId,
    policyId
  }
};

const valid = buildRegistryTransactionEvidenceReport(baseEvidence);
assert.equal(valid.valid, true);
assert.equal(valid.result.policyId, policyId);
assert.equal(valid.transaction.from, controller);

const receiptWrite = buildRegistryTransactionEvidenceReport({
  ...baseEvidence,
  evidenceId: "registry_tx_002",
  actionType: "registry_receipt_write",
  intent: {
    writeIntentHash,
    functionName: "recordReceipt"
  },
  result: {
    eventName: "ReceiptRecorded",
    expectedReceiptId: receiptId,
    receiptId
  }
});
assert.equal(receiptWrite.valid, true);
assert.equal(receiptWrite.result.receiptId, receiptId);

const lifecycle = buildRegistryTransactionEvidenceReport({
  ...baseEvidence,
  evidenceId: "registry_tx_003",
  actionType: "registry_lifecycle_update",
  intent: {
    writeIntentHash,
    functionName: "setMerchantAllowed"
  },
  result: {
    action: "set_merchant_allowed",
    policyId,
    merchantId,
    allowed: false,
    stateCheckRef: "read: allowedMerchant(policyId, merchantId)=false at block 123456"
  }
});
assert.equal(lifecycle.valid, true);
assert.equal(lifecycle.result.allowed, false);

const mismatchTo = buildRegistryTransactionEvidenceReport({
  ...baseEvidence,
  transaction: {
    ...baseEvidence.transaction,
    to: "0x9999999999999999999999999999999999999999"
  }
});
assert.equal(mismatchTo.valid, false);
assert.ok(mismatchTo.reasons.includes("transaction.to must match registryAddress"));

const failedTx = buildRegistryTransactionEvidenceReport({
  ...baseEvidence,
  transaction: {
    ...baseEvidence.transaction,
    status: "failed"
  }
});
assert.equal(failedTx.valid, false);
assert.ok(failedTx.reasons.includes("confirmed evidence requires transaction.status=success"));

const mismatchedPolicy = buildRegistryTransactionEvidenceReport({
  ...baseEvidence,
  result: {
    ...baseEvidence.result,
    policyId: `0x${"12".repeat(32)}`
  }
});
assert.equal(mismatchedPolicy.valid, false);
assert.ok(mismatchedPolicy.reasons.includes("result.policyId must match result.expectedPolicyId"));

const pending = buildRegistryTransactionEvidenceReport({
  ...baseEvidence,
  status: "pending",
  transaction: {
    ...baseEvidence.transaction,
    status: "pending",
    blockNumber: null,
    blockTimestamp: ""
  }
});
assert.equal(pending.valid, false);
assert.ok(pending.reasons.includes("Registry transaction evidence must be confirmed"));

const secretField = buildRegistryTransactionEvidenceReport({
  ...baseEvidence,
  controllerPrivateKey: "0x0000000000000000000000000000000000000000000000000000000000000001"
});
assert.equal(secretField.valid, false);
assert.ok(secretField.reasons.some((reason) => reason.includes("controllerPrivateKey")));

console.log("registryTransactionEvidence tests passed");
