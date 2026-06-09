import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createJsonlReceiptStore } from "../src/receiptStore.mjs";
import { deriveLaunchMetrics, loadReceiptRecordsFromPaths, receiptLogPathsFromEnv } from "../src/metrics.mjs";

const base = {
  date: "2026-06-08",
  policyDecisions: 1,
  approvedReceipts: 0,
  deniedReceipts: 0,
  blockedValueUsd: 0,
  integratedMerchants: 0,
  activeAgents: 0,
  publicBuildDays: 1
};
const credibleEvidence = {
  environment: "testnet",
  merchantApproved: true,
  rail: "x402",
  network: "eip155:84532"
};

const records = [
  {
    merchantId: "mcp_search",
    decision: "allow",
    upstreamStatus: 200,
    reasons: ["Within allowance, merchant, metadata, and receipt policy"],
    evidence: credibleEvidence,
    receipt: {
      id: "allow_1",
      agentId: "agent-alpha",
      merchantId: "mcp_search",
      decision: "allow",
      amountUsd: 0.018
    }
  },
  {
    merchantId: "mcp_search",
    decision: "deny",
    reasons: ["Payment metadata contains restricted data: email"],
    evidence: credibleEvidence,
    receipt: {
      id: "allow_2",
      agentId: "agent-alpha",
      merchantId: "mcp_search",
      decision: "deny",
      amountUsd: 0.018
    }
  },
  {
    merchantId: "mcp_search",
    decision: "allow",
    upstreamStatus: 502,
    upstreamError: "fetch failed",
    receipt: {
      id: "allow_3",
      agentId: "agent-alpha",
      merchantId: "mcp_search",
      decision: "allow",
      amountUsd: 0.018
    }
  }
];

const metrics = deriveLaunchMetrics(base, records, { loadedPaths: ["receipts.jsonl"] });

assert.equal(metrics.policyDecisions, 4);
assert.equal(metrics.approvedReceipts, 2);
assert.equal(metrics.deniedReceipts, 1);
assert.equal(metrics.blockedValueUsd, 0.02);
assert.equal(metrics.activeAgents, 1);
assert.deepEqual(metrics.pilotEvidence.receiptLogs, ["receipts.jsonl"]);
assert.equal(metrics.pilotEvidence.crediblePolicyDecisions, 2);
assert.deepEqual(metrics.pilotEvidence.credibleMerchantsWithReceipts, ["mcp_search"]);
assert.deepEqual(metrics.pilotEvidence.merchantsWithSuccessfulUpstream, ["mcp_search"]);
assert.deepEqual(metrics.pilotEvidence.pilotMerchantsWithEvidence, ["mcp_search"]);
assert.equal(metrics.pilotEvidence.upstreamFailures, 1);
assert.deepEqual(metrics.pilotEvidence.evidence.byEnvironment, { testnet: 2, local: 1 });
assert.deepEqual(metrics.pilotEvidence.evidence.byRail, { x402: 2, unknown: 1 });
assert.equal(metrics.pilotEvidence.evidence.merchantApprovedReceipts, 2);
assert.equal(metrics.pilotEvidence.evidence.crediblePilotReceipts, 2);

assert.deepEqual(receiptLogPathsFromEnv({ ALLOW_RECEIPT_LOGS: "a.jsonl, b.jsonl" }, ["fallback"]), [
  "a.jsonl",
  "b.jsonl"
]);
assert.deepEqual(receiptLogPathsFromEnv({}, ["fallback"]), ["fallback"]);

const dir = await mkdtemp(join(tmpdir(), "allow-metrics-"));
const receiptPath = join(dir, "receipts.jsonl");
const store = createJsonlReceiptStore(receiptPath);
await store.record(records[0]);

const loaded = await loadReceiptRecordsFromPaths([receiptPath, join(dir, "missing.jsonl")]);
assert.equal(loaded.records.length, 1);
assert.deepEqual(loaded.loadedPaths, [receiptPath]);
assert.equal(loaded.missingPaths.length, 1);

console.log("metrics tests passed");
