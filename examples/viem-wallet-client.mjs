import { createWalletClient, custom } from "viem";
import { baseSepolia } from "viem/chains";
import {
  DEFAULT_POLICY,
  createWalletClientPolicyAdapter
} from "../src/index.mjs";

const account = "0x0000000000000000000000000000000000000001";
const recipient = "0x0000000000000000000000000000000000000002";
const memo = process.argv.slice(2).join(" ") || "public Base wallet request";
const providerCalls = [];

const walletClient = createWalletClient({
  account,
  chain: baseSepolia,
  transport: custom({
    async request({ method, params }) {
      providerCalls.push({ method, params });
      if (method === "eth_chainId") return `0x${baseSepolia.id.toString(16)}`;
      if (method === "eth_accounts") return [account];
      if (method === "eth_sendTransaction") {
        return "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
      }
      throw new Error(`Unsupported mock provider method: ${method}`);
    }
  })
});

const wallet = createWalletClientPolicyAdapter({
  walletClient,
  policy: { ...DEFAULT_POLICY, spentTodayUsd: 0 },
  route: {
    merchantId: "mcp_search",
    amountUsd: 0.018,
    resourceFromRequest: (request) => request.resource,
    metadataFromRequest: (request) => request.metadata
  }
});

const response = await wallet.sendTransaction(
  {
    chain: baseSepolia,
    to: recipient,
    value: 1n
  },
  {
    intentNonce: `viem-wallet-${Date.now()}`,
    metadata: memo
  }
);

console.log(
  JSON.stringify(
    {
      ...response,
      providerCalls
    },
    (_key, value) => (typeof value === "bigint" ? value.toString() : value),
    2
  )
);
