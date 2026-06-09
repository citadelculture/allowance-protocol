// Canonical onchain deployments of the Allow Protocol contracts.
//
// These records mirror the JSON artifacts written by scripts/deploy-registry.mjs
// under deployments/. They are exported as constants so integrators can resolve
// the live registry without filesystem access (browsers, bundlers, edge runtimes).

export const ALLOWANCE_REGISTRY_DEPLOYMENTS = Object.freeze({
  base: Object.freeze({
    contract: "AllowanceRegistry",
    chain: "base",
    chainId: 8453,
    address: "0x047B375f044B76efBdCE655Ab6b7EE142129c266",
    deployer: "0xFB7F313f9C7b129a6744Bc8866518F5040337BdF",
    txHash: "0xaa7f127ba8a15b4bbe64ba3f1ddad9c5973286506dbaec29c4d3019c1f83f636",
    blockNumber: 47121983,
    explorer: "https://basescan.org/address/0x047B375f044B76efBdCE655Ab6b7EE142129c266",
    deployedAt: "2026-06-09T19:28:32.697Z"
  })
});

// Resolve a deployment record by chain key ("base") or numeric chain id (8453).
// Returns null for chains the registry has not been deployed to.
export function allowanceRegistryDeployment(chain = "base") {
  if (typeof chain === "number") {
    return (
      Object.values(ALLOWANCE_REGISTRY_DEPLOYMENTS).find((d) => d.chainId === chain) || null
    );
  }
  return ALLOWANCE_REGISTRY_DEPLOYMENTS[String(chain).toLowerCase()] || null;
}

// Convenience: the live registry address for a chain, or null if not deployed.
export function allowanceRegistryAddress(chain = "base") {
  return allowanceRegistryDeployment(chain)?.address || null;
}
