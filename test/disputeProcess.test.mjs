import assert from "node:assert/strict";
import { summarizeDisputePacket, validateDisputePacket } from "../src/disputeProcess.mjs";

const validPacket = {
  disputeId: "disp_001",
  merchantId: "mcp_search",
  category: "incorrect_denial",
  status: "submitted",
  severity: "medium",
  openedAt: "2026-06-08",
  requester: {
    role: "agent_operator",
    contact: "pilot-contact-handle"
  },
  receiptIds: ["allow_1"],
  evidenceRefs: ["receipt-log:ops/gateway-receipts.local.jsonl#allow_1"],
  requestedOutcome: "explain_receipt",
  summary: "Pilot operator asks the merchant to review a denied receipt reason.",
  notes: ["Metadata hash matched the receipt; raw request metadata is not included."]
};

const valid = validateDisputePacket(validPacket);
assert.equal(valid.valid, true);
assert.deepEqual(valid.reasons, []);

const summary = summarizeDisputePacket(validPacket);
assert.equal(summary.valid, true);
assert.equal(summary.receiptCount, 1);
assert.equal(summary.evidenceRefCount, 1);

const missing = validateDisputePacket({});
assert.equal(missing.valid, false);
assert.ok(missing.reasons.includes("Missing disputeId"));
assert.ok(missing.reasons.includes("receiptIds must be a non-empty array"));

const sensitive = validateDisputePacket({
  ...validPacket,
  summary: "Please review email alex@example.com and seed phrase details."
});
assert.equal(sensitive.valid, false);
assert.ok(sensitive.redactionFlags.some((flag) => flag.id === "email"));
assert.ok(sensitive.redactionFlags.some((flag) => flag.id === "seed_phrase"));

const rawMetadata = validateDisputePacket({
  ...validPacket,
  rawMetadata: "email alex@example.com"
});
assert.equal(rawMetadata.valid, false);
assert.ok(rawMetadata.reasons.includes("Dispute packet must not include raw metadata, full requests, private keys, or seed phrases"));

const wrongMerchantReceipt = validateDisputePacket({
  ...validPacket,
  receipts: [
    {
      merchantId: "vector_cloud",
      receipt: {
        id: "allow_1"
      }
    }
  ]
});
assert.equal(wrongMerchantReceipt.valid, false);
assert.ok(wrongMerchantReceipt.reasons.includes("receipts[0] merchantId does not match dispute merchantId"));

const unresolved = validateDisputePacket(validPacket, { requireResolution: true });
assert.equal(unresolved.valid, false);
assert.ok(unresolved.reasons.includes("Dispute must be closed for this operation"));

const resolved = validateDisputePacket(
  {
    ...validPacket,
    status: "resolved",
    resolvedAt: "2026-06-09",
    resolution: "Merchant confirmed the denial was expected because metadata matched the blocked test case."
  },
  { requireResolution: true }
);
assert.equal(resolved.valid, true);

const withdrawn = validateDisputePacket(
  {
    ...validPacket,
    status: "withdrawn",
    resolvedAt: "2026-06-09",
    resolution: "Requester withdrew the dispute after merchant explanation."
  },
  { requireResolution: true }
);
assert.equal(withdrawn.valid, true);

console.log("disputeProcess tests passed");
