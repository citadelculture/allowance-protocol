// Deploy AllowanceRegistry to Base (or any EVM chain). No-custody registry;
// deploying it does not move user funds. Run the offline compile first.
//
//   node scripts/compile-registry.mjs
//   ALLOW_DEPLOY_PK=0x... ALLOW_RPC_URL=https://mainnet.base.org node scripts/deploy-registry.mjs
//
// Env:
//   ALLOW_DEPLOY_PK   deployer private key (0x-prefixed)
//   ALLOW_RPC_URL     EVM RPC endpoint (default Base mainnet public RPC)
//   ALLOW_CHAIN       "base" (default) or "base-sepolia"
//
// Safe by default: refuses to run without an explicit key, prints the
// deployer + balance, and writes deployments/<chain>.json on success.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createWalletClient, createPublicClient, http, formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const CHAINS = {
  base: { chain: base, defaultRpc: "https://mainnet.base.org", explorer: "https://basescan.org" },
  "base-sepolia": { chain: baseSepolia, defaultRpc: "https://sepolia.base.org", explorer: "https://sepolia.basescan.org" }
};

const chainKey = (process.env.ALLOW_CHAIN || "base").toLowerCase();
const selected = CHAINS[chainKey];
if (!selected) {
  console.error(`Unknown ALLOW_CHAIN "${chainKey}". Use: ${Object.keys(CHAINS).join(", ")}`);
  process.exit(1);
}

const pk = process.env.ALLOW_DEPLOY_PK;
if (!pk) {
  console.error("Refusing to deploy: set ALLOW_DEPLOY_PK to the deployer private key.");
  process.exit(1);
}

let artifact;
try {
  artifact = JSON.parse(readFileSync(join(root, "build/AllowanceRegistry.json"), "utf8"));
} catch {
  console.error("Missing build/AllowanceRegistry.json — run: node scripts/compile-registry.mjs");
  process.exit(1);
}

const rpcUrl = process.env.ALLOW_RPC_URL || selected.defaultRpc;
const account = privateKeyToAccount(pk.startsWith("0x") ? pk : `0x${pk}`);

const publicClient = createPublicClient({ chain: selected.chain, transport: http(rpcUrl) });
const walletClient = createWalletClient({ account, chain: selected.chain, transport: http(rpcUrl) });

console.log(`Deploying AllowanceRegistry`);
console.log(`  chain:    ${chainKey} (id ${selected.chain.id})`);
console.log(`  rpc:      ${rpcUrl}`);
console.log(`  deployer: ${account.address}`);

const balance = await publicClient.getBalance({ address: account.address });
console.log(`  balance:  ${formatEther(balance)} ETH`);
if (balance === 0n) {
  console.error("Deployer has 0 ETH — fund it before deploying.");
  process.exit(1);
}

const hash = await walletClient.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode });
console.log(`  tx:       ${hash}`);
console.log(`  waiting for confirmation...`);

const receipt = await publicClient.waitForTransactionReceipt({ hash });
if (receipt.status !== "success" || !receipt.contractAddress) {
  console.error(`Deployment failed (status ${receipt.status}).`);
  process.exit(1);
}

const record = {
  contract: "AllowanceRegistry",
  chain: chainKey,
  chainId: selected.chain.id,
  address: receipt.contractAddress,
  deployer: account.address,
  txHash: hash,
  blockNumber: Number(receipt.blockNumber),
  compiler: artifact.compiler,
  deployedAt: new Date().toISOString()
};

mkdirSync(join(root, "deployments"), { recursive: true });
writeFileSync(join(root, `deployments/${chainKey}.json`), JSON.stringify(record, null, 2));

console.log(`\nDeployed AllowanceRegistry`);
console.log(`  address:  ${receipt.contractAddress}`);
console.log(`  explorer: ${selected.explorer}/address/${receipt.contractAddress}`);
console.log(`  record:   deployments/${chainKey}.json`);
console.log(`\nVerify on Basescan:`);
console.log(
  `  npx @nomicfoundation/hardhat-verify --network ${chainKey} ${receipt.contractAddress}  (or use the Basescan UI single-file verifier with contracts/AllowanceRegistry.sol)`
);
