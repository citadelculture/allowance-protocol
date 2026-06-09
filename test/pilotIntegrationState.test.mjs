import assert from "node:assert/strict";
import { policyFingerprint } from "../src/policyEngine.mjs";
import { EIP712_FIXTURE_AGENT, productionFixturePolicy } from "../src/productionFixture.mjs";
import { buildPilotWalletControlMessage } from "../src/pilotBinding.mjs";
import { buildPilotTrafficActionPack } from "../src/pilotTrafficActionPack.mjs";
import { buildPilotIntegrationStateReport } from "../src/pilotIntegrationState.mjs";

const approvals = {
  humanWillExecute: true,
  automationDisabled: true,
  exactActionReviewed: true,
  externalSideEffectAcknowledged: true,
  noPrivateKeys: true,
  noCustodyOrEscrow: true,
  noTokenPitch: true,
  noMarketManipulation: true,
  legalEthicsReviewed: true
};

const policy = productionFixturePolicy({
  chainId: 8453,
  requireAgentIntentSignature: true
});
const binding = {
  bindingId: "pilot-mainnet-mcp-search",
  generatedAt: "2026-06-08",
  pilot: {
    merchantId: "mcp_search",
    environment: "mainnet",
    network: "eip155:8453",
    approvalRef: "pilot-authorization:mcp-search:001",
    approvedBy: "merchant-ops",
    approvedAt: "2026-06-08"
  },
  agent: {
    agentId: policy.agentId,
    walletType: "eoa",
    walletAddress: EIP712_FIXTURE_AGENT,
    controlEvidenceRef: "wallet-control:mcp-search:001",
    controlChallenge: "",
    controlSignature: "0xstub",
    approvedBy: "agent-operator",
    approvedAt: "2026-06-08"
  },
  policy: {
    policyId: policy.policyId,
    policyPath: "ops/signed-policy.local.json",
    policyFingerprint: policyFingerprint(policy),
    requireAgentIntentSignature: true
  },
  runtime: {
    allowProduction: true,
    requireAgentSignature: true,
    allowAgentAddress: EIP712_FIXTURE_AGENT,
    fixtureEnabled: false,
    agentPrivateKeyExposed: false,
    controllerPrivateKeyExposed: false
  },
  safety: {
    noTradingAuthority: true,
    merchantScoped: true,
    spendCapsReviewed: true,
    metadataPolicyReviewed: true
  }
};
binding.agent.controlChallenge = buildPilotWalletControlMessage(binding);

const gatewayConfig = {
  name: "allow-live-pilot-test",
  upstream: {
    baseUrl: "https://merchant.example",
    timeoutMs: 10000
  },
  receipts: {
    path: "ops/gateway-receipts.mainnet.jsonl"
  },
  evidence: {
    environment: "mainnet",
    merchantApproved: true,
    rail: "x402",
    network: "eip155:8453",
    label: "merchant-approved-mainnet-smoke"
  },
  settlement: {
    required: true,
    chain: "Base",
    asset: "USDC",
    proofType: "x402-facilitator",
    merchantApproval: {
      approved: true,
      merchantId: "mcp_search",
      approvedAt: "2026-06-08",
      approvalRef: "pilot-authorization:mcp-search:001"
    },
    paymentRequirements: {
      scheme: "exact",
      network: "eip155:8453",
      asset: "0x0000000000000000000000000000000000000001",
      amount: "1000",
      payTo: "0x0000000000000000000000000000000000000002",
      maxTimeoutSeconds: 60
    }
  },
  rateLimit: {
    max: 10,
    windowMs: 60000
  },
  routes: [
    {
      pathPrefix: "/paid-search",
      merchantId: "mcp_search",
      amountUsd: 0.018
    }
  ]
};
const disputePacket = {
  disputeId: "disp_live_pilot_001",
  merchantId: "mcp_search",
  category: "incorrect_denial",
  status: "submitted",
  severity: "medium",
  openedAt: "2026-06-08",
  requester: {
    role: "agent_operator",
    contact: "pilot-contact-handle"
  },
  receiptIds: ["allow_receipt_id"],
  evidenceRefs: ["receipt-log:ops/gateway-receipts.mainnet.jsonl#allow_receipt_id"],
  requestedOutcome: "explain_receipt",
  summary: "Support path agreed for pilot receipt review without raw metadata."
};
const walletControlResult = {
  valid: true,
  expectedSigner: EIP712_FIXTURE_AGENT,
  recoveredSigner: EIP712_FIXTURE_AGENT,
  challenge: binding.agent.controlChallenge,
  reasons: [],
  warnings: []
};
const runtimeEnv = {
  ALLOW_PRODUCTION: "1",
  ALLOW_REQUIRE_AGENT_SIGNATURE: "1",
  ALLOW_POLICY_PATH: "ops/signed-policy.local.json"
};
const pack = await buildPilotTrafficActionPack(
  {
    preflight: {
      binding,
      policy,
      gatewayConfig,
      disputePacket
    },
    runtimeEnv,
    walletControlResult
  },
  {
    gatewayBaseUrl: "https://gateway.example",
    requestedAt: "2026-06-08"
  }
);
const allowedPacket = approve(pack.packets[0]);
const deniedPacket = approve(pack.packets[1]);

