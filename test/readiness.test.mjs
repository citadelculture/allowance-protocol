import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildReadinessAudit, readinessStatus } from "../src/readiness.mjs";
import { createJsonlReceiptStore } from "../src/receiptStore.mjs";
import { productionFixturePolicy } from "../src/productionFixture.mjs";

assert.equal(readinessStatus([{ status: "pass" }]), "ready_for_next_launch_step");
assert.equal(readinessStatus([{ status: "pass" }, { status: "action_required" }]), "needs_external_action");
assert.equal(readinessStatus([{ status: "fail" }]), "not_ready");

const root = await mkdtemp(join(tmpdir(), "allow-readiness-"));
await mkdir(join(root, "ops"), { recursive: true });
await mkdir(join(root, "launch"), { recursive: true });
await mkdir(join(root, "docs"), { recursive: true });
await mkdir(join(root, "src"), { recursive: true });
await mkdir(join(root, "scripts"), { recursive: true });
await mkdir(join(root, "examples"), { recursive: true });
await mkdir(join(root, "contracts"), { recursive: true });

await writeFile(
  join(root, "package.json"),
  JSON.stringify({
    scripts: {
      test: "node test",
      start: "node server.mjs",
      gateway: "node scripts/gateway.mjs",
      "pilot-kit": "node scripts/pilot-kit.mjs",
      "live-pilot-preflight": "node scripts/live-pilot-preflight.mjs",
      "interview-campaign": "node scripts/interview-campaign.mjs",
      "interview-packet": "node scripts/interview-packet.mjs",
      "interview-workspace": "node scripts/interview-workspace.mjs",
      "interview-workspace-audit": "node scripts/interview-workspace-audit.mjs",
      "interview-review-brief": "node scripts/interview-review-brief.mjs",
      "interview-completion-handoff": "node scripts/interview-completion-handoff.mjs",
      "interview-report": "node scripts/interview-report.mjs",
      "evidence-bundle": "node scripts/evidence-bundle.mjs",
      "launch-sequence": "node scripts/launch-sequence.mjs",
      "launch-handoff-brief": "node scripts/launch-handoff-brief.mjs",
      "approval-runbook": "node scripts/approval-runbook.mjs",
      "approval-preflight": "node scripts/approval-preflight.mjs",
      "approval-request": "node scripts/approval-request.mjs",
      "approval-decision-template": "node scripts/approval-decision-template.mjs",
      "approval-decision": "node scripts/approval-decision.mjs",
      "approval-packet-preview": "node scripts/approval-packet-preview.mjs",
      "live-resource-handoff": "node scripts/live-resource-handoff.mjs",
      "site-publication-check": "node scripts/site-publication-check.mjs",
      "secret-exposure-response": "node scripts/secret-exposure-response.mjs",
      "credential-rotation-action-pack": "node scripts/credential-rotation-action-pack.mjs",
      "credential-rotation-handoff": "node scripts/credential-rotation-handoff.mjs",
      "demo-integration-packet": "node scripts/demo-integration-packet.mjs",
      "builder-quickstart": "node scripts/builder-quickstart.mjs",
      "registry-lifecycle-intent": "node scripts/registry-lifecycle-intent.mjs",
      "registry-policy-intent": "node scripts/registry-policy-intent.mjs",
      "receipt-registry-intent": "node scripts/receipt-registry-intent.mjs",
      "registry-transaction-evidence": "node scripts/registry-transaction-evidence.mjs",
      "metrics-report": "node scripts/metrics-report.mjs",
      "token-governance": "node scripts/token-governance.mjs",
      "pilot-disclosure": "node scripts/pilot-disclosure.mjs",
      "merchant-promotion": "node scripts/merchant-promotion.mjs",
      "pilot-authorization": "node scripts/pilot-authorization.mjs",
      "pilot-gateway-config": "node scripts/pilot-gateway-config.mjs",
      "pilot-traffic-action-pack": "node scripts/pilot-traffic-action-pack.mjs",
      "pilot-traffic-execution-evidence": "node scripts/pilot-traffic-execution-evidence.mjs",
      "pilot-evidence-handoff": "node scripts/pilot-evidence-handoff.mjs",
      "pilot-integration-state": "node scripts/pilot-integration-state.mjs",
      "external-action-approval": "node scripts/external-action-approval.mjs",
      "external-action-queue": "node scripts/external-action-queue.mjs",
      "external-action-workspace": "node scripts/external-action-workspace.mjs",
      "external-action-workspace-audit": "node scripts/external-action-workspace-audit.mjs",
      "external-action-review-brief": "node scripts/external-action-review-brief.mjs",
      "execution-evidence-ledger-entry": "node scripts/execution-evidence-ledger-entry.mjs",
      "state-update-preview": "node scripts/state-update-preview.mjs",
      "canonical-update-set": "node scripts/canonical-update-set.mjs",
      "x-post-action-pack": "node scripts/x-post-action-pack.mjs",
      "launch-post-action-pack": "node scripts/x-post-action-pack.mjs",
      "x-post-execution-evidence": "node scripts/x-post-execution-evidence.mjs",
      "x-post-state": "node scripts/x-post-state.mjs",
      "outreach-action-pack": "node scripts/outreach-action-pack.mjs",
      "outreach-execution-evidence": "node scripts/outreach-execution-evidence.mjs",
      "outreach-state": "node scripts/outreach-state.mjs",
      "policy-signing-packet": "node scripts/policy-signing-packet.mjs",
      "ceremony-audit": "node scripts/ceremony-audit.mjs",
      "controller-signing-action-pack": "node scripts/controller-signing-action-pack.mjs",
      "controller-signing-execution-evidence": "node scripts/controller-signing-execution-evidence.mjs",
      "production-policy-handoff": "node scripts/production-policy-handoff.mjs",
      "independent-contract-review": "node scripts/independent-contract-review.mjs",
      "deployment-check-evidence": "node scripts/deployment-check-evidence.mjs"
    }
  })
);

