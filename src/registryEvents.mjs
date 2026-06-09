// Event access for the deployed AllowanceRegistry.
//
// Complements registryReader.mjs: fetch and decode PolicyCreated,
// PolicyActiveSet, and ReceiptRecorded logs through any viem-compatible
// public client (anything exposing `getLogs`), defaulting to the live Base
// deployment. Read-only — never signs or sends transactions.

import { allowanceRegistryDeployment } from "./deployments.mjs";

export const ALLOWANCE_REGISTRY_EVENTS_ABI = [
  {
    type: "event",
    name: "PolicyCreated",
    inputs: [
      { name: "policyId", type: "bytes32", indexed: true },
      { name: "controller", type: "address", indexed: true },
      { name: "agent", type: "address", indexed: true },
      { name: "settlementToken", type: "address", indexed: false },
      { name: "epochCap", type: "uint128", indexed: false },
      { name: "perTxCap", type: "uint128", indexed: false },
      { name: "epochSeconds", type: "uint64", indexed: false },
      { name: "controllerNonce", type: "bytes32", indexed: false }
    ]
  },
  {
    type: "event",
    name: "PolicyActiveSet",
    inputs: [
      { name: "policyId", type: "bytes32", indexed: true },
      { name: "active", type: "bool", indexed: false }
    ]
  },
  {
    type: "event",
    name: "ReceiptRecorded",
    inputs: [
      { name: "policyId", type: "bytes32", indexed: true },
      { name: "receiptId", type: "bytes32", indexed: true },
      { name: "agent", type: "address", indexed: true },
      { name: "merchantId", type: "bytes32", indexed: false },
      { name: "amount", type: "uint128", indexed: false },
      { name: "intentHash", type: "bytes32", indexed: false },
      { name: "intentNonce", type: "bytes32", indexed: false },
      { name: "metadataHash", type: "bytes32", indexed: false }
    ]
  }
];

const EVENT_NAMES = ALLOWANCE_REGISTRY_EVENTS_ABI.map((e) => e.name);

export function createRegistryEvents({ client, address, chain = "base", maxBlockRange = null } = {}) {
  if (!client || typeof client.getLogs !== "function") {
    throw new Error("createRegistryEvents requires a viem-compatible client with getLogs");
  }

  const deployment = address ? null : allowanceRegistryDeployment(chain);
  const registryAddress = address || deployment?.address;
  if (!registryAddress) {
    throw new Error(`No AllowanceRegistry deployment known for chain "${chain}" — pass address explicitly`);
  }

  // Deployment block bounds scans so indexers never walk pre-deploy history.
  const deployBlock = deployment ? BigInt(deployment.blockNumber) : 0n;

  async function getEvents(eventName, { policyId, fromBlock, toBlock = "latest" } = {}) {
    if (!EVENT_NAMES.includes(eventName)) {
      throw new Error(`Unknown registry event "${eventName}". Use: ${EVENT_NAMES.join(", ")}`);
    }
    const event = ALLOWANCE_REGISTRY_EVENTS_ABI.find((e) => e.name === eventName);
    const args = policyId ? { policyId } : undefined;
    const start = fromBlock == null ? deployBlock : BigInt(fromBlock);

    // Many RPC providers cap eth_getLogs spans (e.g. 1500 blocks); when
    // maxBlockRange is set, walk the range in windows instead of one call.
    let logs;
    if (maxBlockRange == null) {
      logs = await client.getLogs({ address: registryAddress, event, args, fromBlock: start, toBlock });
    } else {
      const window = BigInt(maxBlockRange);
      const end = toBlock === "latest" ? BigInt(await client.getBlockNumber()) : BigInt(toBlock);
      logs = [];
      for (let from = start; from <= end; from += window) {
        const to = from + window - 1n < end ? from + window - 1n : end;
        logs.push(...(await client.getLogs({ address: registryAddress, event, args, fromBlock: from, toBlock: to })));
      }
    }

    return logs.map((log) => ({
      event: eventName,
      blockNumber: log.blockNumber,
      transactionHash: log.transactionHash,
      logIndex: log.logIndex,
      ...log.args
    }));
  }

  return {
    address: registryAddress,
    chain: deployment?.chain || chain,
    deployBlock,
    getPolicyCreatedEvents: (options) => getEvents("PolicyCreated", options),
    getPolicyActiveSetEvents: (options) => getEvents("PolicyActiveSet", options),
    getReceiptRecordedEvents: (options) => getEvents("ReceiptRecorded", options),
    getEvents
  };
}
