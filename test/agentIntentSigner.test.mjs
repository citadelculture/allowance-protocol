import assert from "node:assert/strict";
import {
  DEFAULT_POLICY,
  evaluatePaymentIntentAsync,
  policyFingerprint
} from "../src/policyEngine.mjs";
import { preflightPaymentAsync } from "../src/httpPreflight.mjs";
import {
  buildAgentIntentTypedData,
  policyAgentSigner,
  recoverAgentIntentSignerWithViem,
  signAgentIntentWithPrivateKey,
  verifyAgentIntentSignature,
  verifyAgentIntentSignatureAsync
} from "../src/agentIntentSigner.mjs";

const agentAddress = "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf";
const policy = {
  ...DEFAULT_POLICY,
  spentTodayUsd: 0,
  agentAddress,
  requireAgentIntentSignature: true
};
const fingerprint = policyFingerprint(policy);
const intent = {
  merchantId: "mcp_search",
  amountUsd: 0.018,
  resource: "/v1/search?q=x402",
  metadata: "public query",
  intentNonce: "agent-intent-001"
};

assert.equal(policyAgentSigner(policy), agentAddress);

const typedData = buildAgentIntentTypedData(intent, policy, fingerprint);
assert.equal(typedData.domain.name, "Allow Protocol");
assert.equal(typedData.primaryType, "AllowPaymentIntent");
assert.equal(typedData.message.policyId, policy.policyId);
assert.equal(typedData.message.intentNonce, "agent-intent-001");

const missingSignature = await verifyAgentIntentSignatureAsync(intent, policy, fingerprint);
assert.equal(missingSignature.valid, false);
assert.ok(missingSignature.reasons.includes("Missing agent intent signature"));

const signed = await signAgentIntentWithPrivateKey(
  intent,
  policy,
  fingerprint,
  "0x0000000000000000000000000000000000000000000000000000000000000001"
);

assert.equal(signed.signer, agentAddress);
assert.equal(signed.intent.agentAddress, agentAddress);
assert.equal(signed.intent.agentSignatureMode, "eip712");
assert.equal(signed.headers["x-allow-agent"], agentAddress);

const recovered = await recoverAgentIntentSignerWithViem({
  typedData: signed.typedData,
  signature: signed.signature
});

assert.equal(recovered, agentAddress);

const valid = await verifyAgentIntentSignatureAsync(signed.intent, policy, fingerprint);
assert.equal(valid.valid, true);
assert.equal(valid.recoveredSigner, agentAddress);

const syncValid = verifyAgentIntentSignature(signed.intent, policy, fingerprint, {
  recoverSigner: () => agentAddress
});
assert.equal(syncValid.valid, true);

const tampered = await verifyAgentIntentSignatureAsync(
  {
    ...signed.intent,
    amountUsd: 0.5
  },
  policy,
  fingerprint
);

assert.equal(tampered.valid, false);
assert.ok(
  tampered.reasons.some(
    (reason) =>
      reason.startsWith("EIP-712 agent intent recovery failed:") ||
      reason === "Recovered agent signer does not match policy agent address"
  )
);

const missingPolicyAgent = await verifyAgentIntentSignatureAsync(
  signed.intent,
  {
    ...DEFAULT_POLICY,
    requireAgentIntentSignature: true
  },
  policyFingerprint(DEFAULT_POLICY)
);

assert.equal(missingPolicyAgent.valid, false);
assert.ok(missingPolicyAgent.reasons.includes("Missing policy agent address for intent signature"));

const unsignedOptional = await verifyAgentIntentSignatureAsync(intent, DEFAULT_POLICY, policyFingerprint(DEFAULT_POLICY));
assert.equal(unsignedOptional.valid, true);
assert.equal(unsignedOptional.mode, "unsigned");

const denied = await evaluatePaymentIntentAsync(intent, policy, []);
assert.equal(denied.decision, "deny");
assert.ok(denied.reasons.includes("Missing agent intent signature"));
assert.equal(denied.receipt.agentIntentSignatureMode, "unsigned");

const allowed = await evaluatePaymentIntentAsync(signed.intent, policy, []);
assert.equal(allowed.decision, "allow");
assert.equal(allowed.receipt.agentIntentSignatureMode, "eip712");
assert.equal(allowed.receipt.agentSigner, agentAddress);

const blockedPreflight = await preflightPaymentAsync({
  intent,
  policy,
  agentIntentVerifier: {
    requireSignature: true,
    mode: "eip712"
  }
});

assert.equal(blockedPreflight.status, 402);
assert.ok(blockedPreflight.body.evaluation.reasons.includes("Missing agent intent signature"));

const allowedPreflight = await preflightPaymentAsync({
  intent: signed.intent,
  policy,
  agentIntentVerifier: {
    requireSignature: true,
    mode: "eip712"
  }
});

assert.equal(allowedPreflight.status, 200);
assert.equal(allowedPreflight.headers["x-allow-agent-signature-mode"], "eip712");

console.log("agentIntentSigner tests passed");