const receiptRecords = [
  {
    merchantId: "mcp_search",
    decision: "allow",
    route: {
      pathPrefix: "/paid-search",
      url: "/paid-search?allow_pilot=1"
    },
    upstreamStatus: 200,
    evidence: credibleEvidence(),
    receipt: {
      id: "allow_1",
      agentId: "agent-alpha",
      merchantId: "mcp_search",
      decision: "allow",
      amountUsd: 0.018
    }
  },
  {
    merchantId: "mcp_search",
    decision: "deny",
    route: {
      pathPrefix: "/paid-search",
      url: "/paid-search?deny_pilot=1"
    },
    evidence: credibleEvidence(),
    reasons: ["Payment metadata contains restricted data: email"],
    receipt: {
      id: "deny_1",
      agentId: "agent-alpha",
      merchantId: "mcp_search",
      decision: "deny",
      amountUsd: 0.018
    }
  }
];
const allowedEvidence = evidenceFor(allowedPacket, {
  evidenceId: "pilot-exec-allow-001",
  receiptIds: ["allow_1"]
});
const deniedEvidence = evidenceFor(deniedPacket, {
  evidenceId: "pilot-exec-deny-001",
  receiptIds: ["deny_1"]
});

const empty = await buildPilotIntegrationStateReport(
  {
    prospects: [{ id: "p1", integrationStatus: "not_started" }],
    merchantDirectory: {
      merchants: [{ id: "mcp_search", status: "pilot_ready" }]
    },
    executionRecords: [],
    receiptRecords: []
  },
  {
    receiptSourceErrors: ["Receipt log missing: ops/gateway-receipts.local.jsonl"]
  }
);
assert.equal(empty.valid, true);
assert.equal(empty.status, "no_pilot_execution_evidence_yet");
assert.equal(empty.counts.liveMerchants, 0);

const prematureIntegrated = await buildPilotIntegrationStateReport({
  prospects: [{ id: "p1", integrationStatus: "integrated", merchantId: "mcp_search" }],
  merchantDirectory: {
    merchants: [{ id: "mcp_search", status: "pilot_ready" }]
  },
  executionRecords: [],
  receiptRecords: []
});
assert.equal(prematureIntegrated.valid, false);
assert.ok(
  prematureIntegrated.reasons.includes("p1: integrationStatus=integrated requires valid allowed_delivery pilot traffic execution evidence")
);
assert.ok(
  prematureIntegrated.reasons.includes("p1: integrationStatus=integrated requires pilot-report evidence with allowed and denied merchant-approved receipts")
);

const prematureLive = await buildPilotIntegrationStateReport({
  prospects: [{ id: "p1", integrationStatus: "not_started" }],
  merchantDirectory: {
    merchants: [{ id: "mcp_search", status: "live" }]
  },
  executionRecords: [],
  receiptRecords: []
});
assert.equal(prematureLive.valid, false);
assert.ok(prematureLive.reasons.includes("mcp_search: status=live requires valid denied_guard pilot traffic execution evidence"));

