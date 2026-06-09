import assert from "node:assert/strict";
import {
  buildMerchantProfileTypedData,
  merchantProfileFingerprint,
  recoverMerchantProfileSignerWithViem,
  signMerchantProfileWithPrivateKey,
  verifyMerchantProfileSignatureAsync
} from "../src/merchantProfileSigner.mjs";
import { validateMerchantDirectoryEntry } from "../src/merchantDirectory.mjs";

const profile = {
  id: "research_api",
  name: "Research API",
  status: "live",
  surfaces: ["x402_preflight"],
  endpoint: {
    type: "api",
    baseUrl: "https://research.example",
    testPath: "/v1/search"
  },
  pricing: {
    model: "per_request",
    unitUsd: 0.25,
    currency: "USD"
  },
  payment: {
    protocol: "x402",
    asset: "USDC",
    chain: "Base"
  },
  risk: {
    dataHandlingClass: "sensitive",
    sensitiveMetadataClasses: ["query_text"],
    riskTags: ["looped_agent_calls"]
  },
  receipts: {
    supported: true,
    fields: ["policyId", "merchantId", "amountUsd", "intentHash", "intentNonce", "metadataHash"]
  },
  refundRules: "Pilot refunds and disputes are handled by written merchant agreement.",
  disputeContact: "@casey",
  publicProof: "https://research.example/allow-proof",
  lastReviewedAt: "2026-06-08"
};

const unsignedLive = validateMerchantDirectoryEntry(profile, { now: "2026-06-08" });
assert.equal(unsignedLive.valid, false);
assert.ok(unsignedLive.reasons.includes("Missing signer"));
assert.ok(unsignedLive.reasons.includes("Missing merchantSignature"));
assert.ok(unsignedLive.reasons.includes("Live merchant profile signatureMode must be eip712"));

const signed = await signMerchantProfileWithPrivateKey(
  profile,
  "0x0000000000000000000000000000000000000000000000000000000000000001"
);

assert.equal(signed.profile.signer, "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf");
assert.equal(signed.profile.signatureMode, "eip712");
assert.ok(signed.profile.merchantSignature.startsWith("0x"));
assert.equal(merchantProfileFingerprint(signed.profile), signed.fingerprint);

const typedData = buildMerchantProfileTypedData(signed.profile, signed.fingerprint);
assert.equal(typedData.domain.name, "Allow Protocol");
assert.equal(typedData.primaryType, "AllowMerchantProfile");
assert.equal(typedData.message.id, "research_api");

const recovered = await recoverMerchantProfileSignerWithViem({
  typedData: signed.typedData,
  signature: signed.profile.merchantSignature
});

assert.equal(recovered, signed.signer);

const verification = await verifyMerchantProfileSignatureAsync(signed.profile);
assert.equal(verification.valid, true);
assert.equal(verification.recoveredSigner, signed.signer);

const liveValidation = validateMerchantDirectoryEntry(signed.profile, { now: "2026-06-08" });
assert.equal(liveValidation.valid, true);

const tampered = await verifyMerchantProfileSignatureAsync({
  ...signed.profile,
  pricing: {
    ...signed.profile.pricing,
    unitUsd: 1
  }
});

assert.equal(tampered.valid, false);
assert.ok(tampered.reasons.some((reason) => reason.startsWith("EIP-712 merchant profile recovery failed:") || reason === "Recovered merchant profile signer does not match profile signer"));

const unsignedCandidate = await verifyMerchantProfileSignatureAsync({
  ...profile,
  status: "candidate",
  publicProof: "",
  signatureMode: undefined,
  signer: undefined,
  merchantSignature: undefined
});

assert.equal(unsignedCandidate.valid, true);
assert.equal(unsignedCandidate.mode, "unsigned");

console.log("merchantProfileSigner tests passed");
