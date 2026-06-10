import assert from "node:assert/strict";
import { verifyTypedData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  createAllowFetch,
  parseX402ChallengeHeader,
  selectPaymentRequirements,
  normalizeX402Network,
  PAYMENT_REQUIRED_HEADER_V2,
  PAYMENT_SIGNATURE_HEADER_V2
} from "../src/allowFetch.mjs";
import { createX402Payer, usdcDomain, EIP3009_TRANSFER_TYPES, USDC_ADDRESS } from "../src/x402Payer.mjs";

// Captured live from https://www.x402.org/protected on 2026-06-09: a real
// x402 v2 PAYMENT-REQUIRED header (Base Sepolia USDC + a Solana option).
const LIVE_CHALLENGE_HEADER =
  "eyJ4NDAyVmVyc2lvbiI6MiwiZXJyb3IiOiJQYXltZW50IHJlcXVpcmVkIiwicmVzb3VyY2UiOnsidXJsIjoiaHR0cHM6Ly93d3cueDQwMi5vcmcvcHJvdGVjdGVkIiwiZGVzY3JpcHRpb24iOiJBY2Nlc3MgdG8gcHJvdGVjdGVkIGNvbnRlbnQiLCJtaW1lVHlwZSI6IiJ9LCJhY2NlcHRzIjpbeyJzY2hlbWUiOiJleGFjdCIsIm5ldHdvcmsiOiJlaXAxNTU6ODQ1MzIiLCJhbW91bnQiOiIxMDAwMCIsImFzc2V0IjoiMHgwMzZDYkQ1Mzg0MmM1NDI2NjM0ZTc5Mjk1NDFlQzIzMThmM2RDRjdlIiwicGF5VG8iOiIweDIwOTY5M0JjNmFmYzBDNTMyOGJBMzZGYUYwM0M1MTRFRjMxMjI4N0MiLCJtYXhUaW1lb3V0U2Vjb25kcyI6MzAwLCJleHRyYSI6eyJuYW1lIjoiVVNEQyIsInZlcnNpb24iOiIyIn19LHsic2NoZW1lIjoiZXhhY3QiLCJuZXR3b3JrIjoic29sYW5hOkV0V1RSQUJaYVlxNmlNZmVZS291UnUxNjZWVTJ4cWExIiwiYW1vdW50IjoiMTAwMDAiLCJhc3NldCI6IjR6TU1DOXNydDVSaTVYMTRHQWdYaGFIaWkzR25QQUVFUllQSmdaSkRuY0RVIiwicGF5VG8iOiJDS1BLSldOZEpFcWE4MXg3Q2taMTRCVlBpWTZ5MTZTeHM3b3d6bnF0V1lwNSIsIm1heFRpbWVvdXRTZWNvbmRzIjozMDAsImV4dHJhIjp7ImZlZVBheWVyIjoiQ0tQS0pXTmRKRXFhODF4N0NrWjE0QlZQaVk2eTE2U3hzN293em5xdFdZcDUifX1dfQ==";

// --- network id normalization -------------------------------------------------
{
  assert.deepEqual(normalizeX402Network("base"), { key: "base", chainId: 8453, raw: "base" });
  assert.deepEqual(normalizeX402Network("eip155:84532"), { key: "base-sepolia", chainId: 84532, raw: "eip155:84532" });
  assert.deepEqual(normalizeX402Network("eip155:8453").key, "base");
  assert.equal(normalizeX402Network("solana:EtWT").chainId, null);
}

// --- the real captured v2 header parses ----------------------------------------
{
  const challenge = parseX402ChallengeHeader(LIVE_CHALLENGE_HEADER);
  assert.equal(challenge.x402Version, 2);
  assert.equal(challenge.accepts.length, 2);
  assert.equal(challenge.resource.url, "https://www.x402.org/protected");

  const chosen = selectPaymentRequirements(challenge.accepts);
  assert.equal(chosen.network, "eip155:84532", "EVM option chosen");
  assert.equal(chosen.asset, USDC_ADDRESS["base-sepolia"], "the live asset is canonical Base Sepolia USDC");

  // Even with the Solana option first, selection lands on the payable network.
  const reversed = selectPaymentRequirements([...challenge.accepts].reverse());
  assert.equal(reversed.network, "eip155:84532");

  assert.equal(parseX402ChallengeHeader(""), null);
  assert.equal(parseX402ChallengeHeader("not-base64!!"), null);
}

