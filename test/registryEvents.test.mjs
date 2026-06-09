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

// --- chunked scanning respects provider getLogs caps ----------------------------
{
  const client = stubClient();
  client.getBlockNumber = () => Promise.resolve(47121983n + 2999n);
  const events = createRegistryEvents({ client, maxBlockRange: 1000 });
  await events.getReceiptRecordedEvents();
  const windows = client.calls.map((c) => [c.fromBlock, c.toBlock]);
  assert.equal(windows.length, 3, "3000 blocks at range 1000 = 3 windows");
  assert.deepEqual(windows[0], [47121983n, 47122982n]);
  assert.deepEqual(windows[1], [47122983n, 47123982n]);
  assert.deepEqual(windows[2], [47123983n, 47124982n], "last window clamps to the latest block");
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

// --- watchEvents: cursor advances, no re-delivery, ordered output ---------------
{
  const log = (block, logIndex, name) => ({
    blockNumber: BigInt(block),
    transactionHash: `0x${"cc".repeat(32)}`,
    logIndex,
    args: { policyId: POLICY_ID }
  });
  let latest = 47121990n;
  const byCall = [
    // first poll: two events out of order across the event types
    { ReceiptRecorded: [log(47121990, 5)], PolicyCreated: [log(47121990, 2)], PolicyActiveSet: [] },
    // second poll: one new event
    { ReceiptRecorded: [log(47121995, 0)], PolicyCreated: [], PolicyActiveSet: [] }
  ];
  let pollIndex = 0;
  const client = {
    getBlockNumber: () => Promise.resolve(latest),
    getLogs: ({ event, fromBlock }) => {
      const batch = byCall[pollIndex]?.[event.name] || [];
      return Promise.resolve(batch.filter((l) => l.blockNumber >= fromBlock));
    }
  };

  const events = createRegistryEvents({ client });
  const seen = [];
  const stop = events.watchEvents({ pollMs: 1_000_000, onEvent: (e) => seen.push(`${e.event}@${e.blockNumber}.${e.logIndex}`) });

  await new Promise((r) => setTimeout(r, 10)); // let the immediate first poll finish
  assert.deepEqual(seen, ["PolicyCreated@47121990.2", "ReceiptRecorded@47121990.5"], "first poll ordered by block/logIndex");

  pollIndex = 1;
  latest = 47121995n;
  // run a second poll manually by calling the internal interval path: emulate via another watch tick
  // (watchEvents polls on an interval; for the test we restart from the advanced cursor)
  stop();
  const stop2 = events.watchEvents({
    fromBlock: 47121991n,
    pollMs: 1_000_000,
    onEvent: (e) => seen.push(`${e.event}@${e.blockNumber}.${e.logIndex}`)
  });
  await new Promise((r) => setTimeout(r, 10));
  stop2();
  assert.deepEqual(
    seen,
    ["PolicyCreated@47121990.2", "ReceiptRecorded@47121990.5", "ReceiptRecorded@47121995.0"],
    "cursor restart never re-delivers earlier events"
  );
}

console.log("registryEvents tests passed");
