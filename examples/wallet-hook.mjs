import { createAgentKitPolicyHook, DEFAULT_POLICY } from "../src/index.mjs";

const hook = createAgentKitPolicyHook({
  policy: { ...DEFAULT_POLICY, spentTodayUsd: 0 },
  route: {
    merchantId: "mcp_search",
    amountUsd: Number(process.env.ALLOW_EXAMPLE_AMOUNT_USD || 0.018),
    resourceFromRequest: (request) => `wallet://${request.chain}/${request.operation}/${request.to}`,
    metadataFromRequest: (request) => request.memo || ""
  }
});

const request = {
  id: `wallet-example-${Date.now()}`,
  operation: "pay_api",
  chain: "Base",
  asset: "USDC",
  to: "search.allow.dev",
  memo: process.argv.slice(2).join(" ") || "public search request"
};

const response = await hook.beforeAction(request, async (walletRequest, context) => ({
  signed: true,
  simulated: true,
  to: walletRequest.to,
  asset: walletRequest.asset,
  receiptId: context.allow.receipt.id
}));

console.log(JSON.stringify(response, null, 2));