await writeFile(
  join(root, "ops/metrics.json"),
  JSON.stringify({
    date: "2026-06-08",
    policyDecisions: 0,
    approvedReceipts: 0,
    deniedReceipts: 0,
    blockedValueUsd: 0,
    integratedMerchants: 0,
    activeAgents: 0,
    publicBuildDays: 1
  })
);
await writeFile(join(root, "ops/backlog.json"), JSON.stringify([{ priority: 1, status: "next", task: "Run interviews" }]));
await writeFile(join(root, "ops/prospects.json"), JSON.stringify([1, 2, 3, 4, 5].map((id) => ({ id }))));
await writeFile(join(root, "ops/contact_candidates.json"), JSON.stringify([1, 2, 3].map((id) => ({ id }))));
await writeFile(join(root, "ops/interviews.json"), JSON.stringify([]));
await writeFile(join(root, "ops/x_post_execution_records.json"), JSON.stringify([]));
await writeFile(join(root, "ops/pilot_traffic_execution_records.json"), JSON.stringify([]));
await writeFile(
  join(root, "ops/token_governance.json"),
  JSON.stringify({
    manifestId: "token_lock",
    phase: "locked",
    generatedAt: "2026-06-08",
    owner: "allow-operator",
    publicSummary: "Allow has no token at launch.",
    token: {
      launchEnabled: false,
      transferable: false,
      salePlanned: false,
      airdropPlanned: false,
      liquidityPlanned: false,
      marketMakingPlanned: false,
      influencerPromotionPlanned: false,
      returnClaimsPlanned: false
    },
    usageEvidence: {
      thirdPartyReceiptSharePct: 0
    }
  })
);
await writeFile(join(root, "ops/interview_script.json"), JSON.stringify({ questions: ["q1", "q2", "q3", "q4", "q5"] }));
await writeFile(join(root, "ops/interviews_template.json"), JSON.stringify([]));
await writeFile(
  join(root, "ops/merchant_directory.json"),
  JSON.stringify({
    version: "0.1",
    generatedAt: "2026-06-08",
    merchants: [1, 2, 3].map((id) => ({
      id: `merchant_${id}`,
      name: `Merchant ${id}`,
      status: id === 1 ? "pilot_ready" : "candidate",
      surfaces: ["x402_preflight"],
      endpoint: {
        type: "api",
        baseUrl: `https://merchant-${id}.example`,
        testPath: "/v1/search"
      },
      pricing: {
        model: "per_request",
        unitUsd: 0.01 * id,
        currency: "USD"
      },
      payment: {
        protocol: "x402",
        asset: "USDC",
        chain: "Base"
      },
      risk: {
        dataHandlingClass: "low",
        sensitiveMetadataClasses: [],
        riskTags: ["metered"]
      },
      receipts: {
        supported: true,
        fields: ["policyId", "merchantId", "amountUsd", "intentHash", "intentNonce", "metadataHash"]
      },
      refundRules: "Pilot refunds and disputes are handled by written merchant agreement.",
      disputeContact: "@merchant",
      publicProof: "",
      lastReviewedAt: "2026-06-08"
    }))
  })
);
await writeFile(
  join(root, "launch/x_posts.json"),
  JSON.stringify([
    { id: "p1", status: "draft_only", text: "Allow Protocol build log." },
    { id: "p2", status: "draft_only", text: "Agents need allowances." },
    { id: "p3", status: "draft_only", text: "Looking for API builders." }
  ])
);
await writeFile(
  join(root, "index.html"),
  `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Allow Protocol</title>
  <link rel="stylesheet" href="./styles.css">
</head>
<body>
  <main>
    <p>Experimental no-custody demo metrics. No token at launch. Users remain responsible for wallet security.</p>
  </main>
  <script type="module" src="./app.js"></script>
</body>
</html>`
);
await writeFile(join(root, "styles.css"), "body { color: #111; }\n");
await writeFile(join(root, "app.js"), "console.log('allow demo');\n");
await writeFile(
  join(root, "ops/demo_integration_packet.template.json"),
  JSON.stringify({
    intent: {
      merchantId: "mcp_search",
      amountUsd: 0.018,
      resource: "/v1/search?q=agent+payments",
      intentNonce: "demo-search-003",
      metadata: "agent-alpha requesting public search context for launch analysis"
    },
    receipts: []
  })
);
await writeFile(
  join(root, "ops/builder_quickstart.template.json"),
  JSON.stringify({
    server: {
      protocol: "http",
      host: "127.0.0.1",
      port: 4174
    },
    intent: {
      merchantId: "mcp_search",
      amountUsd: 0.018,
      resource: "/v1/search?q=agent+payments",
      intentNonce: "quickstart-search-001",
      metadata: "public search context for agent payment integration"
    },
    receipts: []
  })
);
await writeFile(
  join(root, "ops/secret_exposure_incident.template.json"),
  JSON.stringify({
    incidentId: "credential-exposure-2026-06-09",
    reportedAt: "2026-06-09T13:05:00.000Z",
    reportedBy: "project-owner",
    source: "chat_message",
    responseOwner: "project-owner",
    noRawSecretValuesStored: true,
    ownerNotified: true,
    exposures: [
      {
        type: "wallet_private_key",
        label: "Base wallet funding key",
        compromised: true,
        secretMaterialStored: false,
        contained: {
          rotationRequired: true,
          fundsMovedToFreshWallet: true,
          oldWalletNoLongerUsed: true,
          replacementStoredOutsideRepo: true
        },
        proof: {
          ref: "redacted-wallet-transfer-proof",
          capturedAt: "2026-06-09T13:05:00.000Z",
          redacted: true
        }
      },
      {
        type: "x_bearer_token",
        label: "X account bearer token",
        compromised: true,
        secretMaterialStored: false,
        contained: {
          rotationRequired: true,
          tokenRevoked: true,
          replacementStoredOutsideRepo: true
        },
        proof: {
          ref: "redacted-x-token-revocation-proof",
          capturedAt: "2026-06-09T13:10:00.000Z",
          redacted: true
        }
      }
    ],
    externalActions: {
      moveFunds: false,
      revokeToken: false,
      postToX: false,
      deployContracts: false
    }
  })
);

