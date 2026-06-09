// Send a validated registry intent (createPolicy / recordReceipt calldata)
// to the live AllowanceRegistry from the ALLOW_DEPLOY_PK wallet.
//
//   node scripts/send-registry-intent.mjs <intent-report.json>
//
// The report must be the JSON output of registry-policy-intent or
// receipt-anchor-intent with valid:true. Gas-only: the registry custodies no
// funds and these calls transfer no value. Refuses invalid reports, checks
// the chain id, simulates before sending, and prints the decoded result.

import { readFileSync } from "node:fs";
import { createWalletClient, createPublicClient, http, formatEther, decodeEventLog } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { ALLOWANCE_REGISTRY_EVENTS_ABI } from "../src/registryEvents.mjs";

const reportPath = process.argv[2];
if (!reportPath) {
  console.error("Usage: node scripts/send-registry-intent.mjs <intent-report.json>");
  process.exit(1);
}

const report = JSON.parse(readFileSync(reportPath, "utf8"));
if (report.valid !== true) {
  console.error(`Refusing to send: intent report is not valid (reasons: ${JSON.stringify(report.reasons)})`);
  process.exit(1);
}
const calldata = report.registry?.calldata;
const to = report.contract?.address || report.registry?.contractAddress || report.destination?.contractAddress;
if (!calldata || !/^0x[0-9a-fA-F]+$/.test(calldata) || !/^0x[0-9a-fA-F]{40}$/.test(String(to || ""))) {
  console.error("Refusing to send: report lacks calldata or a registry contract address");
  process.exit(1);
}

const pk = process.env.ALLOW_DEPLOY_PK;
if (!pk) {
  console.error("Refusing to send: set ALLOW_DEPLOY_PK");
  process.exit(1);
}

const rpcUrl = "https://mainnet.base.org";
const account = privateKeyToAccount(pk.startsWith("0x") ? pk : `0x${pk}`);
const publicClient = createPublicClient({ chain: base, transport: http(rpcUrl) });
const walletClient = createWalletClient({ account, chain: base, transport: http(rpcUrl) });

const chainId = await publicClient.getChainId();
if (chainId !== 8453) {
  console.error(`RPC chain id ${chainId} is not Base mainnet`);
  process.exit(1);
}

const balance = await publicClient.getBalance({ address: account.address });
console.log(`Sending registry intent`);
console.log(`  function: ${report.registry?.functionName}`);
console.log(`  to:       ${to}`);
console.log(`  from:     ${account.address} (${formatEther(balance)} ETH)`);

// Simulate first — a revert here costs nothing and stops the send.
await publicClient.call({ account: account.address, to, data: calldata });

const hash = await walletClient.sendTransaction({ to, data: calldata, value: 0n });
console.log(`  tx:       ${hash}`);
const receipt = await publicClient.waitForTransactionReceipt({ hash });
if (receipt.status !== "success") {
  console.error(`Transaction failed (status ${receipt.status})`);
  process.exit(1);
}

console.log(`  block:    ${receipt.blockNumber}`);
console.log(`  gasUsed:  ${receipt.gasUsed}`);
for (const log of receipt.logs) {
  try {
    const decoded = decodeEventLog({ abi: ALLOWANCE_REGISTRY_EVENTS_ABI, data: log.data, topics: log.topics });
    const args = Object.fromEntries(Object.entries(decoded.args).map(([k, v]) => [k, typeof v === "bigint" ? v.toString() : v]));
    console.log(`  event:    ${decoded.eventName} ${JSON.stringify(args)}`);
  } catch {
    // not a registry event
  }
}
console.log(`  explorer: https://basescan.org/tx/${hash}`);
