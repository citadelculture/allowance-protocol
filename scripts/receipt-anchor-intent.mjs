#!/usr/bin/env node
// Bridge an allowFetch receipt log to the onchain registry: take the most
// recent allowed receipt from a JSONL log and emit the dry-run recordReceipt
// calldata packet for the live AllowanceRegistry.
//
//   node scripts/receipt-anchor-intent.mjs <receipt-log.jsonl> <registryPolicyId> [recorder]
//
// Calldata and hash material only — nothing is signed or broadcast, and
// execution stays behind the registry_receipt_write approval path.

import { loadReceiptRecords } from "../src/receiptStore.mjs";
import { buildReceiptRegistryIntent } from "../src/receiptRegistryIntent.mjs";
import { allowanceRegistryDeployment } from "../src/deployments.mjs";

const [logPath, registryPolicyId, recorder] = process.argv.slice(2);
if (!logPath || !registryPolicyId) {
  console.error("Usage: node scripts/receipt-anchor-intent.mjs <receipt-log.jsonl> <registryPolicyId> [recorder]");
  process.exit(1);
}

const records = await loadReceiptRecords(logPath);
const allowed = records.filter((r) => (r.decision || r.receipt?.decision) === "allow");
if (allowed.length === 0) {
  console.error(`No allowed receipts in ${logPath} (${records.length} records).`);
  process.exit(1);
}
const latest = allowed.at(-1);

const deployment = allowanceRegistryDeployment("base");
const report = buildReceiptRegistryIntent(latest, {
  policyId: registryPolicyId,
  recorder: recorder || deployment.deployer,
  contractAddress: deployment.address,
  chainId: deployment.chainId,
  network: "Base",
  environment: "mainnet",
  requireDeployedRegistry: true
});

console.log(JSON.stringify({ logPath, recordsScanned: records.length, anchoredReceiptId: latest.receipt?.id || null, ...report }, null, 2));
process.exitCode = report.valid ? 0 : 1;