for (const file of [
  "docs/LEGAL_AND_ETHICS.md",
  "docs/TOKEN_PATH.md",
  "docs/CONTROLLER_SIGNING_CEREMONY.md",
  "docs/CONTROLLER_SIGNING_ACTION_PACK.md",
  "docs/CONTROLLER_SIGNING_EXECUTION_EVIDENCE.md",
  "docs/PRODUCTION_POLICY_HANDOFF.md",
  "docs/THREAT_MODEL.md",
  "docs/INTEGRATION.md",
  "docs/CONTRACT_REVIEW.md",
  "docs/INDEPENDENT_CONTRACT_REVIEW.md",
  "docs/DEPLOYMENT_CHECK_EVIDENCE.md",
  "docs/MERCHANT_PROFILE_SIGNING.md",
  "docs/RATE_LIMITS.md",
  "docs/AGENT_INTENT_SIGNATURES.md",
  "docs/SETTLEMENT_PROOFS.md",
  "docs/REGISTRY_LIFECYCLE_INTENTS.md",
  "docs/REGISTRY_POLICY_INTENTS.md",
  "docs/RECEIPT_REGISTRY_INTENTS.md",
  "docs/REGISTRY_TRANSACTION_EVIDENCE.md",
  "docs/X402_FACILITATOR.md",
  "docs/PILOT_EVIDENCE.md",
  "docs/DISTRIBUTION_CLAIMS.md",
  "docs/DISPUTE_PROCESS.md",
  "docs/LAUNCH_SEQUENCE.md",
  "docs/DEPLOYMENT_READINESS.md",
  "docs/PILOT_AGENT_BINDING.md",
  "docs/PILOT_AUTHORIZATION.md",
  "docs/PILOT_GATEWAY_CONFIG.md",
  "docs/PILOT_TRAFFIC_ACTION_PACK.md",
  "docs/PILOT_TRAFFIC_EXECUTION_EVIDENCE.md",
  "docs/PILOT_EVIDENCE_HANDOFF.md",
  "docs/PILOT_INTEGRATION_STATE.md",
  "docs/PILOT_DISCLOSURE.md",
  "docs/MERCHANT_PROMOTION.md",
  "docs/INTERVIEW_CAMPAIGN.md",
  "docs/INTERVIEW_COMPLETION_HANDOFF.md",
  "docs/X_POST_ACTION_PACK.md",
  "docs/X_POST_EXECUTION_EVIDENCE.md",
  "docs/X_POST_STATE.md",
  "docs/OUTREACH_ACTION_PACK.md",
  "docs/OUTREACH_EXECUTION_EVIDENCE.md",
  "docs/OUTREACH_STATE.md",
  "docs/EXTERNAL_ACTION_APPROVAL.md",
  "docs/EXTERNAL_ACTION_QUEUE.md",
  "docs/EXTERNAL_ACTION_WORKSPACE.md",
  "docs/APPROVAL_RUNBOOK.md",
  "docs/APPROVAL_PREFLIGHT.md",
  "docs/APPROVAL_REQUEST.md",
  "docs/APPROVAL_DECISION.md",
  "docs/APPROVAL_PACKET_PREVIEW.md",
  "docs/LIVE_RESOURCE_HANDOFF.md",
  "docs/SITE_PUBLICATION.md",
  "docs/SECRET_EXPOSURE_RESPONSE.md",
  "docs/CREDENTIAL_ROTATION_ACTION_PACK.md",
  "docs/CREDENTIAL_ROTATION_HANDOFF.md",
  "docs/DEMO_INTEGRATION_PACKET.md",
  "docs/BUILDER_QUICKSTART.md",
  "docs/STATE_UPDATE_PREVIEW.md",
  "docs/CANONICAL_UPDATE_SET.md",
  "docs/EVIDENCE_BUNDLES.md",
  "docs/TOKEN_GOVERNANCE.md",
  "src/gateway.mjs",
  "src/gatewaySmoke.mjs",
  "scripts/gateway.mjs",
  "scripts/gateway-smoke.mjs",
  "ops/gateway.example.json",
  "ops/gateway.x402.example.json",
  "src/mcpGuard.mjs",
  "examples/mcp-guard.mjs",
  "src/walletHook.mjs",
  "examples/wallet-hook.mjs",
  "examples/viem-wallet-client.mjs",
  "src/pilotKit.mjs",
  "src/pilotPacket.mjs",
  "src/pilotAuthorization.mjs",
  "src/pilotGatewayConfig.mjs",
  "src/productionPolicyHandoff.mjs",
  "src/pilotTrafficActionPack.mjs",
  "src/pilotTrafficExecutionEvidence.mjs",
  "src/pilotEvidenceHandoff.mjs",
  "src/pilotIntegrationState.mjs",
  "src/livePilotPreflight.mjs",
  "scripts/pilot-kit.mjs",
  "scripts/pilot-packet.mjs",
  "scripts/pilot-authorization.mjs",
  "scripts/pilot-gateway-config.mjs",
  "scripts/pilot-traffic-action-pack.mjs",
  "scripts/pilot-traffic-execution-evidence.mjs",
  "scripts/pilot-evidence-handoff.mjs",
  "scripts/pilot-integration-state.mjs",
  "scripts/live-pilot-preflight.mjs",
  "scripts/pilot-report.mjs",
  "ops/pilot_authorization_template.json",
  "ops/pilot_gateway_payment_requirements_template.json",
  "ops/pilot_traffic_execution_template.json",
  "src/pilotDisclosure.mjs",
  "scripts/pilot-disclosure.mjs",
  "ops/pilot_disclosure_template.json",
  "src/merchantPromotion.mjs",
  "scripts/merchant-promotion.mjs",
  "ops/merchant_promotion_template.json",
  "src/interviewPacket.mjs",
  "src/interviewCampaign.mjs",
  "src/interviewEvidence.mjs",
  "src/interviewWorkspace.mjs",
  "src/interviewWorkspaceAudit.mjs",
  "src/interviewReviewBrief.mjs",
  "src/interviewCompletionHandoff.mjs",
  "scripts/interview-campaign.mjs",
  "scripts/interview-packet.mjs",
  "scripts/interview-workspace.mjs",
  "scripts/interview-workspace-audit.mjs",
  "scripts/interview-review-brief.mjs",
  "scripts/interview-completion-handoff.mjs",
  "scripts/interview-report.mjs",
  "src/disputeProcess.mjs",
  "scripts/validate-dispute.mjs",
  "ops/dispute_template.json",
  "src/outreachApproval.mjs",
  "scripts/outreach-approval.mjs",
  "src/xPostActionPack.mjs",
  "scripts/x-post-action-pack.mjs",
  "src/xPostExecutionEvidence.mjs",
  "scripts/x-post-execution-evidence.mjs",
  "ops/x_post_execution_template.json",
  "src/xPostState.mjs",
  "scripts/x-post-state.mjs",
  "src/outreachActionPack.mjs",
  "scripts/outreach-action-pack.mjs",
  "src/outreachExecutionEvidence.mjs",
  "scripts/outreach-execution-evidence.mjs",
  "ops/outreach_execution_template.json",
  "src/outreachState.mjs",
  "scripts/outreach-state.mjs",
  "ops/outreach_execution_records.json",
  "src/externalActionApproval.mjs",
  "scripts/external-action-approval.mjs",
  "ops/external_action_template.json",
  "src/externalActionQueue.mjs",
  "scripts/external-action-queue.mjs",
  "src/externalActionWorkspace.mjs",
  "scripts/external-action-workspace.mjs",
  "src/externalActionWorkspaceAudit.mjs",
  "scripts/external-action-workspace-audit.mjs",
  "src/externalActionReviewBrief.mjs",
  "scripts/external-action-review-brief.mjs",
  "src/executionEvidenceLedgerEntry.mjs",
  "scripts/execution-evidence-ledger-entry.mjs",
  "docs/EXECUTION_EVIDENCE_LEDGER.md",
  "src/stateUpdatePreview.mjs",
  "scripts/state-update-preview.mjs",
  "src/canonicalUpdateSet.mjs",
  "scripts/canonical-update-set.mjs",
  "src/evidenceBundle.mjs",
  "scripts/evidence-bundle.mjs",
  "ops/evidence_bundle_template.json",
  "src/launchSequencer.mjs",
  "scripts/launch-sequence.mjs",
  "src/launchHandoffBrief.mjs",
  "scripts/launch-handoff-brief.mjs",
  "src/approvalRunbook.mjs",
  "scripts/approval-runbook.mjs",
  "docs/APPROVAL_RUNBOOK.md",
  "src/approvalPreflight.mjs",
  "scripts/approval-preflight.mjs",
  "docs/APPROVAL_PREFLIGHT.md",
  "src/actionTimeApprovalRequest.mjs",
  "scripts/approval-request.mjs",
  "docs/APPROVAL_REQUEST.md",
  "src/actionTimeApprovalDecision.mjs",
  "scripts/approval-decision-template.mjs",
  "scripts/approval-decision.mjs",
  "docs/APPROVAL_DECISION.md",
  "src/approvalPacketPreview.mjs",
  "scripts/approval-packet-preview.mjs",
  "docs/APPROVAL_PACKET_PREVIEW.md",
  "src/liveResourceHandoff.mjs",
  "scripts/live-resource-handoff.mjs",
  "ops/live_resource_handoff.template.json",
  "docs/LIVE_RESOURCE_HANDOFF.md",
  "src/sitePublicationCheck.mjs",
  "scripts/site-publication-check.mjs",
  "docs/SITE_PUBLICATION.md",
  "src/secretExposureResponse.mjs",
  "scripts/secret-exposure-response.mjs",
  "docs/SECRET_EXPOSURE_RESPONSE.md",
  "src/credentialRotationActionPack.mjs",
  "scripts/credential-rotation-action-pack.mjs",
  "docs/CREDENTIAL_ROTATION_ACTION_PACK.md",
  "src/credentialRotationHandoff.mjs",
  "scripts/credential-rotation-handoff.mjs",
  "docs/CREDENTIAL_ROTATION_HANDOFF.md",
  "src/demoIntegrationPacket.mjs",
  "scripts/demo-integration-packet.mjs",
  "src/builderQuickstart.mjs",
  "scripts/builder-quickstart.mjs",
  "src/tokenGovernance.mjs",
  "scripts/token-governance.mjs",
  "src/merchantProfileSigner.mjs",
  "scripts/sign-merchant-profile.mjs",
  "scripts/verify-merchant-profile.mjs",
  "src/rateLimit.mjs",
  "src/agentIntentSigner.mjs",
  "scripts/sign-agent-intent.mjs",
  "scripts/verify-agent-intent.mjs",
  "src/pilotBinding.mjs",
  "scripts/validate-pilot-binding.mjs",
  "ops/pilot_binding.template.json",
  "src/signingCeremony.mjs",
  "src/policySigningPacket.mjs",
  "src/controllerSigningActionPack.mjs",
  "src/controllerSigningExecutionEvidence.mjs",
  "src/independentContractReview.mjs",
  "src/deploymentCheckEvidence.mjs",
  "scripts/policy-signing-packet.mjs",
  "scripts/ceremony-audit.mjs",
  "scripts/controller-signing-action-pack.mjs",
  "scripts/controller-signing-execution-evidence.mjs",
  "scripts/production-policy-handoff.mjs",
  "ops/controller_signing_execution_template.json",
  "scripts/independent-contract-review.mjs",
  "ops/independent_contract_review_template.json",
  "scripts/deployment-check-evidence.mjs",
  "ops/deployment_check_evidence_template.json",
  "src/deploymentReadiness.mjs",
  "scripts/validate-deployment.mjs",
  "ops/deployment_manifest.template.json",
  "src/settlementProof.mjs",
  "src/registryLifecycleIntent.mjs",
  "scripts/registry-lifecycle-intent.mjs",
  "ops/registry_lifecycle_intent_template.json",
  "src/registryPolicyIntent.mjs",
  "scripts/registry-policy-intent.mjs",
  "ops/registry_policy_intent_template.json",
  "src/receiptRegistryIntent.mjs",
  "scripts/receipt-registry-intent.mjs",
  "ops/receipt_registry_intent_template.json",
  "src/registryTransactionEvidence.mjs",
  "scripts/registry-transaction-evidence.mjs",
  "ops/registry_transaction_evidence_template.json",
  "src/x402Facilitator.mjs",
  "src/x402Smoke.mjs",
  "scripts/x402-smoke.mjs"
]) {
  await writeFile(join(root, file), "ok");
}

