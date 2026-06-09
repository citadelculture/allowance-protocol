import assert from "node:assert/strict";
import { buildExternalActionApprovalReport } from "../src/externalActionApproval.mjs";
import { DEFAULT_POLICY } from "../src/policyEngine.mjs";
import { buildPolicySigningPacket } from "../src/policySigningPacket.mjs";

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

const approvedBase = {
  approvalId: "approval_001",
  status: "approved",
  requestedBy: "allow-operator",
  requestedAt: "2026-06-08",
  approvedBy: "account-owner",
  approvedAt: "2026-06-08",
  approvals
};

const xPost = {
  ...approvedBase,
  actionType: "x_post",
  action: {
    summary: "Post the launch thesis",
    channel: "x",
    destination: "@allow_protocol",
    executionMode: "human_only",
    exactText: "AI agents need allowances, not blank checks.",
    automated: false
  },
  payload: {
    post: {
      id: "p1",
      status: "draft_only",
      text: "AI agents need allowances, not blank checks."
    }
  }
};

const validPost = await buildExternalActionApprovalReport(xPost);
assert.equal(validPost.valid, true);
assert.deepEqual(validPost.reasons, []);
assert.equal(validPost.typeReport.valid, true);

const draftPost = await buildExternalActionApprovalReport({
  ...xPost,
  status: "draft",
  approvedBy: "",
  approvals: {
    ...approvals,
    exactActionReviewed: false
  }
});
assert.equal(draftPost.valid, false);
assert.ok(draftPost.reasons.includes("External action must be approved before execution"));
assert.ok(draftPost.reasons.includes("approvals.exactActionReviewed must be true"));

const mismatchPost = await buildExternalActionApprovalReport({
  ...xPost,
  action: {
    ...xPost.action,
    exactText: "Different text"
  }
});
assert.equal(mismatchPost.valid, false);
assert.ok(mismatchPost.reasons.includes("x_post: action.exactText must exactly match payload.post.text"));

const outreachDraft = {
  prospectId: "p1",
  candidateId: "c1",
  channel: "contact form",
  destination: "https://example.com/contact",
  subject: "Allow Protocol feedback for paid search endpoint",
  message: [
    "Hi Example API,",
    "",
    "I am building Allow Protocol, a no-custody policy layer for agent payments.",
    "",
    "Would you be open to giving blunt feedback on one low-risk endpoint?",
    "",
    "No token pitch. I am trying to learn where agent-payment guardrails are actually painful."
  ].join("\n"),
  status: "draft_only"
};
const outreach = await buildExternalActionApprovalReport({
  ...approvedBase,
  approvalId: "approval_002",
  actionType: "merchant_outreach",
  action: {
    summary: "Send first merchant feedback ask",
    channel: outreachDraft.channel,
    destination: outreachDraft.destination,
    subject: outreachDraft.subject,
    exactText: outreachDraft.message,
    executionMode: "human_only",
    automated: false
  },
  payload: {
    outreachDraft
  }
});
assert.equal(outreach.valid, true);

const signingPacket = buildPolicySigningPacket(DEFAULT_POLICY, {
  controller: "0x1111111111111111111111111111111111111111"
});
const signing = await buildExternalActionApprovalReport({
  ...approvedBase,
  approvalId: "approval_003",
  actionType: "controller_policy_signature",
  action: {
    summary: "Controller wallet signs Allow production policy typed data",
    walletAddress: "0x1111111111111111111111111111111111111111",
    command: "wallet_signTypedData in controller wallet",
    executionMode: "human_only",
    automated: false
  },
  payload: {
    controller: "0x1111111111111111111111111111111111111111",
    policyFingerprint: signingPacket.fingerprint,
    typedData: signingPacket.typedData,
    policyTemplate: {
      ...DEFAULT_POLICY,
      controller: "0x1111111111111111111111111111111111111111"
    }
  }
});
assert.equal(signing.valid, true);
assert.equal(signing.typeReport.signing.controller, "0x1111111111111111111111111111111111111111");

const registryLifecycle = await buildExternalActionApprovalReport({
  ...approvedBase,
  approvalId: "approval_004",
  actionType: "registry_lifecycle_update",
  action: {
    summary: "Human deactivates reviewed Allow registry policy",
    channel: "wallet",
    destination: "0x1234567890123456789012345678901234567890",
    walletAddress: "0x1111111111111111111111111111111111111111",
    command: "Open wallet writeContract setPolicyActive from the reviewed registry lifecycle intent packet",
    executionMode: "human_only",
    automated: false
  },
  payload: {
    lifecycle: {
      action: "set_policy_active",
      policyId: `0x${"11".repeat(32)}`,
      active: false
    },
    registry: {
      contractAddress: "0x1234567890123456789012345678901234567890",
      controller: "0x1111111111111111111111111111111111111111",
      chainId: 84532,
      network: "Base Sepolia",
      environment: "testnet"
    }
  }
});
assert.equal(registryLifecycle.valid, true);
assert.equal(registryLifecycle.typeReport.registry.hasCalldata, true);
assert.equal(registryLifecycle.typeReport.registry.functionName, "setPolicyActive");

