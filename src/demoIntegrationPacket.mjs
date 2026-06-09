import {
  DEFAULT_POLICY,
  MERCHANTS,
  findMerchant,
  formatUsd,
  policyFingerprint,
  resolvePolicyId,
  stableHash
} from "./policyEngine.mjs";
import { preflightPayment } from "./httpPreflight.mjs";

export const DEMO_INTEGRATION_PACKET_STATUSES = [
  "ready",
  "needs_valid_intent",
  "unsafe_live_execution"
];

export const DEFAULT_DEMO_INTEGRATION_INTENT = {
  merchantId: "mcp_search",
  amountUsd: 0.018,
  resource: "/v1/search?q=agent+payments",
  intentNonce: "demo-search-003",
  metadata: "agent-alpha requesting public search context for launch analysis"
};

export function buildDemoIntegrationPacket(input = {}, options = {}) {
  const generatedAt = options.generatedAt || new Date().toISOString();
  const sourceErrors = unique(options.sourceErrors || input.sourceErrors || []);
  const liveExecutionRequested = Boolean(
    options.liveExecutionRequested ||
      input.liveExecutionRequested ||
      input.postToX ||
      input.deployContracts ||
      input.transferFunds ||
      input.signWalletPayloads
  );
  const policy = normalizePolicy(input.policy);
  const intent = normalizeIntent(input.intent);
  const receipts = Array.isArray(input.receipts) ? input.receipts : [];
  const reasons = [
    ...sourceErrors,
    ...intentShapeReasons(intent, policy),
    liveExecutionRequested ? "Demo integration packets cannot request live posting, signing, deployment, or fund movement" : null
  ].filter(Boolean);

  let preflight = null;
  let evaluation = null;
  try {
    preflight = preflightPayment({
      intent,
      policy,
      receipts,
      policyVerifier: options.policyVerifier,
      agentIntentVerifier: options.agentIntentVerifier,
      merchantCatalog: options.merchantCatalog,
      merchants: options.merchants
    });
    evaluation = preflight.body.evaluation;
  } catch (error) {
    reasons.push(`Unable to evaluate demo integration intent: ${error.message}`);
  }

  const status = statusFor({
    liveExecutionRequested,
    reasons,
    evaluation
  });
  const merchant = findMerchant(intent.merchantId, merchantCatalog(options));
  const warnings = unique([
    ...(evaluation?.warnings || []),
    evaluation?.decision === "deny" ? "Packet demonstrates a blocked request; use the response shape to test deny handling" : null
  ]);
  const packet = status === "ready"
    ? integrationPacket({
        generatedAt,
        policy,
        intent,
        receipts,
        merchant,
        preflight,
        evaluation
      })
    : null;

  return {
    generatedAt,
    valid: status === "ready",
    status,
    decision: evaluation?.decision || null,
    preflightStatus: preflight?.status || null,
    policyId: resolvePolicyId(policy),
    policyFingerprint: policyFingerprint(policy),
    merchantId: intent.merchantId || null,
    receiptId: evaluation?.receipt?.id || null,
    packetHash: packet?.packetHash || null,
    packet,
    reasons: unique(reasons),
    warnings,
    nextAction: nextActionFor(status, evaluation),
    evidenceBoundary: boundary()
  };
}

export function publicDemoIntegrationPacket(report = {}) {
  return {
    ...report,
    packet: report.packet || null
  };
}

