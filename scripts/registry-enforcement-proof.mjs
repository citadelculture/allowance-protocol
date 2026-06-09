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

const [policyId, usedNonce] = process.argv.slice(2);
if (!/^0x[0-9a-f]{64}$/i.test(policyId || "") || !/^0x[0-9a-f]{64}$/i.test(usedNonce || "")) {
  console.error("Usage: node scripts/registry-enforcement-proof.mjs <policyId> <usedIntentNonce>");
  process.exit(1);
}

const deployment = allowanceRegistryDeployment("base");
const client = createPublicClient({ chain: base, transport: http("https://mainnet.base.org") });
const from = deployment.deployer;
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

const results = [];
for (const testCase of cases) {
  const data = encodeFunctionData({ abi: ALLOWANCE_REGISTRY_ABI, functionName: "recordReceipt", args: testCase.args });
  let reverted = false;
  let detail = "call succeeded";
  try {
    await client.call({ account: from, to: deployment.address, data });
  } catch (err) {
    reverted = true;
    detail = (err.cause?.cause?.message || err.shortMessage || err.message || "").slice(0, 160);
  }
  const pass = reverted === testCase.expectRevert;
  results.push({ id: testCase.id, expectRevert: testCase.expectRevert, reverted, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${testCase.id} (${reverted ? "reverted" : "allowed"})`);
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
