import assert from "node:assert/strict";
import {
  ALLOWANCE_REGISTRY_READ_ABI,
  createRegistryReader,
  normalizeRegistryMerchantId
} from "../src/registryReader.mjs";
import { ALLOWANCE_REGISTRY_DEPLOYMENTS } from "../src/deployments.mjs";
import { merchantIdToRegistryBytes32 } from "../src/registryPolicyIntent.mjs";

const POLICY_ID = `0x${"11".repeat(32)}`;
const NONCE = `0x${"22".repeat(32)}`;
const CONTROLLER = "0x1111111111111111111111111111111111111111";
const AGENT = "0x2222222222222222222222222222222222222222";
const TOKEN = "0x3333333333333333333333333333333333333333";
const ZERO_ADDRESS = `0x${"0".repeat(40)}`;

function stubClient(overrides = {}) {
  const calls = [];
  const responses = {
    policies: [CONTROLLER, AGENT, TOKEN, 1_000_000n, 100_000n, 86_400n, 1_700_000_000n, true],
    spentInEpoch: 250_000n,
    allowedMerchant: true,
    usedIntentNonce: false,
    ...overrides
  };
  return {
    calls,
    readContract({ address, abi, functionName, args }) {
      calls.push({ address, abi, functionName, args });
      return Promise.resolve(responses[functionName]);
    }
  };
}

// --- construction -------------------------------------------------------------
{
  assert.throws(() => createRegistryReader(), /readContract/, "requires a client");
  assert.throws(
    () => createRegistryReader({ client: stubClient(), chain: "base-sepolia" }),
    /No AllowanceRegistry deployment/,
    "unknown chain without explicit address throws"
  );

  const reader = createRegistryReader({ client: stubClient() });
  assert.equal(reader.address, ALLOWANCE_REGISTRY_DEPLOYMENTS.base.address, "defaults to the live Base deployment");
  assert.equal(reader.chain, "base");

  const custom = createRegistryReader({ client: stubClient(), address: AGENT, chain: "base-sepolia" });
  assert.equal(custom.address, AGENT, "explicit address overrides deployment lookup");
}

// --- merchant id normalization -------------------------------------------------
{
  const raw = `0x${"ab".repeat(32)}`;
  assert.equal(normalizeRegistryMerchantId(raw), raw, "bytes32 ids pass through");
  assert.equal(
    normalizeRegistryMerchantId("mcp_search"),
    merchantIdToRegistryBytes32("mcp_search"),
    "human merchant keys hash like createPolicy intents"
  );
  assert.throws(() => normalizeRegistryMerchantId(""), /required/);
}

// --- reads --------------------------------------------------------------------
{
  const client = stubClient();
  const reader = createRegistryReader({ client });

  const policy = await reader.getPolicy(POLICY_ID);
  assert.equal(policy.controller, CONTROLLER);
  assert.equal(policy.agent, AGENT);
  assert.equal(policy.active, true);
  assert.equal(policy.policyId, POLICY_ID);

  assert.equal(await reader.getSpentInEpoch(POLICY_ID), 250_000n);
  assert.equal(await reader.isMerchantAllowed(POLICY_ID, "mcp_search"), true);
  assert.equal(await reader.isIntentNonceUsed(POLICY_ID, NONCE), false);

  const merchantCall = client.calls.find((c) => c.functionName === "allowedMerchant");
  assert.equal(merchantCall.args[1], merchantIdToRegistryBytes32("mcp_search"), "merchant key hashed before read");
  assert.ok(client.calls.every((c) => c.abi === ALLOWANCE_REGISTRY_READ_ABI));
  assert.ok(client.calls.every((c) => c.address === ALLOWANCE_REGISTRY_DEPLOYMENTS.base.address));
}

// --- missing policy returns null ------------------------------------------------
{
  const client = stubClient({ policies: [ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, 0n, 0n, 0n, 0n, false] });
  const reader = createRegistryReader({ client });
  assert.equal(await reader.getPolicy(POLICY_ID), null);
  assert.equal(await reader.remainingEpochAllowance(POLICY_ID), null);
}

// --- remaining allowance math ---------------------------------------------------
{
  const inEpoch = 1_700_000_000 + 100; // within the 86400s epoch
  const reader = createRegistryReader({ client: stubClient() });
  const result = await reader.remainingEpochAllowance(POLICY_ID, { now: inEpoch });
  assert.equal(result.spent, 250_000n);
  assert.equal(result.remaining, 750_000n);
  assert.equal(result.epochRolledOver, false);
}

{
  const afterEpoch = 1_700_000_000 + 86_400;
  const reader = createRegistryReader({ client: stubClient({ spentInEpoch: 999_999_999n }) });
  const result = await reader.remainingEpochAllowance(POLICY_ID, { now: afterEpoch });
  assert.equal(result.remaining, 1_000_000n, "rolled-over epoch restores the full cap");
  assert.equal(result.spent, 0n);
  assert.equal(result.epochRolledOver, true);
}

{
  const reader = createRegistryReader({ client: stubClient({ spentInEpoch: 2_000_000n }) });
  const result = await reader.remainingEpochAllowance(POLICY_ID, { now: 1_700_000_000 + 100 });
  assert.equal(result.remaining, 0n, "overspend clamps to zero instead of underflowing");
}

{
  const inactive = stubClient({ policies: [CONTROLLER, AGENT, TOKEN, 1_000_000n, 100_000n, 86_400n, 1_700_000_000n, false] });
  const reader = createRegistryReader({ client: inactive });
  const result = await reader.remainingEpochAllowance(POLICY_ID, { now: 1_700_000_000 + 100 });
  assert.equal(result.remaining, 0n, "inactive policies have no spendable allowance");
  assert.equal(result.policy.active, false);
}

console.log("registryReader tests passed");
