import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getAddress } from "viem";
import {
  ALLOWANCE_REGISTRY_DEPLOYMENTS,
  allowanceRegistryAddress,
  allowanceRegistryDeployment
} from "../src/deployments.mjs";

// --- the Base mainnet record is present and well-formed ----------------------
{
  const base = ALLOWANCE_REGISTRY_DEPLOYMENTS.base;
  assert.ok(base, "Base mainnet deployment record exists");
  assert.equal(base.contract, "AllowanceRegistry");
  assert.equal(base.chainId, 8453);
  assert.equal(base.address, getAddress(base.address), "address is EIP-55 checksummed");
  assert.match(base.txHash, /^0x[0-9a-f]{64}$/);
  assert.ok(Number.isInteger(base.blockNumber) && base.blockNumber > 0);
  assert.ok(base.explorer.includes(base.address), "explorer link points at the address");
}

// --- the constant stays in sync with the deploy artifact ---------------------
{
  const artifact = JSON.parse(readFileSync(new URL("../deployments/base.json", import.meta.url), "utf8"));
  const base = ALLOWANCE_REGISTRY_DEPLOYMENTS.base;
  assert.equal(getAddress(artifact.address), base.address, "address matches deployments/base.json");
  assert.equal(artifact.txHash, base.txHash, "txHash matches deployments/base.json");
  assert.equal(artifact.blockNumber, base.blockNumber, "blockNumber matches deployments/base.json");
  assert.equal(artifact.chainId, base.chainId, "chainId matches deployments/base.json");
}

// --- lookup helpers -----------------------------------------------------------
{
  assert.equal(allowanceRegistryDeployment("base"), ALLOWANCE_REGISTRY_DEPLOYMENTS.base);
  assert.equal(allowanceRegistryDeployment("BASE"), ALLOWANCE_REGISTRY_DEPLOYMENTS.base, "chain key is case-insensitive");
  assert.equal(allowanceRegistryDeployment(8453), ALLOWANCE_REGISTRY_DEPLOYMENTS.base, "numeric chain id resolves");
  assert.equal(allowanceRegistryDeployment("base-sepolia"), null, "undeployed chain returns null");
  assert.equal(allowanceRegistryDeployment(1), null, "unknown chain id returns null");

  assert.equal(allowanceRegistryAddress(), ALLOWANCE_REGISTRY_DEPLOYMENTS.base.address);
  assert.equal(allowanceRegistryAddress("base-sepolia"), null);
}

// --- records are frozen so integrators cannot mutate shared state ------------
{
  assert.ok(Object.isFrozen(ALLOWANCE_REGISTRY_DEPLOYMENTS));
  assert.ok(Object.isFrozen(ALLOWANCE_REGISTRY_DEPLOYMENTS.base));
}

console.log("deployments tests passed");