const backed = await buildPilotIntegrationStateReport({
  prospects: [{ id: "p1", integrationStatus: "integrated", merchantId: "mcp_search" }],
  merchantDirectory: {
    merchants: [{ id: "mcp_search", status: "live" }]
  },
  executionRecords: [allowedEvidence, deniedEvidence],
  receiptRecords
});
assert.equal(backed.valid, true);
assert.equal(backed.status, "state_backed_by_pilot_evidence");
assert.equal(backed.counts.validExecutionRecords, 2);
assert.equal(backed.coverageByMerchant.mcp_search.hasAllowedDeliveryExecution, true);
assert.equal(backed.coverageByMerchant.mcp_search.hasDeniedGuardExecution, true);
assert.equal(backed.coverageByMerchant.mcp_search.hasFullPilotEvidence, true);

const duplicate = await buildPilotIntegrationStateReport({
  prospects: [{ id: "p1", integrationStatus: "testing", merchantId: "mcp_search" }],
  merchantDirectory: {
    merchants: [{ id: "mcp_search", status: "pilot_ready" }]
  },
  executionRecords: [allowedEvidence, { ...allowedEvidence }],
  receiptRecords
});
assert.equal(duplicate.valid, false);
assert.ok(duplicate.reasons.includes("pilot-exec-allow-001: Duplicate evidenceId: pilot-exec-allow-001"));

const unapproved = await buildPilotIntegrationStateReport({
  prospects: [{ id: "p1", integrationStatus: "integrated", merchantId: "mcp_search" }],
  merchantDirectory: {
    merchants: [{ id: "mcp_search", status: "pilot_ready" }]
  },
  executionRecords: [
    {
      ...allowedEvidence,
      approvalPacket: {
        ...allowedEvidence.approvalPacket,
        status: "draft",
        approvedBy: ""
      }
    },
    deniedEvidence
  ],
  receiptRecords
});
assert.equal(unapproved.valid, false);
assert.ok(unapproved.reasons.includes("pilot-exec-allow-001: approvalPacket: External action must be approved before execution"));

function approve(packet) {
  return {
    ...packet,
    status: "approved",
    approvedBy: "pilot-owner",
    approvedAt: "2026-06-08",
    approvals
  };
}

function evidenceFor(approvalPacket, overrides = {}) {
  return {
    evidenceId: overrides.evidenceId || "pilot-exec-001",
    generatedAt: "2026-06-08T12:00:00.000Z",
    status: "executed",
    pilotStep: approvalPacket.payload.pilotStep,
    merchantId: approvalPacket.payload.request.merchantId,
    approvalRef: `external-action:${approvalPacket.approvalId}`,
    approvalPacket,
    execution: {
      executedAt: "2026-06-08T12:05:00.000Z",
      executedBy: "pilot-owner",
      humanExecuted: true,
      automationUsed: false,
      noExtraRequests: true,
      paymentPayloadRedacted: true,
      commandTemplate: approvalPacket.action.command,
      redactedCommand: approvalPacket.action.command
    },
    receipts: {
      receiptLogPath: approvalPacket.payload.request.receiptPath,
      receiptIds: overrides.receiptIds || ["allow_1"]
    },
    proof: {
      type: "receipt_log",
      ref: `${approvalPacket.payload.request.receiptPath}#${(overrides.receiptIds || ["allow_1"])[0]}`,
      capturedAt: "2026-06-08T12:06:00.000Z",
      redacted: true
    },
    safety: {
      merchantApprovedRun: true,
      noExtraRequests: true,
      noSecretsStored: true,
      noCustodyOrEscrow: true,
      receiptLogPrivate: true,
      noPublicClaims: true
    }
  };
}

function credibleEvidence() {
  return {
    environment: "mainnet",
    merchantApproved: true,
    rail: "x402",
    network: "eip155:8453",
    label: "merchant-approved-mainnet-smoke"
  };
}

console.log("pilotIntegrationState tests passed");
