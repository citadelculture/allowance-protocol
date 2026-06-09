import assert from "node:assert/strict";
import { privateKeyToAccount } from "viem/accounts";
import { verifyTypedData } from "viem";
import { createX402Payer, EIP3009_TRANSFER_TYPES, usdcDomain, USDC_ADDRESS, buildAuthorization } from "../src/x402Payer.mjs";
import { createAllowFetch, PAYMENT_HEADER } from "../src/allowFetch.mjs";

// Deterministic throwaway test key (not a funded account).
const account = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");

const requirements = {
  scheme: "exact",
  network: "base",
  asset: USDC_ADDRESS.base,
  payTo: "0x000000000000000000000000000000000000dEaD",
  maxAmountRequired: "18000", // 0.018 USDC
  extra: { decimals: 6 }
};

const pay = createX402Payer({ account });

// --- signed authorization recovers to the signer (offline correctness) ------
{
  const header = await pay(requirements, { x402Version: 1 });
  const payment = JSON.parse(Buffer.from(header, "base64").toString("utf8"));

  assert.equal(payment.scheme, "exact");
  assert.equal(payment.network, "base");
  assert.equal(payment.payload.authorization.from, account.address);
  assert.equal(payment.payload.authorization.to, requirements.payTo);
  assert.equal(payment.payload.authorization.value, "18000");
  assert.match(payment.payload.signature, /^0x[0-9a-fA-F]+$/);

  const auth = payment.payload.authorization;
  const valid = await verifyTypedData({
    address: account.address,
    domain: usdcDomain({ chainId: 8453, verifyingContract: USDC_ADDRESS.base }),
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
    signature: payment.payload.signature
  });
  assert.equal(valid, true, "EIP-3009 signature must recover to the payer");
}

// --- base-sepolia uses the testnet USDC + chainId --------------------------
{
  const header = await pay({ ...requirements, network: "base-sepolia", asset: USDC_ADDRESS["base-sepolia"] });
  const payment = JSON.parse(Buffer.from(header, "base64").toString("utf8"));
  assert.equal(payment.network, "base-sepolia");
  const auth = payment.payload.authorization;
  const valid = await verifyTypedData({
    address: account.address,
    domain: usdcDomain({ chainId: 84532, verifyingContract: USDC_ADDRESS["base-sepolia"], network: "base-sepolia" }),
    types: EIP3009_TRANSFER_TYPES,
    primaryType: "TransferWithAuthorization",
    message: {
      from: auth.from, to: auth.to, value: BigInt(auth.value),
      validAfter: BigInt(auth.validAfter), validBefore: BigInt(auth.validBefore), nonce: auth.nonce
    },
    signature: payment.payload.signature
  });
  assert.equal(valid, true, "testnet signature must recover to the payer");
}

// --- buildAuthorization sets a future expiry -------------------------------
{
  const auth = buildAuthorization(requirements, { from: account.address, validForSeconds: 120 });
  assert.ok(Number(auth.validBefore) > Math.floor(Date.now() / 1000), "validBefore is in the future");
  assert.equal(auth.validAfter, "0");
}

// --- end to end: allowance approves, payer signs, request settles -----------
{
  const mockFetch = async (url, init = {}) => {
    if (!init.headers?.[PAYMENT_HEADER]) {
      return new Response(JSON.stringify({ x402Version: 1, accepts: [requirements] }), {
        status: 402, headers: { "content-type": "application/json" }
      });
    }
    // Confirm the header carries a recoverable signed authorization.
    const payment = JSON.parse(Buffer.from(init.headers[PAYMENT_HEADER], "base64").toString("utf8"));
    assert.equal(payment.payload.authorization.from, account.address);
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  const allowFetch = createAllowFetch({
    fetchImpl: mockFetch,
    policy: { spentTodayUsd: 0 },
    resolveMerchant: () => "mcp_search",
    intentNonce: "payer-e2e-1",
    pay
  });

  const res = await allowFetch("https://api.example.com/search");
  assert.equal(res.status, 200, "allowance + real signed payment settles");
  assert.equal(allowFetch.receipts.length, 1);
}

// --- USDC domain name defaults per network (verified onchain) ---------------

{
  const { usdcDomain, USDC_DOMAIN_NAME } = await import("../src/x402Payer.mjs");
  assert.equal(USDC_DOMAIN_NAME.base, "USD Coin");
  assert.equal(USDC_DOMAIN_NAME["base-sepolia"], "USDC");

  const mainnet = usdcDomain({ chainId: 8453, verifyingContract: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", network: "base" });
  assert.equal(mainnet.name, "USD Coin", "Base mainnet USDC domain name");
  assert.equal(mainnet.version, "2");

  const sepolia = usdcDomain({ chainId: 84532, verifyingContract: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", network: "base-sepolia" });
  assert.equal(sepolia.name, "USDC", "Base Sepolia USDC domain name differs from mainnet");

  const explicit = usdcDomain({ chainId: 84532, verifyingContract: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", network: "base-sepolia", name: "Custom" });
  assert.equal(explicit.name, "Custom", "server-provided extra.name wins over the fallback");
}

console.log("x402Payer tests passed");
