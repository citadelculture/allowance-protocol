import assert from "node:assert/strict";
import { buildExternalActionApprovalReport } from "../src/externalActionApproval.mjs";
import { policyFingerprint } from "../src/policyEngine.mjs";
import { EIP712_FIXTURE_AGENT, productionFixturePolicy } from "../src/productionFixture.mjs";
import { buildPilotWalletControlMessage } from "../src/pilotBinding.mjs";
import { buildPilotTrafficActionPack } from "../src/pilotTrafficActionPack.mjs";

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
const preflight = {
  binding,
  policy,
  gatewayConfig,
  disputePacket
};
const runtimeEnv = {
  ALLOW_PRODUCTION: "1",
  ALLOW_REQUIRE_AGENT_SIGNATURE: "1",
  ALLOW_POLICY_PATH: "ops/signed-policy.local.json"
};

const pack = await buildPilotTrafficActionPack(
  {
    preflight,
    runtimeEnv,
    walletControlResult
  },
  {
    gatewayBaseUrl: "https://gateway.example",
    requestedAt: "2026-06-08"
  }
);

assert.equal(pack.valid, true);
assert.equal(pack.status, "ready_for_human_approval");
assert.equal(pack.count, 2);
assert.deepEqual(pack.requests.map((request) => request.step), ["allowed_delivery", "denied_guard"]);
assert.equal(pack.preflight.merchantId, "mcp_search");
assert.equal(pack.preflight.receiptPath, "ops/gateway-receipts.mainnet.jsonl");
assert.equal(pack.evidenceBoundary.startsPilotTraffic, false);
assert.equal(pack.evidenceBoundary.finalExternalActionApprovalRequired, true);
assert.equal(pack.packets[0].status, "draft");
assert.equal(pack.packets[0].approvals.humanWillExecute, false);
assert.ok(pack.packets[0].action.command.includes("PAYMENT-SIGNATURE"));
assert.ok(pack.packets[1].action.command.includes("email=user@example.com"));

for (const packet of pack.packets) {
  const report = await buildExternalActionApprovalReport(approve(packet));
  assert.equal(report.valid, true);
  assert.equal(report.typeReport.request.merchantId, "mcp_search");
  assert.equal(report.typeReport.request.receiptPath, "ops/gateway-receipts.mainnet.jsonl");
}

const mismatch = await buildExternalActionApprovalReport({
  ...approve(pack.packets[0]),
  action: {
    ...pack.packets[0].action,
    command: "curl https://gateway.example/different"
  }
});
assert.equal(mismatch.valid, false);
assert.ok(mismatch.reasons.includes("live_pilot: action.command must exactly match payload.request.command"));

const invalidPack = await buildPilotTrafficActionPack({
  preflight: {
    binding,
    policy,
    gatewayConfig: {
      ...gatewayConfig,
      upstream: {
        baseUrl: "http://127.0.0.1:4181"
      },
      evidence: {
        environment: "local",
        merchantApproved: false,
        rail: "x402",
        network: "local"
      }
    },
    disputePacket
  },
  runtimeEnv,
  walletControlResult
});

assert.equal(invalidPack.valid, false);
assert.equal(invalidPack.status, "needs_preflight_fixes");
assert.ok(invalidPack.reasons.some((reason) => reason.includes("Live pilot upstream.baseUrl must not be localhost")));

function approve(packet) {
  return {
    ...packet,
    status: "approved",
    approvedBy: "pilot-owner",
    approvedAt: "2026-06-08",
    approvals
  };
}

console.log("pilotTrafficActionPack tests passed");
