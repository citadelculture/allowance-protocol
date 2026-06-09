import assert from "node:assert/strict";
import { ALLOWANCE_REGISTRY_EVENTS_ABI, createRegistryEvents } from "../src/registryEvents.mjs";
import { ALLOWANCE_REGISTRY_DEPLOYMENTS } from "../src/deployments.mjs";

const POLICY_ID = `0x${"11".repeat(32)}`;

function stubClient(logs = []) {
  const calls = [];
  return {
    calls,
    getLogs(params) {
      calls.push(params);
      return Promise.resolve(logs);
    }
  };
}

// --- construction -------------------------------------------------------------
{
  assert.throws(() => createRegistryEvents(), /getLogs/, "requires a client");
  assert.throws(
    () => createRegistryEvents({ client: stubClient(), chain: "base-sepolia" }),
    /No AllowanceRegistry deployment/
  );

  const events = createRegistryEvents({ client: stubClient() });
  assert.equal(events.address, ALLOWANCE_REGISTRY_DEPLOYMENTS.base.address);
  assert.equal(events.deployBlock, BigInt(ALLOWANCE_REGISTRY_DEPLOYMENTS.base.blockNumber));
}

// --- scan bounds and filters ---------------------------------------------------
{
  const client = stubClient();
  const events = createRegistryEvents({ client });

  await events.getReceiptRecordedEvents();
  let call = client.calls.at(-1);
  assert.equal(call.address, ALLOWANCE_REGISTRY_DEPLOYMENTS.base.address);
  assert.equal(call.event.name, "ReceiptRecorded");
  assert.equal(call.fromBlock, BigInt(ALLOWANCE_REGISTRY_DEPLOYMENTS.base.blockNumber), "defaults to the deploy block");
  assert.equal(call.toBlock, "latest");
  assert.equal(call.args, undefined, "no policy filter by default");

  await events.getPolicyCreatedEvents({ policyId: POLICY_ID, fromBlock: 47200000 });
  call = client.calls.at(-1);
  assert.equal(call.event.name, "PolicyCreated");
  assert.deepEqual(call.args, { policyId: POLICY_ID }, "policyId filter is forwarded");
  assert.equal(call.fromBlock, 47200000n, "explicit fromBlock is used");

  await assert.rejects(() => events.getEvents("NotAnEvent"), /Unknown registry event/);
}

// --- decoded log shape -----------------------------------------------------------
{
  const rawLog = {
    blockNumber: 47200123n,
    transactionHash: `0x${"aa".repeat(32)}`,
    logIndex: 3,
    args: { policyId: POLICY_ID, receiptId: `0x${"bb".repeat(32)}`, amount: 18000n }
  };
  const events = createRegistryEvents({ client: stubClient([rawLog]) });
  const [decoded] = await events.getReceiptRecordedEvents({ policyId: POLICY_ID });
  assert.equal(decoded.event, "ReceiptRecorded");
  assert.equal(decoded.blockNumber, 47200123n);
  assert.equal(decoded.transactionHash, rawLog.transactionHash);
  assert.equal(decoded.policyId, POLICY_ID);
  assert.equal(decoded.amount, 18000n);
}

// --- ABI mirrors the contract events ------------------------------------------
{
  const names = ALLOWANCE_REGISTRY_EVENTS_ABI.map((e) => e.name).sort();
  assert.deepEqual(names, ["PolicyActiveSet", "PolicyCreated", "ReceiptRecorded"]);
  const receipt = ALLOWANCE_REGISTRY_EVENTS_ABI.find((e) => e.name === "ReceiptRecorded");
  assert.equal(receipt.inputs.filter((i) => i.indexed).length, 3, "policyId, receiptId, agent indexed");
}

console.log("registryEvents tests passed");