const registryPolicyCreate = await buildExternalActionApprovalReport({
  ...approvedBase,
  approvalId: "approval_005",
  actionType: "registry_policy_create",
  action: {
    summary: "Human creates reviewed Allow registry policy",
    channel: "wallet",
    destination: "0x1234567890123456789012345678901234567890",
    walletAddress: "0x1111111111111111111111111111111111111111",
    command: "Open wallet writeContract createPolicy from the reviewed registry policy intent packet",
    executionMode: "human_only",
    automated: false
  },
  payload: {
    policy: {
      ...DEFAULT_POLICY,
      policyId: "allow_policy_live_001",
      controller: "0x1111111111111111111111111111111111111111",
      agentAddress: "0x2222222222222222222222222222222222222222",
      settlementTokenAddress: "0x3333333333333333333333333333333333333333",
      chainId: 84532,
      dailyCapUsd: 25,
      perTxCapUsd: 1.5,
      allowedMerchants: ["mcp_search", "research_api"]
    },
    registry: {
      contractAddress: "0x1234567890123456789012345678901234567890",
      controllerNonce: `0x${"44".repeat(32)}`,
      chainId: 84532,
      network: "Base Sepolia",
      environment: "testnet"
    }
  }
});
assert.equal(registryPolicyCreate.valid, true);
assert.equal(registryPolicyCreate.typeReport.registry.hasCalldata, true);
assert.equal(registryPolicyCreate.typeReport.registry.controller, "0x1111111111111111111111111111111111111111");

const receiptRecord = {
  recordedAt: "2026-06-08T00:00:00.000Z",
  merchantId: "mcp_search",
  decision: "allow",
  evidence: {
    environment: "testnet",
    merchantApproved: true,
    rail: "x402",
    network: "Base Sepolia",
    settlement: "USDC"
  },
  receipt: {
    id: "allow_receipt_001",
    policyId: "allow_policy_live_001",
    agentId: "agent-alpha",
    merchantId: "mcp_search",
    amountUsd: 0.018,
    decision: "allow",
    intentNonce: "nonce-001",
    intentHash: "offchain-intent-hash",
    metadataHash: "offchain-metadata-hash",
    resource: "/paid-search?q=allow"
  }
};
const registryWrite = await buildExternalActionApprovalReport({
  ...approvedBase,
  approvalId: "approval_006",
  actionType: "registry_receipt_write",
  action: {
    summary: "Human records approved Allow receipt in the registry",
    channel: "wallet",
    destination: "0x1234567890123456789012345678901234567890",
    walletAddress: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
    command: "Open wallet writeContract recordReceipt from the reviewed registry intent packet",
    executionMode: "human_only",
    automated: false
  },
  payload: {
    receiptRecord,
    registry: {
      registryPolicyId: `0x${"11".repeat(32)}`,
      contractAddress: "0x1234567890123456789012345678901234567890",
      chainId: 84532,
      network: "Base Sepolia",
      environment: "testnet",
      recorder: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd"
    }
  }
});
assert.equal(registryWrite.valid, true);
assert.equal(registryWrite.typeReport.registry.hasCalldata, true);
assert.equal(registryWrite.typeReport.registry.sourceReceiptId, "allow_receipt_001");

const livePilotMissingAction = await buildExternalActionApprovalReport({
  ...approvedBase,
  approvalId: "approval_007",
  actionType: "live_pilot",
  action: {
    summary: "Run approved live pilot request",
    executionMode: "human_only",
    automated: false
  },
  payload: {
    preflight: {}
  }
});
assert.equal(livePilotMissingAction.valid, false);
assert.ok(livePilotMissingAction.reasons.includes("live_pilot: Missing action.channel"));
assert.ok(livePilotMissingAction.reasons.includes("live_pilot: Missing action.command"));

const secret = await buildExternalActionApprovalReport({
  ...xPost,
  action: {
    ...xPost.action,
    command: "use key 0x0000000000000000000000000000000000000000000000000000000000000001"
  }
});
assert.equal(secret.valid, false);
assert.ok(secret.reasons.includes("External action packet text must not include private keys"));

// --- owner_authorized_automated mode (2026-06-09 amendment) -------------------

{
  const ownerAuthorization = {
    amendmentRef: "docs/EXTERNAL_ACTION_APPROVAL.md#owner-authorization-amendment-2026-06-09",
    authorizedBy: "project-owner",
    authorizedAt: "2026-06-09T19:00:00.000Z",
    statement: "Owner explicitly authorized automated execution in the live session conversation."
  };
  const automatedApprovals = {
    ownerAuthorizedAutomation: true,
    automationScopeReviewed: true,
    exactActionReviewed: true,
    externalSideEffectAcknowledged: true,
    noPrivateKeys: true,
    noCustodyOrEscrow: true,
    noTokenPitch: true,
    noMarketManipulation: true,
    legalEthicsReviewed: true
  };
  const automatedPost = {
    ...xPost,
    approvalId: "approval_owner_auto_1",
    ownerAuthorization,
    approvals: automatedApprovals,
    action: { ...xPost.action, executionMode: "owner_authorized_automated", automated: true }
  };

  const valid = await buildExternalActionApprovalReport(automatedPost);
  assert.equal(valid.valid, true, JSON.stringify(valid.reasons));

  const missingAuthorization = await buildExternalActionApprovalReport({ ...automatedPost, ownerAuthorization: undefined });
  assert.equal(missingAuthorization.valid, false);
  assert.ok(missingAuthorization.reasons.includes("Missing ownerAuthorization.amendmentRef"));

  const missingFlag = await buildExternalActionApprovalReport({
    ...automatedPost,
    approvals: { ...automatedApprovals, automationScopeReviewed: false }
  });
  assert.equal(missingFlag.valid, false);
  assert.ok(missingFlag.reasons.includes("approvals.automationScopeReviewed must be true"));

  const disallowedType = await buildExternalActionApprovalReport({
    ...automatedPost,
    actionType: "merchant_outreach",
    payload: {}
  });
  assert.equal(disallowedType.valid, false);
  assert.ok(disallowedType.reasons.some((r) => r.includes("owner_authorized_automated execution is limited to")));

  // human_only packets are completely unaffected
  const humanStill = await buildExternalActionApprovalReport(xPost);
  assert.equal(humanStill.valid, true);
}

console.log("externalActionApproval tests passed");
