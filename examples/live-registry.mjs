// Read the LIVE AllowanceRegistry on Base mainnet: the real policy, its
// remaining allowance right now, and every receipt anchored onchain.
//
//   npm run example:live-registry        (network required, read-only)

import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { createRegistryReader } from "../src/registryReader.mjs";
import { createRegistryEvents } from "../src/registryEvents.mjs";
import { allowanceRegistryDeployment } from "../src/deployments.mjs";

const deployment = allowanceRegistryDeployment("base");
const client = createPublicClient({ chain: base, transport: http("https://mainnet.base.org") });
const reader = createRegistryReader({ client });
const events = createRegistryEvents({ client });

console.log(`AllowanceRegistry ${deployment.address} (Base mainnet)\n`);

const policies = await events.getPolicyCreatedEvents();
if (policies.length === 0) {
  console.log("No policies onchain yet.");
  process.exit(0);
}

for (const created of policies) {
  const live = await reader.remainingEpochAllowance(created.policyId);
  const usd = (units) => `$${(Number(units) / 1e6).toFixed(2)}`;
  console.log(`Policy ${created.policyId}`);
  console.log(`  controller: ${created.controller}`);
  console.log(`  agent:      ${created.agent}`);
  console.log(`  caps:       ${usd(created.perTxCap)} per tx, ${usd(created.epochCap)} per ${Number(created.epochSeconds) / 3600}h epoch`);
  console.log(`  active:     ${live?.policy.active}`);
  console.log(`  remaining:  ${usd(live?.remaining ?? 0n)} this epoch (spent ${usd(live?.spent ?? 0n)})`);
}

const receipts = await events.getReceiptRecordedEvents();
console.log(`\nReceipts anchored onchain: ${receipts.length}`);
for (const r of receipts) {
  console.log(`  ${r.receiptId.slice(0, 18)}… amount $${(Number(r.amount) / 1e6).toFixed(3)} block ${r.blockNumber} tx ${r.transactionHash.slice(0, 18)}…`);
}

console.log("\nVerify everything yourself: npm run live-proof");
