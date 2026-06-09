export const SETTLEMENT_REQUIRED = "ALLOW_SETTLEMENT_REQUIRED";

export function normalizeSettlementConfig(config = null) {
  if (!config) return null;
  if (config.enabled === false) return null;

  const normalized = {
    required: Boolean(config.required),
    chain: config.chain || "",
    asset: config.asset || "",
    proofHeader: config.proofHeader || "x-allow-settlement-proof",
    proofType: config.proofType || "external"
  };

  copyIfPresent(normalized, config, [
    "network",
    "scheme",
    "paymentRequirements",
    "merchantApproval",
    "facilitator",
    "settle",
    "x402Version",
    "assetAddress",
    "amount",
    "payTo",
    "maxTimeoutSeconds",
    "extra"
  ]);

  return normalized;
}

export function settlementProofFromHeaders(headers = {}, config = {}) {
  const normalized = normalizeHeaders(headers);
  const proofHeader = String(config.proofHeader || "x-allow-settlement-proof").toLowerCase();
  const paymentSignature = normalized["payment-signature"] || "";
  const proof = normalized[proofHeader] || normalized["x-allow-settlement-proof"] || paymentSignature || normalized["x-payment"] || "";
  const amount = normalized["x-allow-settlement-amount-usd"] || normalized["x-payment-amount-usd"] || "";

  return {
    proof,
    proofType: normalized["x-allow-settlement-proof-type"] || config.proofType || "",
    chain: normalized["x-allow-settlement-chain"] || normalized["x-payment-chain"] || "",
    asset: normalized["x-allow-settlement-asset"] || normalized["x-payment-asset"] || "",
    amountUsd: amount === "" ? null : Number(amount),
    merchantId: normalized["x-allow-settlement-merchant"] || "",
    policyId: normalized["x-allow-settlement-policy"] || "",
    receiptId: normalized["x-allow-settlement-receipt"] || "",
    intentNonce: normalized["x-allow-settlement-nonce"] || normalized["x-allow-nonce"] || "",
    payer: normalized["x-allow-settlement-payer"] || "",
    payee: normalized["x-allow-settlement-payee"] || "",
    txHash: normalized["x-allow-settlement-tx"] || normalized["x-payment-tx"] || "",
    rawPaymentHeader: paymentSignature || normalized["x-payment"] || ""
  };
}

export function expectedSettlementFromContext({ route = {}, policy = {}, result = {}, settlement = {} } = {}) {
  settlement = settlement || {};
  const evaluation = result.body?.evaluation || result.evaluation || {};
  const receipt = evaluation.receipt || result.receipt || {};

  return {
    merchantId: route.merchantId || receipt.merchantId || "",
    amountUsd: Number(route.amountUsd ?? receipt.amountUsd ?? 0),
    chain: settlement.chain || route.chain || policy.chain || "",
    asset: settlement.asset || route.asset || policy.settlementAsset || "",
    policyId: receipt.policyId || policy.policyId || "",
    receiptId: receipt.id || "",
    intentNonce: receipt.intentNonce || ""
  };
}

export async function verifySettlementForRequest(req, context = {}) {
  const settlement = normalizeSettlementConfig(context.settlement);
  const proof = settlementProofFromHeaders(req.headers || {}, settlement || {});
  const expected = expectedSettlementFromContext({
    route: context.route,
    policy: context.policy,
    result: context.result,
    settlement
  });

  return verifySettlementProof(proof, expected, {
    required: Boolean(settlement?.required),
    verifier: context.verifier,
    mode: settlement?.proofType || "external",
    settlement,
    context
  });
}

