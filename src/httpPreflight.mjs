import { DEFAULT_POLICY, evaluatePaymentIntent, evaluatePaymentIntentAsync } from "./policyEngine.mjs";

export function intentFromHeaders(headers, fallbackUrl = "/") {
  const normalized = normalizeHeaders(headers);
  const amount = normalized["x-allow-amount-usd"] || normalized["x-price-usd"] || "0";

  return {
    merchantId: normalized["x-allow-merchant"] || normalized["x-merchant-id"] || "unknown",
    amountUsd: Number(amount),
    resource: normalized["x-allow-resource"] || normalized["x-resource"] || fallbackUrl,
    metadata: normalized["x-allow-metadata"] || "",
    intentNonce: normalized["x-allow-nonce"] || normalized["x-intent-nonce"] || "",
    agentAddress: normalized["x-allow-agent"] || normalized["x-agent-address"] || "",
    agentSignature: normalized["x-allow-agent-signature"] || normalized["x-agent-signature"] || "",
    agentSignatureMode: normalized["x-allow-agent-signature-mode"] || normalized["x-agent-signature-mode"] || ""
  };
}

export function preflightPayment(input = {}) {
  const policy = { ...DEFAULT_POLICY, ...(input.policy || {}) };
  const receipts = input.receipts || [];
  const intent = input.intent || intentFromHeaders(input.headers || {}, input.resource || "/");
  const evaluation = evaluatePaymentIntent(intent, policy, receipts, {
    policyVerifier: input.policyVerifier,
    agentIntentVerifier: input.agentIntentVerifier,
    merchantCatalog: input.merchantCatalog,
    merchants: input.merchants
  });

  return responseFromEvaluation(evaluation);
}

export async function preflightPaymentAsync(input = {}) {
  const policy = { ...DEFAULT_POLICY, ...(input.policy || {}) };
  const receipts = input.receipts || [];
  const intent = input.intent || intentFromHeaders(input.headers || {}, input.resource || "/");
  const evaluation = await evaluatePaymentIntentAsync(intent, policy, receipts, {
    policyVerifier: input.policyVerifier,
    agentIntentVerifier: input.agentIntentVerifier,
    merchantCatalog: input.merchantCatalog,
    merchants: input.merchants
  });

  return responseFromEvaluation(evaluation);
}

function responseFromEvaluation(evaluation) {
  return {
    status: evaluation.decision === "allow" ? 200 : 402,
    headers: {
      "x-allow-decision": evaluation.decision,
      "x-allow-risk": String(evaluation.riskScore),
      "x-allow-receipt": evaluation.receipt.id,
      "x-allow-policy": evaluation.receipt.policyId,
      "x-allow-intent-nonce": evaluation.receipt.intentNonce,
      "x-allow-agent-signature-mode": evaluation.receipt.agentIntentSignatureMode,
      "x-allow-project": "allow-protocol"
    },
    body: {
      protocol: "allow",
      message:
        evaluation.decision === "allow"
          ? "Payment intent accepted by allowance policy"
          : "Payment intent blocked by allowance policy",
      evaluation
    }
  };
}

export function merchantProfile(merchant) {
  return {
    merchantId: merchant.id,
    name: merchant.name,
    domain: merchant.domain,
    category: merchant.category,
    payment: {
      protocol: "x402-compatible-preflight",
      asset: "USDC",
      settlement: "Base"
    },
    risk: {
      trustScore: merchant.trustScore,
      tags: merchant.riskTags
    },
    receipts: {
      required: true,
      fields: ["policyId", "merchantId", "amount", "intentHash", "intentNonce", "metadataHash"]
    }
  };
}

function normalizeHeaders(headers) {
  const normalized = {};
  for (const [key, value] of Object.entries(headers)) {
    normalized[key.toLowerCase()] = Array.isArray(value) ? value[0] : String(value);
  }
  return normalized;
}
