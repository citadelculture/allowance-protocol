import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { evaluateAllowanceRegistryReview } from "../src/contractReview.mjs";

const source = await readFile(join(process.cwd(), "contracts/AllowanceRegistry.sol"), "utf8");
const review = evaluateAllowanceRegistryReview(source);

assert.equal(review.valid, true);
assert.equal(review.gates.find((gate) => gate.id === "contract.no_custody").status, "pass");
assert.equal(review.gates.find((gate) => gate.id === "contract.replay_protection").status, "pass");
assert.equal(review.gates.find((gate) => gate.id === "contract.receipt_hashes_only").status, "pass");
assert.ok(review.warnings.includes("Automated source review is not an independent smart contract audit"));

const custodyReview = evaluateAllowanceRegistryReview(
  source.replace("contract AllowanceRegistry {", "contract AllowanceRegistry {\n    receive() external payable {}\n")
);

assert.equal(custodyReview.valid, false);
assert.equal(custodyReview.gates.find((gate) => gate.id === "contract.no_custody").status, "fail");
assert.ok(custodyReview.gates.find((gate) => gate.id === "contract.no_custody").details.includes("payable"));

const replayReview = evaluateAllowanceRegistryReview(
  source.replace("mapping(bytes32 => mapping(bytes32 => bool)) public usedIntentNonce;", "")
);

assert.equal(replayReview.valid, false);
assert.equal(replayReview.gates.find((gate) => gate.id === "contract.replay_protection").status, "fail");

const rawMetadataReview = evaluateAllowanceRegistryReview(
  source.replace("bytes32 metadataHash", "string metadata")
);

assert.equal(rawMetadataReview.valid, false);
assert.equal(rawMetadataReview.gates.find((gate) => gate.id === "contract.receipt_hashes_only").status, "fail");

console.log("contractReview tests passed");
