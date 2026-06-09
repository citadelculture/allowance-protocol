// Compile contracts/AllowanceRegistry.sol with solc (fully offline).
// Emits build/AllowanceRegistry.json with abi + bytecode for deployment.
//
//   node scripts/compile-registry.mjs

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import solc from "solc";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(join(root, "contracts/AllowanceRegistry.sol"), "utf8");

const input = {
  language: "Solidity",
  sources: { "AllowanceRegistry.sol": { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: "cancun",
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } }
  }
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = (output.errors || []).filter((e) => e.severity === "error");
if (errors.length > 0) {
  console.error(errors.map((e) => e.formattedMessage).join("\n"));
  process.exit(1);
}

const contract = output.contracts["AllowanceRegistry.sol"].AllowanceRegistry;
const artifact = {
  contractName: "AllowanceRegistry",
  compiler: solc.version(),
  abi: contract.abi,
  bytecode: "0x" + contract.evm.bytecode.object
};

mkdirSync(join(root, "build"), { recursive: true });
const outPath = join(root, "build/AllowanceRegistry.json");
writeFileSync(outPath, JSON.stringify(artifact, null, 2));

console.log(`Compiled AllowanceRegistry with ${artifact.compiler}`);
console.log(`  abi entries:   ${artifact.abi.length}`);
console.log(`  bytecode size: ${(artifact.bytecode.length - 2) / 2} bytes`);
console.log(`  written:       build/AllowanceRegistry.json`);
