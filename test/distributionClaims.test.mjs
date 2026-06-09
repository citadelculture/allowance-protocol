import assert from "node:assert/strict";
import { validateDistributionClaims } from "../src/distributionClaims.mjs";

const clean = validateDistributionClaims("Allow ships a no-custody policy engine for agent payments.");
assert.equal(clean.valid, true);
assert.deepEqual(clean.reasons, []);

const profit = validateDistributionClaims("This is a 100x investment opportunity with guaranteed yield.");
assert.equal(profit.valid, false);
assert.ok(profit.reasons.includes("Do not imply guaranteed or risk-free outcomes"));
assert.ok(profit.reasons.includes("Do not promise profits, yield, or investment returns"));
assert.ok(profit.reasons.includes("Do not use price-hype or pump language"));
assert.ok(profit.reasons.includes("Do not frame product updates as investment calls"));

const token = validateDistributionClaims("Join the airdrop and token launch whitelist.");
assert.equal(token.valid, false);
assert.ok(token.reasons.includes("Do not promote a token, airdrop, presale, or whitelist"));

const valuation = validateDistributionClaims("We are building toward a billion-dollar market cap.");
assert.equal(valuation.valid, false);
assert.ok(valuation.reasons.includes("Do not make market-cap or valuation claims"));

const partnership = validateDistributionClaims("Allow is officially partnered with Example API.");
assert.equal(partnership.valid, false);
assert.ok(partnership.reasons.includes("Partnership, backing, endorsement, or integration claims require explicit approval"));
assert.equal(validateDistributionClaims("Allow is officially partnered with Example API.", { partnershipApproved: true }).valid, true);

const usage = validateDistributionClaims("Allow processed 1000 receipts this week.");
assert.equal(usage.valid, false);
assert.ok(usage.reasons.includes("Quantified usage claims require an evidence reference"));
assert.equal(validateDistributionClaims("Allow processed 1000 receipts this week.", { evidenceRef: "metrics-report:2026-06-08" }).valid, true);
const invalidEvidence = validateDistributionClaims("Allow processed 1000 receipts this week.", {
  evidenceRef: "metrics-report:2026-06-08",
  validEvidenceRefs: ["pilot-disclosure:approved"]
});
assert.equal(invalidEvidence.valid, false);
assert.ok(invalidEvidence.reasons.includes("Quantified usage claims require a valid evidence reference"));
assert.equal(validateDistributionClaims("Allow processed 1000 receipts this week.", {
  evidenceRef: "pilot-disclosure:approved",
  validEvidenceRefs: ["pilot-disclosure:approved"]
}).valid, true);

const disclosure = validateDistributionClaims("Allow ships a policy engine.", { requireExperimentalDisclosure: true });
assert.equal(disclosure.valid, true);
assert.ok(disclosure.warnings.includes("Consider disclosing that the product is experimental"));

console.log("distributionClaims tests passed");