await writeFile(
  join(root, "contracts/AllowanceRegistry.sol"),
  await readFile(join(process.cwd(), "contracts/AllowanceRegistry.sol"), "utf8")
);

const receiptPath = join(root, "ops/receipts.jsonl");
const store = createJsonlReceiptStore(receiptPath);
const credibleEvidence = {
  environment: "testnet",
  merchantApproved: true,
  rail: "x402",
  network: "eip155:84532"
};
await store.record({
  merchantId: "mcp_search",
  decision: "allow",
  upstreamStatus: 200,
  evidence: credibleEvidence,
  receipt: {
    id: "allow_1",
    agentId: "agent-alpha",
    merchantId: "mcp_search",
    decision: "allow",
    amountUsd: 0.018
  }
});
await store.record({
  merchantId: "mcp_search",
  decision: "deny",
  reasons: ["Payment metadata contains restricted data: email"],
  evidence: credibleEvidence,
  receipt: {
    id: "allow_2",
    agentId: "agent-alpha",
    merchantId: "mcp_search",
    decision: "deny",
    amountUsd: 0.018
  }
});

const policyPath = join(root, "ops/signed-policy.local.json");
await writeFile(policyPath, JSON.stringify(productionFixturePolicy()));

const audit = await buildReadinessAudit(root, {
  ALLOW_RECEIPT_LOG: receiptPath,
  ALLOW_POLICY_PATH: policyPath
});