export async function verifySettlementProof(proof = {}, expected = {}, options = {}) {
  const required = Boolean(options.required);
  const hasProof = hasSettlementProof(proof);
  const reasons = [];
  const warnings = [];

  if (!required && !hasProof) {
    warnings.push("Settlement proof not required");
    return settlementResult({ valid: true, mode: "not_required", proof, expected, reasons, warnings });
  }

  if (required && !hasProof) reasons.push("Missing settlement proof");

  if (hasProof) {
    reasons.push(...settlementFieldMismatches(proof, expected));
  }

  let verifierResult = null;
  if (hasProof && reasons.length === 0) {
    if (typeof options.verifier !== "function") {
      if (required) reasons.push("Missing settlement proof verifier");
      else warnings.push("Settlement proof present but no verifier configured");
    } else {
      verifierResult = await options.verifier({
        proof,
        expected,
        mode: options.mode || "external",
        settlement: options.settlement || null,
        context: options.context || null
      });
      const normalized = normalizeVerifierResult(verifierResult);
      if (!normalized.valid) reasons.push(...normalized.reasons);
      warnings.push(...normalized.warnings);
    }
  }

  return settlementResult({
    valid: reasons.length === 0,
    mode: options.mode || "external",
    proof,
    expected,
    reasons,
    warnings,
    verifierResult
  });
}

export function settlementRequiredResponse(result) {
  return {
    status: 402,
    headers: {
      "x-allow-settlement": "required",
      "x-allow-settlement-decision": result.valid ? "allow" : "deny",
      "x-allow-settlement-reason": result.reasons[0] || ""
    },
    body: {
      protocol: "allow",
      error: SETTLEMENT_REQUIRED,
      message: "Payment policy allowed the intent, but settlement proof is missing or invalid",
      settlement: {
        valid: result.valid,
        mode: result.mode,
        reasons: result.reasons,
        warnings: result.warnings,
        expected: result.expected,
        proof: summarizeSettlementProof(result.proof)
      }
    }
  };
}

export function hasSettlementProof(proof = {}) {
  return Boolean(proof.proof || proof.rawPaymentHeader || proof.txHash);
}

function settlementFieldMismatches(proof, expected) {
  const reasons = [];
  compareString(reasons, proof.merchantId, expected.merchantId, "Settlement merchant does not match route merchant");
  compareString(reasons, proof.chain, expected.chain, "Settlement chain does not match expected chain");
  compareString(reasons, proof.asset, expected.asset, "Settlement asset does not match expected asset");
  compareString(reasons, proof.policyId, expected.policyId, "Settlement policy does not match Allow policy");
  compareString(reasons, proof.receiptId, expected.receiptId, "Settlement receipt does not match Allow receipt");
  compareString(reasons, proof.intentNonce, expected.intentNonce, "Settlement nonce does not match Allow intent nonce");

  if (proof.amountUsd !== null && expected.amountUsd !== undefined) {
    const delta = Math.abs(Number(proof.amountUsd) - Number(expected.amountUsd));
    if (!Number.isFinite(delta) || delta > 0.000001) reasons.push("Settlement amount does not match expected amount");
  }

  return reasons;
}

function compareString(reasons, actual, expected, message) {
  if (!actual || !expected) return;
  if (String(actual).toLowerCase() !== String(expected).toLowerCase()) reasons.push(message);
}

function normalizeVerifierResult(result) {
  if (result === true) return { valid: true, reasons: [], warnings: [] };
  if (result === false) return { valid: false, reasons: ["Settlement verifier rejected proof"], warnings: [] };
  return {
    valid: Boolean(result?.valid),
    reasons: result?.reasons || (result?.valid ? [] : ["Settlement verifier rejected proof"]),
    warnings: result?.warnings || []
  };
}

function settlementResult({ valid, mode, proof, expected, reasons, warnings, verifierResult = null }) {
  return {
    valid,
    mode,
    proof,
    expected,
    reasons,
    warnings,
    verifierResult
  };
}

function summarizeSettlementProof(proof = {}) {
  return {
    present: hasSettlementProof(proof),
    proofType: proof.proofType || null,
    chain: proof.chain || null,
    asset: proof.asset || null,
    amountUsd: proof.amountUsd,
    merchantId: proof.merchantId || null,
    policyId: proof.policyId || null,
    receiptId: proof.receiptId || null,
    intentNonce: proof.intentNonce || null,
    txHash: proof.txHash || null
  };
}

function normalizeHeaders(headers) {
  const normalized = {};
  for (const [key, value] of Object.entries(headers || {})) {
    normalized[key.toLowerCase()] = Array.isArray(value) ? value[0] : String(value);
  }
  return normalized;
}

function copyIfPresent(target, source, keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key)) target[key] = source[key];
  }
}