function integrationPacket({ generatedAt, policy, intent, receipts, merchant, preflight, evaluation }) {
  const fingerprint = policyFingerprint(policy);
  const policyId = resolvePolicyId(policy);
  const receipt = evaluation.receipt;
  const requestHeaders = headersForIntent(intent, policy, fingerprint);
  const summary = {
    merchantId: intent.merchantId,
    merchantName: merchant?.name || receipt.merchantName,
    amountUsd: receipt.amountUsd,
    amountLabel: formatUsd(receipt.amountUsd),
    decision: evaluation.decision,
    riskScore: evaluation.riskScore,
    preflightStatus: preflight.status,
    policyId,
    receiptId: receipt.id,
    chain: policy.chain,
    asset: policy.settlementAsset
  };

  const packet = {
    protocol: "allow",
    version: "0.1",
    generatedAt,
    summary,
    intent: {
      merchantId: intent.merchantId,
      amountUsd: Number(intent.amountUsd),
      resource: intent.resource,
      intentNonce: intent.intentNonce || intent.nonce || "",
      metadata: intent.metadata || "",
      intentHash: receipt.intentHash,
      metadataHash: receipt.metadataHash,
      agentAddress: intent.agentAddress || null,
      agentSignatureMode: intent.agentSignatureMode || "unsigned"
    },
    policyEnvelope: {
      policyId,
      fingerprint,
      agentId: policy.agentId,
      controller: policy.controller,
      chain: policy.chain,
      settlementAsset: policy.settlementAsset,
      dailyCapUsd: Number(policy.dailyCapUsd),
      spentTodayUsd: Number(policy.spentTodayUsd || 0),
      perTxCapUsd: Number(policy.perTxCapUsd),
      maxRiskScore: Number(policy.maxRiskScore),
      allowedMerchants: [...(policy.allowedMerchants || [])],
      blockedCategories: [...(policy.blockedCategories || [])],
      requireReceipt: Boolean(policy.requireReceipt),
      requireIntentNonce: Boolean(policy.requireIntentNonce),
      blockPii: Boolean(policy.blockPii)
    },
    httpPreflight: {
      request: {
        method: "POST",
        path: "/api/x402/preflight",
        headers: requestHeaders,
        body: {
          intentRef: {
            merchantId: intent.merchantId,
            amountUsd: Number(intent.amountUsd),
            resource: intent.resource,
            intentNonce: intent.intentNonce || intent.nonce || ""
          },
          policyRef: {
            policyId,
            fingerprint
          }
        }
      },
      response: {
        status: preflight.status,
        headers: preflight.headers,
        body: {
          protocol: preflight.body.protocol,
          message: preflight.body.message,
          decision: evaluation.decision,
          reasons: evaluation.reasons,
          warnings: evaluation.warnings,
          receipt
        }
      }
    },
    x402CompatiblePayment: {
      paymentRequirements: {
        scheme: "exact",
        network: policy.chain,
        asset: policy.settlementAsset,
        amountUsd: Number(intent.amountUsd),
        resource: intent.resource,
        merchantId: intent.merchantId,
        payTo: "merchant-owned settlement address supplied by the service",
        maxTimeoutSeconds: 60
      },
      settlementBoundary: "The demo packet describes the payment requirement only; it does not sign, submit, escrow, or custody funds."
    },
    receipt,
    replayProtection: {
      intentNonce: receipt.intentNonce,
      intentHash: receipt.intentHash,
      priorReceiptCount: receipts.length,
      requireUniqueNonce: Boolean(policy.requireIntentNonce)
    },
    developerChecklist: [
      "Add Allow preflight middleware before the paid route.",
      "Require merchant id, amount, resource, and a unique intent nonce.",
      "Return x-allow-decision, x-allow-risk, x-allow-policy, and x-allow-receipt headers.",
      "Persist receipts for reconciliation and replay checks.",
      "Keep wallet signing and settlement in the caller-owned wallet flow."
    ],
    negativeControls: [
      "Send a repeated intent nonce and expect a 402 deny response.",
      "Send PII-like metadata and expect a 402 deny response when blockPii is enabled.",
      "Send a blocked merchant category and expect a 402 deny response."
    ],
    evidenceBoundary: boundary()
  };

  return {
    ...packet,
    packetHash: stableHash(packet)
  };
}

function normalizePolicy(policy) {
  return {
    ...DEFAULT_POLICY,
    ...(policy && typeof policy === "object" && !Array.isArray(policy) ? policy : {})
  };
}

function normalizeIntent(intent) {
  return {
    ...DEFAULT_DEMO_INTEGRATION_INTENT,
    ...(intent && typeof intent === "object" && !Array.isArray(intent) ? intent : {})
  };
}

function headersForIntent(intent, policy, fingerprint) {
  return {
    "x-allow-project": "allow-protocol",
    "x-allow-merchant": intent.merchantId,
    "x-allow-amount-usd": String(Number(intent.amountUsd)),
    "x-allow-resource": intent.resource,
    "x-allow-metadata": intent.metadata || "",
    "x-allow-nonce": intent.intentNonce || intent.nonce || "",
    "x-allow-agent": intent.agentAddress || policy.agentId,
    "x-allow-agent-signature-mode": intent.agentSignatureMode || "unsigned",
    "x-allow-policy": resolvePolicyId(policy),
    "x-allow-policy-fingerprint": fingerprint
  };
}

function intentShapeReasons(intent, policy) {
  const reasons = [];
  if (!String(intent.merchantId || "").trim()) reasons.push("Missing merchant id");
  if (!Number.isFinite(Number(intent.amountUsd)) || Number(intent.amountUsd) <= 0) reasons.push("Invalid payment amount");
  if (!String(intent.resource || "").trim()) reasons.push("Missing resource path");
  if (policy.requireIntentNonce && !String(intent.intentNonce || intent.nonce || "").trim()) {
    reasons.push("Missing intent nonce");
  }
  return reasons;
}

function merchantCatalog(options = {}) {
  return [
    ...MERCHANTS,
    ...(Array.isArray(options.merchantCatalog) ? options.merchantCatalog : []),
    ...(Array.isArray(options.merchants) ? options.merchants : [])
  ];
}

function statusFor({ liveExecutionRequested, reasons, evaluation }) {
  if (liveExecutionRequested) return "unsafe_live_execution";
  if (reasons.length > 0 || !evaluation) return "needs_valid_intent";
  return "ready";
}

function nextActionFor(status, evaluation) {
  if (status === "ready" && evaluation?.decision === "allow") {
    return "Copy the packet into a test client or API README, then run the paid route through local preflight.";
  }
  if (status === "ready") {
    return "Use the blocked response shape as a negative-control fixture for merchant integrations.";
  }
  if (status === "unsafe_live_execution") {
    return "Remove all live execution requests; this packet must stay local and descriptive.";
  }
  return "Provide a merchant id, positive amount, resource path, and nonce before sharing the packet.";
}

function boundary() {
  return {
    readsLocalInputs: true,
    writesFiles: false,
    sendsNetworkRequests: false,
    postsContent: false,
    sendsOutreach: false,
    signsWalletPayloads: false,
    deploysContracts: false,
    startsPilotTraffic: false,
    movesFunds: false,
    storesSecrets: false,
    usesPrivateKeys: false,
    usesApiTokens: false,
    publishesWebsite: false,
    requiresHumanApprovalForLiveUse: true
  };
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
