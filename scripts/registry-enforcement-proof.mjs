// Prove the live AllowanceRegistry enforces its guarantees, without spending
// gas: eth_call simulations that MUST revert (replay, over-cap, unknown
// merchant) and one that must succeed (a fresh in-policy receipt).
//
//   node scripts/registry-enforcement-proof.mjs <policyId> <usedIntentNonce>
//
// Writes work/registry/enforcement-proof.json. Read-only against the chain.

import { writeFileSync, mkdirSync } from "node:fs";
import { createPublicClient, http, encodeFunctionData, keccak256, stringToHex } from "viem";
import { base } from "viem/chains";
import { allowanceRegistryDeployment } from "../src/deployments.mjs";
import { ALLOWANCE_REGISTRY_ABI } from "../src/receiptRegistryIntent.mjs";
import { merchantIdToRegistryBytes32 } from "../src/registryPolicyIntent.mjs";

let [policyId, usedNonce] = process.argv.slice(2);
let discoveredAgent = null;

const deployment = allowanceRegistryDeployment("base");
const client = createPublicClient({ chain: base, transport: http("https://mainnet.base.org") });

// With no args, discover the most recent policy and one of its used intent
// nonces from onchain events, so anyone can run this without prior knowledge.
if (!policyId || !usedNonce) {
  const { createRegistryEvents } = await import("../src/registryEvents.mjs");
  const events = createRegistryEvents({ client });
  const receipts = await events.getReceiptRecordedEvents();
  if (receipts.length === 0) {
    console.error("No ReceiptRecorded events onchain yet — pass <policyId> <usedIntentNonce> explicitly.");
    process.exit(1);
  }
  const latest = receipts.at(-1);
  policyId = policyId || latest.policyId;
  usedNonce = usedNonce || latest.intentNonce;
  if (latest.agent) discoveredAgent = latest.agent;
  console.log(`Discovered from chain: policy ${policyId.slice(0, 10)}…, used nonce ${usedNonce.slice(0, 10)}…`);
}

if (!/^0x[0-9a-f]{64}$/i.test(policyId || "") || !/^0x[0-9a-f]{64}$/i.test(usedNonce || "")) {
  console.error("Usage: node scripts/registry-enforcement-proof.mjs [policyId] [usedIntentNonce]");
  process.exit(1);
}
const from = discoveredAgent || deployment.deployer;
const merchantOk = merchantIdToRegistryBytes32("mcp_search");
const merchantUnknown = merchantIdToRegistryBytes32("not_on_allowlist");
const freshNonce = () => keccak256(stringToHex(`enforcement-proof:${Date.now()}:${Math.random()}`));
const someHash = keccak256(stringToHex("enforcement-proof-hash"));

const args = (merchantId, amount, nonce) => [policyId, merchantId, amount, someHash, nonce, someHash];

const cases = [
  { id: "replayed_nonce_reverts", expectRevert: true, args: args(merchantOk, 18000n, usedNonce) },
  { id: "over_per_tx_cap_reverts", expectRevert: true, args: args(merchantOk, 5_000_000n, freshNonce()) },
  { id: "unknown_merchant_reverts", expectRevert: true, args: args(merchantUnknown, 18000n, freshNonce()) },
  { id: "fresh_in_policy_receipt_allows", expectRevert: false, args: args(merchantOk, 18000n, freshNonce()) }
];

// Only an execution revert counts as "reverted" — transport failures and
// rate limits must never masquerade as enforcement results.
function isExecutionRevert(err) {
  for (let e = err; e; e = e.cause) {
    if (/revert/i.test(e.shortMessage || "") || /revert/i.test(e.message || "")) return true;
  }
  return false;
}

async function callWithRetry(data) {
  let lastErr;
  for (let attempt = 0; attempt < 5; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    try {
      await client.call({ account: from, to: deployment.address, data });
      return { outcome: "allowed", detail: "call succeeded" };
    } catch (err) {
      lastErr = err;
      if (isExecutionRevert(err)) {
        const detail = (err.cause?.cause?.message || err.shortMessage || err.message || "").slice(0, 160);
        return { outcome: "reverted", detail };
      }
      // transport / rate-limit error: retry
    }
  }
  return { outcome: "inconclusive", detail: (lastErr?.shortMessage || lastErr?.message || "transport failure").slice(0, 160) };
}

const results = [];
for (const testCase of cases) {
  const data = encodeFunctionData({ abi: ALLOWANCE_REGISTRY_ABI, functionName: "recordReceipt", args: testCase.args });
  const { outcome, detail } = await callWithRetry(data);
  const pass = outcome === (testCase.expectRevert ? "reverted" : "allowed");
  results.push({ id: testCase.id, expectRevert: testCase.expectRevert, outcome, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${testCase.id} (${outcome})`);
  await new Promise((r) => setTimeout(r, 400));
}

const allPass = results.every((r) => r.pass);
const proof = {
  proofId: `registry-enforcement-${Date.now()}`,
  generatedAt: new Date().toISOString(),
  registry: deployment.address,
  chainId: deployment.chainId,
  policyId,
  method: "eth_call simulation from the policy agent address (no gas, no state change)",
  results,
  allPass
};

mkdirSync("work/registry", { recursive: true });
writeFileSync("work/registry/enforcement-proof.json", JSON.stringify(proof, null, 2));
console.log(`${allPass ? "All enforcement checks passed" : "ENFORCEMENT CHECKS FAILED"} -> work/registry/enforcement-proof.json`);
process.exit(allPass ? 0 : 1);