assert.equal(audit.status, "needs_external_action");
assert.equal(audit.gates.find((gate) => gate.id === "product.mcp_guard").status, "pass");
assert.equal(audit.gates.find((gate) => gate.id === "product.wallet_hook").status, "pass");
assert.equal(audit.gates.find((gate) => gate.id === "operations.dispute_process").status, "pass");
assert.equal(audit.gates.find((gate) => gate.id === "distribution.outreach_approval").status, "pass");
assert.equal(audit.gates.find((gate) => gate.id === "distribution.x_post_action_pack").status, "pass");
assert.equal(audit.gates.find((gate) => gate.id === "distribution.x_post_execution_evidence").status, "pass");
assert.equal(audit.gates.find((gate) => gate.id === "distribution.x_post_state").status, "pass");
assert.equal(audit.gates.find((gate) => gate.id === "distribution.outreach_action_pack").status, "pass");
assert.equal(audit.gates.find((gate) => gate.id === "distribution.outreach_execution_evidence").status, "pass");
assert.equal(audit.gates.find((gate) => gate.id === "distribution.outreach_state").status, "pass");
assert.equal(audit.gates.find((gate) => gate.id === "operations.pilot_integration_state").status, "pass");
assert.equal(audit.gates.find((gate) => gate.id === "operations.external_action_approval").status, "pass");
assert.equal(audit.gates.find((gate) => gate.id === "operations.external_action_queue").status, "pass");
assert.equal(audit.gates.find((gate) => gate.id === "operations.external_action_workspace").status, "pass");
assert.equal(audit.gates.find((gate) => gate.id === "operations.external_action_workspace_audit").status, "pass");
assert.equal(audit.gates.find((gate) => gate.id === "operations.external_action_review_brief").status, "pass");
assert.equal(audit.gates.find((gate) => gate.id === "operations.evidence_bundle").status, "pass");
assert.equal(audit.gates.find((gate) => gate.id === "operations.launch_sequence").status, "pass");
assert.equal(audit.gates.find((gate) => gate.id === "operations.launch_handoff_brief").status, "pass");
assert.equal(audit.gates.find((gate) => gate.id === "operations.approval_runbook").status, "pass");
assert.equal(audit.gates.find((gate) => gate.id === "operations.approval_preflight").status, "pass");
assert.equal(audit.gates.find((gate) => gate.id === "operations.approval_request").status, "pass");
assert.equal(audit.gates.find((gate) => gate.id === "operations.approval_decision_template").status, "pass");
assert.equal(audit.gates.find((gate) => gate.id === "operations.approval_decision_validator").status, "pass");
assert.equal(audit.gates.find((gate) => gate.id === "operations.approval_packet_preview").status, "pass");
assert.equal(audit.gates.find((gate) => gate.id === "operations.live_resource_handoff").status, "pass");
assert.equal(audit.gates.find((gate) => gate.id === "distribution.site_publication_check").status, "pass");
assert.equal(audit.gates.find((gate) => gate.id === "security.secret_exposure_response_tooling").status, "pass");
assert.equal(audit.gates.find((gate) => gate.id === "security.credential_rotation_action_pack").status, "pass");
assert.equal(audit.gates.find((gate) => gate.id === "security.credential_rotation_handoff").status, "pass");
assert.equal(audit.gates.find((gate) => gate.id === "security.secret_exposure_response").status, "pass");
assert.equal(audit.gates.find((gate) => gate.id === "product.demo_integration_packet").status, "pass");
assert.equal(audit.gates.find((gate) => gate.id === "product.builder_quickstart").status, "pass");
assert.equal(audit.gates.find((gate) => gate.id === "operations.execution_evidence_ledger_entry").status, "pass");
assert.equal(audit.gates.find((gate) => gate.id === "operations.state_update_preview").status, "pass");
assert.equal(audit.gates.find((gate) => gate.id === "operations.canonical_update_set").status, "pass");
assert.equal(audit.gates.find((gate) => gate.id === "token.governance_tooling").status, "pass");
assert.equal(audit.gates.find((gate) => gate.id === "distribution.pilot_disclosure_tooling").status, "pass");
assert.equal(audit.gates.find((gate) => gate.id === "distribution.merchant_promotion_tooling").status, "pass");
assert.equal(audit.gates.find((gate) => gate.id === "product.pilot").status, "pass");
assert.equal(audit.gates.find((gate) => gate.id === "growth.interview_campaign").status, "pass");
assert.equal(audit.gates.find((gate) => gate.id === "growth.interview_workspace").status, "pass");
assert.equal(audit.gates.find((gate) => gate.id === "growth.interview_workspace_audit").status, "pass");
assert.equal(audit.gates.find((gate) => gate.id === "growth.interview_review_brief").status, "pass");
assert.equal(audit.gates.find((gate) => gate.id === "growth.interview_completion_handoff").status, "pass");
assert.equal(audit.gates.find((gate) => gate.id === "distribution.merchant_directory").status, "pass");
assert.equal(audit.gates.find((gate) => gate.id === "security.production_policy").status, "pass");
assert.equal(audit.gates.find((gate) => gate.id === "security.signing_ceremony").status, "pass");
assert.equal(audit.gates.find((gate) => gate.id === "security.controller_signing_action_pack").status, "pass");
assert.equal(audit.gates.find((gate) => gate.id === "security.controller_signing_execution_evidence").status, "pass");
assert.equal(audit.gates.find((gate) => gate.id === "security.contract_review").status, "pass");
assert.equal(audit.gates.find((gate) => gate.id === "security.independent_contract_review_evidence").status, "pass");
assert.equal(audit.gates.find((gate) => gate.id === "security.deployment_check_evidence").status, "pass");
assert.equal(audit.gates.find((gate) => gate.id === "security.deployment_manifest").status, "pass");
assert.equal(audit.gates.find((gate) => gate.id === "security.merchant_profile_signing").status, "pass");
assert.equal(audit.gates.find((gate) => gate.id === "security.rate_limits").status, "pass");
assert.equal(audit.gates.find((gate) => gate.id === "security.agent_intent_signing").status, "pass");
assert.equal(audit.gates.find((gate) => gate.id === "security.pilot_agent_binding").status, "pass");
assert.equal(audit.gates.find((gate) => gate.id === "security.production_runtime_guard").status, "pass");
assert.equal(audit.gates.find((gate) => gate.id === "security.settlement_proofs").status, "pass");
assert.equal(audit.gates.find((gate) => gate.id === "security.registry_lifecycle_intents").status, "pass");
assert.equal(audit.gates.find((gate) => gate.id === "security.registry_policy_intents").status, "pass");
assert.equal(audit.gates.find((gate) => gate.id === "security.receipt_registry_intents").status, "pass");
assert.equal(audit.gates.find((gate) => gate.id === "security.registry_transaction_evidence").status, "pass");
assert.equal(audit.gates.find((gate) => gate.id === "security.x402_facilitator").status, "pass");
assert.equal(audit.gates.find((gate) => gate.id === "pilot.evidence").status, "pass");
assert.equal(audit.gates.find((gate) => gate.id === "growth.interviews").status, "action_required");
assert.ok(audit.nextActions.includes("Run five merchant interviews, link valid intakes, and pass npm run interview-report"));

