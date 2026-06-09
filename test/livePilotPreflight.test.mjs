import assert from "node:assert/strict";
import { policyFingerprint } from "../src/policyEngine.mjs";
import { EIP712_FIXTURE_AGENT, productionFixturePolicy } from "../src/productionFixture.mjs";
import { buildPilotWalletControlMessage } from "../src/pilotBinding.mjs";
import {
  buildLivePilotPreflight,
  validateLiveGatewayConfig,
  validateLivePilotRuntime
} from "../src/livePilotPreflight.mjs";

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
    approvalRef: "merchant-approval:mcp-search:001",
    approvedBy: "merchant-ops",
    approvedAt: "2026-06-08"
  },
  agent: {
    agentId: policy.agentId,
    walletType: "eoa",
    walletAddress: EIP712_FIXTURE_AGENT,
    controlEvidenceRef: "wallet-control:mcp-search:001",
    controlChallenge: "",
    controlSignature: "0xstub"
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
binding.agent.approvedBy = "agent-operator";
binding.agent.approvedAt = "2026-06-08";
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
      approvalRef: "merchant-approval:mcp-search:001"
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

const report = await buildLivePilotPreflight(
  {
    binding,
    policy,
    gatewayConfig,
    disputePacket
  },
  {
    walletControlResult: {
      valid: true,
      expectedSigner: EIP712_FIXTURE_AGENT,
      recoveredSigner: EIP712_FIXTURE_AGENT,
      challenge: binding.agent.controlChallenge,
      reasons: [],
      warnings: []
    },
    env: {
      ALLOW_PRODUCTION: "1",
      ALLOW_REQUIRE_AGENT_SIGNATURE: "1",
      ALLOW_POLICY_PATH: "ops/signed-policy.local.json"
    }
  }
);

assert.equal(report.valid, true);
assert.equal(report.status, "ready_for_merchant_approved_pilot");
assert.equal(report.gateway.route.merchantId, "mcp_search");
assert.equal(report.dispute.valid, true);
assert.equal(report.runtime.valid, true);
assert.equal(report.evidenceBoundary.movesFunds, false);
assert.ok(report.nextAction.includes("pilot-report"));

const localGateway = validateLiveGatewayConfig(
  {
    ...gatewayConfig,
    upstream: { baseUrl: "http://127.0.0.1:4181" },
    evidence: {
      environment: "local",
      merchantApproved: false,
      rail: "demo",
      network: "local"
    },
    settlement: {
      required: false
    }
  },
  binding,
  policy
);

assert.equal(localGateway.valid, false);
assert.ok(localGateway.reasons.includes("Live pilot upstream.baseUrl must not be localhost"));
assert.ok(localGateway.reasons.includes("Gateway evidence environment must be testnet or mainnet"));

const badRuntime = validateLivePilotRuntime({
  ALLOW_PRODUCTION: "1",
  ALLOW_REQUIRE_AGENT_SIGNATURE: "0",
  ALLOW_USE_FIXTURE: "1",
  ALLOW_CONTROLLER_PRIVATE_KEY: "0xsecret"
});

assert.equal(badRuntime.valid, false);
assert.ok(badRuntime.reasons.includes("ALLOW_REQUIRE_AGENT_SIGNATURE=1 is required for live pilot runtime"));
assert.ok(badRuntime.reasons.includes("ALLOW_USE_FIXTURE=1 is not allowed for live pilot runtime"));

console.log("livePilotPreflight tests passed");
