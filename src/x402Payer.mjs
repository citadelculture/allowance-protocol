// Allow Protocol — x402 "exact" scheme payer (USDC EIP-3009).
//
// Produces a `pay()` function compatible with createAllowFetch. When the
// allowance approves a payment, this signs a USDC `transferWithAuthorization`
// (EIP-3009) off-chain and returns the base64 `X-PAYMENT` header the x402
// standard expects. Signing is fully offline; the facilitator broadcasts it.
//
//   import { privateKeyToAccount } from "viem/accounts";
//   const pay = createX402Payer({ account: privateKeyToAccount(pk) });
//   const fetch = createAllowFetch({ policy, resolveMerchant, pay });
//
// This never holds funds and never broadcasts — it only signs an
// authorization the payer has already been cleared (by policy) to make.

// USDC on Base mainnet / Base Sepolia (EIP-3009 enabled).
export const USDC_ADDRESS = {
  base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  "base-sepolia": "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
};

export const EIP3009_TRANSFER_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" }
  ]
};

function randomNonce32() {
  // `require` does not exist in ESM, so the old CommonJS fallback could never
  // run — fail loudly instead if webcrypto is genuinely missing (Node < 19).
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error("randomNonce32 requires globalThis.crypto (Node 19+ or a browser)");
  }
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return "0x" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function usdcAddressFor(network, override) {
  if (override) return override;
  const key = String(network || "base").toLowerCase().replace("_", "-");
  return USDC_ADDRESS[key] || USDC_ADDRESS.base;
}

// USDC's EIP-712 domain name differs per deployment (read onchain via
// name()/version()): Base mainnet is "USD Coin", Base Sepolia is "USDC".
// Servers should send extra.name; these are the verified fallbacks.
export const USDC_DOMAIN_NAME = {
  base: "USD Coin",
  "base-sepolia": "USDC"
};

// Build the EIP-712 domain for USDC's EIP-3009. chainId comes from the
// requirements/network; name defaults per network when the server omits it.
export function usdcDomain({ chainId, verifyingContract, network, name, version = "2" }) {
  const resolvedName =
    name || USDC_DOMAIN_NAME[String(network || "base").toLowerCase().replace("_", "-")] || "USD Coin";
  return { name: resolvedName, version, chainId: Number(chainId), verifyingContract };
}

// Map an x402 requirements object to the authorization message + domain.
export function buildAuthorization(requirements, { from, chainId, validForSeconds = 60, nonce } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const value = String(requirements.maxAmountRequired ?? requirements.amount ?? "0");
  return {
    from,
    to: requirements.payTo,
    value,
    validAfter: "0",
    validBefore: String(now + Number(validForSeconds)),
    nonce: nonce || randomNonce32()
  };
}

export function createX402Payer(options = {}) {
  const account = options.account;
  if (!account || typeof account.signTypedData !== "function") {
    throw new Error("createX402Payer requires a viem account with signTypedData");
  }

  const chainIds = { base: 8453, "base-sepolia": 84532, ...(options.chainIds || {}) };

  return async function pay(requirements, ctx = {}) {
    const network = String(requirements.network || "base").toLowerCase().replace("_", "-");
    const chainId = Number(requirements.extra?.chainId || chainIds[network] || chainIds.base);
    const verifyingContract = usdcAddressFor(network, requirements.asset && isAddress(requirements.asset) ? requirements.asset : options.usdcAddress);

    const authorization = buildAuthorization(requirements, {
      from: account.address,
      chainId,
      validForSeconds: options.validForSeconds
    });

    const domain = usdcDomain({
      chainId,
      verifyingContract,
      network,
      name: requirements.extra?.name || options.tokenName,
      version: requirements.extra?.version || options.tokenVersion
    });

    const signature = await account.signTypedData({
      domain,
      types: EIP3009_TRANSFER_TYPES,
      primaryType: "TransferWithAuthorization",
      message: {
        from: authorization.from,
        to: authorization.to,
        value: BigInt(authorization.value),
        validAfter: BigInt(authorization.validAfter),
        validBefore: BigInt(authorization.validBefore),
        nonce: authorization.nonce
      }
    });

    const payment = {
      x402Version: Number(ctx.x402Version || requirements.x402Version || 1),
      scheme: requirements.scheme || "exact",
      network,
      payload: { signature, authorization }
    };

    return Buffer.from(JSON.stringify(payment)).toString("base64");
  };
}

function isAddress(value) {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value);
}
