// Read-only client for the deployed AllowanceRegistry.
//
// Lets integrators inspect onchain policies, epoch spend, merchant allowlists,
// and receipt-nonce replay state without holding a key or sending transactions.
// Works with any viem-compatible public client (anything exposing
// `readContract`); the live Base deployment is the default target.

import { allowanceRegistryDeployment } from "./deployments.mjs";
import { merchantIdToRegistryBytes32 } from "./registryPolicyIntent.mjs";

export const ALLOWANCE_REGISTRY_READ_ABI = [
  {
    type: "function",
    name: "policies",
    stateMutability: "view",
    inputs: [{ name: "policyId", type: "bytes32" }],
    outputs: [
      { name: "controller", type: "address" },
      { name: "agent", type: "address" },
      { name: "settlementToken", type: "address" },
      { name: "epochCap", type: "uint128" },
      { name: "perTxCap", type: "uint128" },
      { name: "epochSeconds", type: "uint64" },
      { name: "epochStartedAt", type: "uint64" },
      { name: "active", type: "bool" }
    ]
  },
  {
    type: "function",
    name: "spentInEpoch",
    stateMutability: "view",
    inputs: [{ name: "policyId", type: "bytes32" }],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "allowedMerchant",
    stateMutability: "view",
    inputs: [
      { name: "policyId", type: "bytes32" },
      { name: "merchantId", type: "bytes32" }
    ],
    outputs: [{ name: "", type: "bool" }]
  },
  {
    type: "function",
    name: "usedIntentNonce",
    stateMutability: "view",
    inputs: [
      { name: "policyId", type: "bytes32" },
      { name: "intentNonce", type: "bytes32" }
    ],
    outputs: [{ name: "", type: "bool" }]
  }
];

const ZERO_ADDRESS = `0x${"0".repeat(40)}`;
const BYTES32_PATTERN = /^0x[0-9a-fA-F]{64}$/;

// Accept either a raw bytes32 merchant id or a human merchant key (e.g.
// "mcp_search"), hashing the latter the same way createPolicy intents do.
export function normalizeRegistryMerchantId(merchantId) {
  const value = String(merchantId || "");
  if (BYTES32_PATTERN.test(value)) return value;
  if (!value) throw new Error("merchantId is required");
  return merchantIdToRegistryBytes32(value);
}

export function createRegistryReader({ client, address, chain = "base" } = {}) {
  if (!client || typeof client.readContract !== "function") {
    throw new Error("createRegistryReader requires a viem-compatible client with readContract");
  }

  const deployment = address ? null : allowanceRegistryDeployment(chain);
  const registryAddress = address || deployment?.address;
  if (!registryAddress) {
    throw new Error(`No AllowanceRegistry deployment known for chain "${chain}" — pass address explicitly`);
  }

  const read = (functionName, args) =>
    client.readContract({ address: registryAddress, abi: ALLOWANCE_REGISTRY_READ_ABI, functionName, args });

  async function getPolicy(policyId) {
    const [controller, agent, settlementToken, epochCap, perTxCap, epochSeconds, epochStartedAt, active] =
      await read("policies", [policyId]);
    if (!controller || controller.toLowerCase() === ZERO_ADDRESS) return null;
    return { policyId, controller, agent, settlementToken, epochCap, perTxCap, epochSeconds, epochStartedAt, active };
  }

  async function getSpentInEpoch(policyId) {
    return BigInt(await read("spentInEpoch", [policyId]));
  }

  async function isMerchantAllowed(policyId, merchantId) {
    return Boolean(await read("allowedMerchant", [policyId, normalizeRegistryMerchantId(merchantId)]));
  }

  async function isIntentNonceUsed(policyId, intentNonce) {
    return Boolean(await read("usedIntentNonce", [policyId, intentNonce]));
  }

  // Spendable amount in the current epoch, mirroring recordReceipt's rollover:
  // once epochStartedAt + epochSeconds has passed, the full cap is available.
  async function remainingEpochAllowance(policyId, { now = Math.floor(Date.now() / 1000) } = {}) {
    const policy = await getPolicy(policyId);
    if (!policy) return null;
    const cap = BigInt(policy.epochCap);
    if (!policy.active) return { policy, spent: null, remaining: 0n, epochRolledOver: false };
    if (BigInt(now) >= BigInt(policy.epochStartedAt) + BigInt(policy.epochSeconds)) {
      return { policy, spent: 0n, remaining: cap, epochRolledOver: true };
    }
    const spent = await getSpentInEpoch(policyId);
    const remaining = spent >= cap ? 0n : cap - spent;
    return { policy, spent, remaining, epochRolledOver: false };
  }

  return {
    address: registryAddress,
    chain: deployment?.chain || chain,
    getPolicy,
    getSpentInEpoch,
    isMerchantAllowed,
    isIntentNonceUsed,
    remainingEpochAllowance
  };
}
