import { createMcpToolGuard, DEFAULT_POLICY } from "../src/index.mjs";

const receipts = [];
const guard = createMcpToolGuard({
  policy: { ...DEFAULT_POLICY, spentTodayUsd: 0 },
  receipts,
  toolPolicies: {
    search: {
      merchantId: "mcp_search",
      amountUsd: 0.018,
      resourceFromRequest: (message) => `mcp://tool/search?q=${message.params.arguments.query || ""}`,
      metadataFromRequest: (message) => message.params.arguments.query || ""
    }
  }
});

const request = {
  jsonrpc: "2.0",
  id: 1,
  method: "tools/call",
  params: {
    name: "search",
    arguments: {
      query: process.argv.slice(2).join(" ") || "agent payments"
    },
    _meta: {
      allow: {
        intentNonce: `mcp-example-${Date.now()}`
      }
    }
  }
};

const response = await guard(request, async (message, context) => ({
  jsonrpc: "2.0",
  id: message.id,
  result: {
    content: [
      {
        type: "text",
        text: `Protected MCP search response for "${message.params.arguments.query}"`
      }
    ],
    receipt: context.allow.receipt
  }
}));

console.log(JSON.stringify(response, null, 2));