const liveDirectory = JSON.parse(await readFile(join(root, "ops/merchant_directory.json"), "utf8"));
liveDirectory.merchants[0] = {
  ...liveDirectory.merchants[0],
  status: "live",
  publicProof: "https://merchant-1.example/allow-proof",
  signer: "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf",
  merchantSignature: "0x00",
  signatureMode: "eip712"
};
await writeFile(join(root, "ops/merchant_directory.json"), JSON.stringify(liveDirectory));

const invalidLiveAudit = await buildReadinessAudit(root, {
  ALLOW_RECEIPT_LOG: receiptPath,
  ALLOW_POLICY_PATH: policyPath
});
const invalidLiveGate = invalidLiveAudit.gates.find((gate) => gate.id === "distribution.merchant_directory");
const invalidLiveStateGate = invalidLiveAudit.gates.find((gate) => gate.id === "operations.pilot_integration_state");
assert.equal(invalidLiveAudit.status, "not_ready");
assert.equal(invalidLiveGate.status, "fail");
assert.ok(invalidLiveGate.details.signatureValidation.reasons.some((reason) => reason.includes("merchant_1:")));
assert.equal(invalidLiveStateGate.status, "fail");
assert.ok(invalidLiveStateGate.details.reasons.some((reason) => reason.includes("merchant_1: status=live requires")));

console.log("readiness tests passed");
