// Live status of the deployed AllowanceRegistry. Read-only.
//
//   npm run registry-status                  # live Base deployment
//   ALLOW_RPC_URL=... npm run registry-status
//
// Reports code presence, total policies/receipts (from events), and the most
// recent activity. Never signs or sends transactions.

import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { allowanceRegistryDeployment } from "../src/deployments.mjs";
import { createRegistryEvents } from "../src/registryEvents.mjs";

const deployment = allowanceRegistryDeployment("base");
let rpcUrl = process.env.ALLOW_RPC_URL || "https://mainnet.base.org";
let client = createPublicClient({ chain: base, transport: http(rpcUrl) });

// ALLOW_RPC_URL may point at a different chain (e.g. a testnet endpoint kept
// for deploys). Never report status from the wrong chain — fall back.
const rpcChainId = await client.getChainId();
if (rpcChainId !== deployment.chainId) {
  console.error(`ALLOW_RPC_URL is chain ${rpcChainId}, registry is on ${deployment.chainId} — using ${deployment.chain} default RPC`);
  rpcUrl = "https://mainnet.base.org";
  client = createPublicClient({ chain: base, transport: http(rpcUrl) });
}

const code = await client.getCode({ address: deployment.address });
const codeBytes = code ? (code.length - 2) / 2 : 0;
const latestBlock = await client.getBlockNumber();

// 1400-block windows stay under the strictest common provider getLogs cap.
const events = createRegistryEvents({ client, maxBlockRange: 1400 });
const [policies, lifecycle, receipts] = await Promise.all([
  events.getPolicyCreatedEvents(),
  events.getPolicyActiveSetEvents(),
  events.getReceiptRecordedEvents()
]);

const lastActivityBlock = [...policies, ...lifecycle, ...receipts]
  .map((e) => e.blockNumber)
  .sort((a, b) => (a < b ? -1 : 1))
  .at(-1);

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({
    contract: "AllowanceRegistry",
    address: deployment.address,
    chain: deployment.chain,
    chainId: deployment.chainId,
    explorer: deployment.explorer,
    codeBytes,
    deployBlock: deployment.blockNumber,
    latestBlock: Number(latestBlock),
    policiesCreated: policies.length,
    lifecycleUpdates: lifecycle.length,
    receiptsRecorded: receipts.length,
    lastActivityBlock: lastActivityBlock == null ? null : Number(lastActivityBlock),
    checkedAt: new Date().toISOString()
  }, null, 2));
  process.exit(codeBytes > 0 ? 0 : 1);
}

console.log("AllowanceRegistry — live status");
console.log(`  address:        ${deployment.address}`);
console.log(`  chain:          ${deployment.chain} (${deployment.chainId})`);
console.log(`  explorer:       ${deployment.explorer}`);
console.log(`  code onchain:   ${codeBytes > 0 ? `yes (${codeBytes} bytes)` : "MISSING"}`);
console.log(`  deploy block:   ${deployment.blockNumber}`);
console.log(`  latest block:   ${latestBlock}`);
console.log(`  policies:       ${policies.length} created, ${lifecycle.length} lifecycle updates`);
console.log(`  receipts:       ${receipts.length} recorded`);
console.log(`  last activity:  ${lastActivityBlock ? `block ${lastActivityBlock}` : "none since deploy"}`);

if (codeBytes === 0) {
  console.error("No code at the registry address — check the deployment record.");
  process.exit(1);
}