// --- full v2 flow: header challenge in, PAYMENT-SIGNATURE out -------------------
{
  const account = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
  const seen = [];
  const fetchImpl = async (url, init = {}) => {
    seen.push(init);
    const sig = init.headers?.[PAYMENT_SIGNATURE_HEADER_V2];
    if (!sig) {
      return new Response("{}", { status: 402, headers: { [PAYMENT_REQUIRED_HEADER_V2]: LIVE_CHALLENGE_HEADER } });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  const af = createAllowFetch({
    fetchImpl,
    policy: { spentTodayUsd: 0 },
    resolveMerchant: () => "mcp_search",
    intentNonce: "v2-live-1",
    pay: createX402Payer({ account })
  });

  const res = await af("https://www.x402.org/protected");
  assert.equal(res.status, 200, "v2 flow settles");

  const header = seen[1].headers[PAYMENT_SIGNATURE_HEADER_V2];
  assert.ok(header, "payment went out as PAYMENT-SIGNATURE");
  assert.equal(seen[1].headers["x-payment"], undefined, "no v1 header on a v2 flow");

  const payload = JSON.parse(Buffer.from(header, "base64").toString("utf8"));
  assert.equal(payload.x402Version, 2);
  assert.equal(payload.resource.url, "https://www.x402.org/protected");
  assert.equal(payload.accepted.network, "eip155:84532");
  assert.equal(payload.payload.authorization.to, "0x209693Bc6afc0C5328bA36FaF03C514EF312287C");
  assert.equal(payload.payload.authorization.value, "10000");

  // The signature must verify under the Base Sepolia USDC domain (chain 84532).
  const auth = payload.payload.authorization;
  const valid = await verifyTypedData({
    address: account.address,
    domain: usdcDomain({ chainId: 84532, verifyingContract: USDC_ADDRESS["base-sepolia"], network: "base-sepolia" }),
    types: EIP3009_TRANSFER_TYPES,
    primaryType: "TransferWithAuthorization",
    message: {
      from: auth.from,
      to: auth.to,
      value: BigInt(auth.value),
      validAfter: BigInt(auth.validAfter),
      validBefore: BigInt(auth.validBefore),
      nonce: auth.nonce
    },
    signature: payload.payload.signature
  });
  assert.equal(valid, true, "CAIP-2 network produced the correct chain domain");
}

// --- settlement responses are decoded and persisted -----------------------------
{
  const account = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
  const settlement = { success: true, transaction: "0x" + "ab".repeat(32), network: "eip155:84532", payer: account.address };
  const stored = [];
  const fetchImpl = async (url, init = {}) => {
    if (!init.headers?.[PAYMENT_SIGNATURE_HEADER_V2]) {
      return new Response("{}", { status: 402, headers: { [PAYMENT_REQUIRED_HEADER_V2]: LIVE_CHALLENGE_HEADER } });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "payment-response": Buffer.from(JSON.stringify(settlement)).toString("base64") }
    });
  };
  const af = createAllowFetch({
    fetchImpl,
    policy: { spentTodayUsd: 0 },
    resolveMerchant: () => "mcp_search",
    intentNonce: "v2-settle-1",
    receiptStore: { record: async (entry) => stored.push(entry) },
    pay: createX402Payer({ account })
  });

  const res = await af("https://www.x402.org/protected");
  assert.equal(res.status, 200);
  assert.deepEqual(res.allowSettlement, settlement, "settlement surfaced on the response");
  const settledEntry = stored.find((e) => e.decision === "settled");
  assert.ok(settledEntry, "a settled record was persisted");
  assert.equal(settledEntry.receipt.settlement.transaction, settlement.transaction, "receipt carries the tx hash");
}

console.log("allowFetchV2 tests passed");
