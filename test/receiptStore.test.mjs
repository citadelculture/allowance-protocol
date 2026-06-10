import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createJsonlReceiptStore,
  createMemoryReceiptStore,
  isCrediblePilotEvidence,
  loadReceiptRecords,
  normalizeReceiptEvidence,
  summarizeReceiptRecords
} from "../src/receiptStore.mjs";

const memory = createMemoryReceiptStore();
await memory.record({
  source: "test",
  decision: "allow",
  merchantId: "mcp_search",
  upstreamStatus: 200,
  receipt: {
    id: "allow_1",
    merchantId: "mcp_search",
    decision: "allow",
    amountUsd: 0.018
  }
});

assert.equal(memory.records.length, 1);
assert.equal(memory.records[0].source, "test");
assert.equal(memory.records[0].evidence.environment, "local");
assert.equal(isCrediblePilotEvidence(memory.records[0]), false);

const dir = await mkdtemp(join(tmpdir(), "allow-receipts-"));
const path = join(dir, "receipts.jsonl");
const store = createJsonlReceiptStore(path);

await store.record({
  source: "gateway",
  decision: "deny",
  merchantId: "lead_graph",
  reasons: ["Payment metadata contains restricted data: email"],
  evidence: {
    environment: "testnet",
    merchantApproved: true,
    rail: "x402",
    network: "eip155:84532"
  },
  receipt: {
    id: "allow_2",
    merchantId: "lead_graph",
    decision: "deny",
    amountUsd: 0.35
  }
});

await store.record({
  source: "gateway",
  decision: "allow",
  merchantId: "mcp_search",
  upstreamStatus: 502,
  upstreamError: "upstream unavailable",
  receipt: {
    id: "allow_3",
    merchantId: "mcp_search",
    decision: "allow",
    amountUsd: 0.018
  }
});

assert.ok((await readFile(path, "utf8")).includes("allow_2"));

const records = await loadReceiptRecords(path);
assert.equal(records.length, 2);
assert.equal(records[0].decision, "deny");
assert.equal(records[0].evidence.environment, "testnet");
assert.equal(isCrediblePilotEvidence(records[0]), true);
assert.equal(records[1].upstreamError, "upstream unavailable");
assert.deepEqual(normalizeReceiptEvidence({ environment: "staging" }), {
  environment: "local",
  merchantApproved: false,
  rail: "unknown",
  network: "",
  settlement: "",
  label: ""
});

const summary = summarizeReceiptRecords([...memory.records, ...records]);
assert.equal(summary.total, 3);
assert.equal(summary.byDecision.allow, 2);
assert.equal(summary.byDecision.deny, 1);
assert.equal(summary.byMerchant.mcp_search, 2);
assert.equal(summary.byUpstreamStatus["200"], 1);
assert.equal(summary.byUpstreamStatus["502"], 1);
assert.equal(summary.byUpstreamError["upstream unavailable"], 1);
assert.deepEqual(summary.byEvidenceEnvironment, { local: 2, testnet: 1 });
assert.deepEqual(summary.byEvidenceRail, { unknown: 2, x402: 1 });
assert.equal(summary.merchantApprovedReceipts, 1);
assert.equal(summary.crediblePilotReceipts, 1);
assert.equal(summary.blockedValueUsd, 0.35);

// --- jsonl rotation caps the active log without deleting evidence ------------
{
  const { mkdtemp, readdir, readFile: readF } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { createJsonlReceiptStore } = await import("../src/receiptStore.mjs");

  const dir = await mkdtemp(join(tmpdir(), "allow-receipts-"));
  const path = join(dir, "receipts.jsonl");
  const store = createJsonlReceiptStore(path, { maxBytes: 400 });
  for (let i = 0; i < 10; i++) {
    await store.record({ decision: "allow", merchantId: "mcp_search", receipt: { id: `r${i}`, amountUsd: 0.01 } });
  }
  const files = await readdir(dir);
  const rotated = files.filter((f) => f.startsWith("receipts.jsonl."));
  assert.ok(rotated.length >= 1, "log rotated at the size cap");
  const activeLines = (await readF(path, "utf8")).trim().split("\n").length;
  const rotatedLines = (
    await Promise.all(rotated.map((f) => readF(join(dir, f), "utf8")))
  ).map((c) => c.trim().split("\n").length);
  assert.equal(activeLines + rotatedLines.reduce((a, b) => a + b, 0), 10, "no receipt was lost in rotation");
}

console.log("receiptStore tests passed");
