import assert from "node:assert/strict";
import { buildExternalActionApprovalReport } from "../src/externalActionApproval.mjs";
import { policyFingerprint } from "../src/policyEngine.mjs";
import { EIP712_FIXTURE_AGENT, productionFixturePolicy } from "../src/productionFixture.mjs";
import { buildPilotWalletControlMessage } from "../src/pilotBinding.mjs";
import { buildPilotTrafficActionPack } from "../src/pilotTrafficActionPack.mjs";
import { buildPilotTrafficExecutionEvidenceReport } from "../src/pilotTrafficExecutionEvidence.mjs";

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
assert.equal((await buildExternalActionApprovalReport(allowedPacket)).valid, true);
assert.equal((await buildExternalActionApprovalReport(deniedPacket)).valid, true);

const credibleEvidence = {
  environment: "mainnet",
  merchantApproved: true,
  rail: "x402",
  network: "eip155:8453",
  label: "merchant-approved-mainnet-smoke"
};
const records = [
  {
    merchantId: "mcp_search",
    decision: "allow",
    route: {
      pathPrefix: "/paid-search",
      url: "/paid-search?allow_pilot=1"
    },
    upstreamStatus: 200,
    evidence: credibleEvidence,
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
    evidence: credibleEvidence,
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
const allowed = await buildPilotTrafficExecutionEvidenceReport(allowedEvidence, {
  receiptRecords: records
});
assert.equal(allowed.valid, true);
assert.equal(allowed.status, "verified_pilot_traffic_execution");
assert.equal(allowed.receipts.selectedCount, 1);
assert.deepEqual(allowed.receipts.matchedReceiptIds, ["allow_1"]);
assert.equal(allowed.approvalReport.valid, true);
assert.equal(allowed.evidenceBoundary.startsPilotTraffic, false);
assert.equal(allowed.evidenceBoundary.countsAsFullPilotEvidence, false);

const denied = await buildPilotTrafficExecutionEvidenceReport(
  evidenceFor(deniedPacket, {
    evidenceId: "pilot-exec-deny-001",
    receiptIds: ["deny_1"]
  }),
  {
    receiptRecords: records
  }
);
assert.equal(denied.valid, true);
assert.equal(denied.pilotStep, "denied_guard");

const unapproved = await buildPilotTrafficExecutionEvidenceReport(
  {
    ...allowedEvidence,
    approvalPacket: {
      ...allowedPacket,
      status: "draft",
      approvedBy: ""
    }
  },
  {
    receiptRecords: records
  }
);
assert.equal(unapproved.valid, false);
assert.ok(unapproved.reasons.includes("approvalPacket: External action must be approved before execution"));
assert.ok(unapproved.reasons.includes("approvalPacket.status must be approved"));

const wrongReceipt = await buildPilotTrafficExecutionEvidenceReport(
  {
    ...allowedEvidence,
    receipts: {
      ...allowedEvidence.receipts,
      receiptIds: ["deny_1"]
    }
  },
  {
    receiptRecords: records
  }
);
assert.equal(wrongReceipt.valid, false);
assert.ok(wrongReceipt.reasons.includes("Receipt deny_1 must be an allow decision"));
assert.ok(wrongReceipt.reasons.includes("Receipt deny_1 must have a successful 2xx upstreamStatus"));

const commandMismatch = await buildPilotTrafficExecutionEvidenceReport(
  {
    ...allowedEvidence,
    execution: {
      ...allowedEvidence.execution,
      commandTemplate: "curl https://gateway.example/other"
    }
  },
  {
    receiptRecords: records
  }
);
assert.equal(commandMismatch.valid, false);
assert.ok(commandMismatch.reasons.includes("execution.commandTemplate must match approvalPacket.action.command"));

const localReceipt = await buildPilotTrafficExecutionEvidenceReport(allowedEvidence, {
  receiptRecords: [
    {
      ...records[0],
      evidence: {
        environment: "local",
        merchantApproved: false,
        rail: "x402",
        network: "eip155:8453"
      }
    }
  ]
});
assert.equal(localReceipt.valid, false);
assert.ok(localReceipt.reasons.includes("Receipt allow_1 must have merchant-approved testnet or mainnet evidence"));

const rawPayment = await buildPilotTrafficExecutionEvidenceReport(
  {
    ...allowedEvidence,
    execution: {
      ...allowedEvidence.execution,
      redactedCommand: `${allowedEvidence.execution.commandTemplate}\nPAYMENT-SIGNATURE: rawsecretpayload`
    }
  },
  {
    receiptRecords: records
  }
);
assert.equal(rawPayment.valid, false);
assert.ok(rawPayment.reasons.includes("Pilot traffic execution evidence must not include raw payment signatures"));

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

console.log("pilotTrafficExecutionEvidence tests passed");
