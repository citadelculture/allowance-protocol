import { preflightPaymentAsync } from "./httpPreflight.mjs";

export const MCP_PAYMENT_REQUIRED = -32042;
export const MCP_TOOL_NOT_CONFIGURED = -32043;

export function isMcpToolCall(message = {}) {
  return message && message.method === "tools/call";
}

export function mcpToolName(message = {}) {
  return message.params?.name || message.params?.tool || "";
}

export function mcpIntentNonce(message = {}) {
  const meta = message.params?._meta || {};
  const allowMeta = meta.allow || {};
  const args = message.params?.arguments || {};

  return (
    allowMeta.intentNonce ||
    allowMeta.nonce ||
    meta.allowIntentNonce ||
    meta.intentNonce ||
    args.allowIntentNonce ||
    args.intentNonce ||
    ""
  );
}

export function mcpPaymentIntent(message, toolPolicy) {
  const toolName = mcpToolName(message);
  const args = message.params?.arguments || {};
  const metadata =
    typeof toolPolicy.metadataFromRequest === "function"
      ? toolPolicy.metadataFromRequest(message)
      : toolPolicy.metadata || JSON.stringify(args);
  const resource =
    typeof toolPolicy.resourceFromRequest === "function"
      ? toolPolicy.resourceFromRequest(message)
      : toolPolicy.resource || `mcp://tool/${toolName}`;

  return {
    merchantId: toolPolicy.merchantId,
    amountUsd: Number(toolPolicy.amountUsd),
    resource,
    metadata,
    intentNonce: mcpIntentNonce(message)
  };
}

export async function evaluateMcpToolCall(message, options = {}) {
  if (!isMcpToolCall(message)) {
    return {
      kind: "passthrough",
      allowed: true,
      response: null,
      result: null
    };
  }

  const toolName = mcpToolName(message);
  const toolPolicy = options.toolPolicies?.[toolName];

  if (!toolPolicy) {
    return {
      kind: "tool_not_configured",
      allowed: false,
      response: mcpErrorResponse(message, {
        code: MCP_TOOL_NOT_CONFIGURED,
        message: `MCP tool is not configured for Allow: ${toolName || "unknown"}`,
        data: {
          protocol: "allow",
          toolName,
          reasons: ["MCP tool missing Allow policy configuration"]
        }
      }),
      result: null
    };
  }

  validateToolPolicy(toolName, toolPolicy);

  const intent = mcpPaymentIntent(message, toolPolicy);
  const result = await preflightPaymentAsync({
    policy: options.policy,
    receipts: options.receipts || [],
    intent,
    policyVerifier: options.policyVerifier,
    agentIntentVerifier: options.agentIntentVerifier,
    merchantCatalog: options.merchantCatalog,
    merchants: options.merchants
  });

  if (result.status !== 200) {
    return {
      kind: "denied",
      allowed: false,
      response: deniedMcpResponse(message, result, toolName),
      result
    };
  }

  return {
    kind: "allowed",
    allowed: true,
    response: null,
    result,
    allow: {
      toolName,
      decision: result.body.evaluation.decision,
      riskScore: result.body.evaluation.riskScore,
      receipt: result.body.evaluation.receipt,
      reasons: result.body.evaluation.reasons,
      warnings: result.body.evaluation.warnings
    }
  };
}

export function createMcpToolGuard(options = {}) {
  const receipts = options.receipts || [];

  return async function guardMcpToolCall(message, handler) {
    if (typeof handler !== "function") {
      throw new Error("createMcpToolGuard requires a handler when invoked");
    }

    const evaluation = await evaluateMcpToolCall(message, {
      ...options,
      receipts
    });

    if (!evaluation.allowed) return evaluation.response;

    if (evaluation.kind !== "allowed") {
      return handler(message, { allow: null });
    }

    if (options.recordAllowedReceipt !== false) {
      receipts.unshift(evaluation.allow.receipt);
    }

    const response = await handler(message, { allow: evaluation.allow });
    return attachAllowMeta(response, evaluation.allow);
  };
}

export function deniedMcpResponse(message, result, toolName = mcpToolName(message)) {
  return mcpErrorResponse(message, {
    code: MCP_PAYMENT_REQUIRED,
    message: "Payment intent blocked by allowance policy",
    data: {
      protocol: "allow",
      toolName,
      status: 402,
      headers: result.headers,
      evaluation: result.body.evaluation
    }
  });
}

export function attachAllowMeta(response = {}, allow) {
  if (!allow || !response || typeof response !== "object") return response;

  return {
    ...response,
    _meta: {
      ...(response._meta || {}),
      allow: {
        decision: allow.decision,
        riskScore: allow.riskScore,
        receipt: allow.receipt
      }
    }
  };
}

function mcpErrorResponse(message = {}, error) {
  return {
    jsonrpc: message.jsonrpc || "2.0",
    id: message.id ?? null,
    error
  };
}

function validateToolPolicy(toolName, toolPolicy) {
  if (!toolPolicy.merchantId) {
    throw new Error(`MCP tool policy for ${toolName} requires merchantId`);
  }
  if (!Number.isFinite(Number(toolPolicy.amountUsd)) || Number(toolPolicy.amountUsd) <= 0) {
    throw new Error(`MCP tool policy for ${toolName} requires positive amountUsd`);
  }
}
