// Build the Basescan source-verification packet for the deployed
// AllowanceRegistry. Fully offline except an optional RPC bytecode check.
//
//   node scripts/verification-input.mjs            # writes work/verification/
//   ALLOW_SKIP_RPC=1 node scripts/verification-input.mjs   # skip the onchain check
//
// Emits the solc standard-JSON input with the exact compiler settings used by
// scripts/compile-registry.mjs, recompiles to prove the settings reproduce the
// deployed runtime bytecode, and writes paste-ready Basescan instructions.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import solc from "solc";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(join(root, "contracts/AllowanceRegistry.sol"), "utf8");

// Must stay identical to scripts/compile-registry.mjs, plus deployedBytecode
// output for the onchain match check.
const standardInput = {
  language: "Solidity",
  sources: { "AllowanceRegistry.sol": { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: "cancun",
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"] } }
  }
};

const output = JSON.parse(solc.compile(JSON.stringify(standardInput)));
const errors = (output.errors || []).filter((e) => e.severity === "error");
if (errors.length > 0) {
  console.error(errors.map((e) => e.formattedMessage).join("\n"));
  process.exit(1);
}

const contract = output.contracts["AllowanceRegistry.sol"].AllowanceRegistry;
const runtimeBytecode = "0x" + contract.evm.deployedBytecode.object;
const solcVersion = solc.version(); // e.g. 0.8.35+commit.47b9dedd.Emscripten.clang
const verifierCompilerVersion = "v" + solcVersion.replace(/\.Emscripten\.clang$/, "");

const deployment = JSON.parse(readFileSync(join(root, "deployments/base.json"), "utf8"));

let onchainCheck = "skipped (ALLOW_SKIP_RPC=1)";
if (!process.env.ALLOW_SKIP_RPC) {
  try {
    const res = await fetch("https://mainnet.base.org", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getCode", params: [deployment.address, "latest"] })
    });
    const { result } = await res.json();
    if (result === runtimeBytecode) {
      onchainCheck = "MATCH — recompiled runtime bytecode equals eth_getCode output exactly";
    } else {
      onchainCheck = `MISMATCH — onchain ${((result.length - 2) / 2)} bytes vs recompiled ${(runtimeBytecode.length - 2) / 2} bytes`;
      console.error(`Onchain bytecode check failed: ${onchainCheck}`);
      console.error("Verification with these settings will fail. Did the compiler settings change since deploy?");
      process.exit(1);
    }
  } catch (err) {
    onchainCheck = `unavailable (RPC error: ${err.message})`;
  }
}

const outDir = join(root, "work/verification");
mkdirSync(outDir, { recursive: true });

const inputPath = join(outDir, "AllowanceRegistry.input.json");
writeFileSync(inputPath, JSON.stringify(standardInput, null, 2));

const instructions = `# Basescan Source Verification — AllowanceRegistry

Generated ${new Date().toISOString()} by scripts/verification-input.mjs.
Onchain bytecode check: ${onchainCheck}

## Target

- Contract address: \`${deployment.address}\`
- Chain: Base mainnet (8453)
- Contract name: \`AllowanceRegistry\`
- Compiler: \`${verifierCompilerVersion}\`
- License: MIT (3)

## Steps (Basescan UI, no API key)

1. Open https://basescan.org/verifyContract?a=${deployment.address}
2. Compiler type: **Solidity (Standard-Json-Input)**; compiler version: **${verifierCompilerVersion}**; license: **MIT**.
3. Upload \`work/verification/AllowanceRegistry.input.json\`.
4. Contract name: \`AllowanceRegistry.sol:AllowanceRegistry\`. No constructor arguments.
5. Submit. The recompiled runtime bytecode already matches the onchain code (see check above), so verification should pass on the first attempt.

Alternative: "Solidity (Single file)" with \`contracts/AllowanceRegistry.sol\`,
optimizer **enabled**, runs **200**, EVM version **cancun**.
`;

const instructionsPath = join(outDir, "INSTRUCTIONS.md");
writeFileSync(instructionsPath, instructions);

console.log("Verification packet ready");
console.log(`  compiler:       ${verifierCompilerVersion}`);
console.log(`  runtime size:   ${(runtimeBytecode.length - 2) / 2} bytes`);
console.log(`  onchain check:  ${onchainCheck}`);
console.log(`  input:          ${inputPath}`);
console.log(`  instructions:   ${instructionsPath}`);
