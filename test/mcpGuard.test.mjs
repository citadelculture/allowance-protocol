import assert from "node:assert/strict";
import { DEFAULT_POLICY } from "../src/policyEngine.mjs";
import {
  MCP_PAYMENT_REQUIRED,
  MCP_TOOL_NOT_CONFIGURED,
  attachAllowMeta,
  createMcpToolGuard,
  evaluateMcpToolCall,
  isMcpToolCall,
  mcpIntentNonce,
  mcpPaymentIntent,
  mcpToolName
} from "../src/mcpGuard.mjs";

const toolPolicies = {
  search: {
    merchantId: "mcp_search",
    amountUsd: 0.018,
    resourceFromRequest: (message) => `mcp://tool/search?q=${message.params.arguments.query}`,
    metadataFromRequest: (message) => message.params.arguments.query
  }
};

const request = {
  jsonrpc: "2.0",
  id: 1,
  method: "tools/call",
  params: {
    name: "search",
    arguments: {
      query: "agent payments"
    },
    _meta: {
      allow: {
        intentNonce: "mcp-search-001"
      }
    }
  }
};

assert.equal(isMcpToolCall(request), true);
assert.equal(isMcpToolCall({ method: "tools/list" }), false);
assert.equal(mcpToolName(request), "search");
assert.equal(mcpIntentNonce(request), "mcp-search-001");
assert.deepEqual(mcpPaymentIntent(request, toolPolicies.search), {
  merchantId: "mcp_search",
  amountUsd: 0.018,
  resource: "mcp://tool/search?q=agent payments",
  metadata: "agent payments",
  intentNonce: "mcp-search-001"
});

const receipts = [];
const guard = createMcpToolGuard({
  policy: { ...DEFAULT_POLICY, spentTodayUsd: 0 },
  receipts,
  toolPolicies
});

const allowed = await guard(request, async (message, context) => ({
  jsonrpc: "2.0",
  id: message.id,
  result: {
    content: [{ type: "text", text: "Search result" }],
    receipt: context.allow.receipt.id
  }
}));

assert.equal(allowed.result.receipt.startsWith("allow_"), true);
assert.equal(allowed._meta.allow.decision, "allow");
assert.equal(allowed._meta.allow.receipt.intentNonce, "mcp-search-001");
assert.equal(receipts.length, 1);

const replay = await guard(request, async () => {
  throw new Error("handler should not run for replay");
});

assert.equal(replay.error.code, MCP_PAYMENT_REQUIRED);
assert.equal(replay.error.data.evaluation.reasons[0], "Intent nonce already used for this policy");

const piiRequest = {
  jsonrpc: "2.0",
  id: 2,
  method: "tools/call",
  params: {
    name: "search",
    arguments: {
      query: "email alex@example.com"
    },
    _meta: {
      allowIntentNonce: "mcp-search-pii-001"
    }
  }
};

const denied = await evaluateMcpToolCall(piiRequest, {
  policy: { ...DEFAULT_POLICY, spentTodayUsd: 0 },
  toolPolicies
});

assert.equal(denied.allowed, false);
assert.equal(denied.response.error.code, MCP_PAYMENT_REQUIRED);
assert.equal(denied.response.error.data.evaluation.reasons[0], "Payment metadata contains restricted data: email");

const unconfigured = await evaluateMcpToolCall(
  {
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: {
      name: "unpriced",
      arguments: {}
    }
  },
  { toolPolicies }
);

assert.equal(unconfigured.allowed, false);
assert.equal(unconfigured.response.error.code, MCP_TOOL_NOT_CONFIGURED);

const passthrough = await guard({ jsonrpc: "2.0", id: 4, method: "tools/list" }, async () => ({
  jsonrpc: "2.0",
  id: 4,
  result: { tools: [] }
}));

assert.deepEqual(passthrough.result, { tools: [] });

assert.equal(
  attachAllowMeta({ jsonrpc: "2.0", id: 5, result: {} }, { decision: "allow", riskScore: 1, receipt: { id: "r" } })._meta.allow.receipt.id,
  "r"
);

console.log("mcpGuard tests passed");
