#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildLivePilotPreflight } from "../src/livePilotPreflight.mjs";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const bindingPath = process.argv[2] || process.env.ALLOW_PILOT_BINDING_PATH || "ops/pilot_binding.template.json";
const policyPath = process.argv[3] || process.env.ALLOW_POLICY_PATH || "ops/signed-policy.local.json";
const gatewayPath = process.argv[4] || process.env.ALLOW_GATEWAY_CONFIG || "ops/gateway.x402.example.json";
const disputePath = process.argv[5] || process.env.ALLOW_DISPUTE_PACKET || "ops/dispute_template.json";

const [bindingResult, policyResult, gatewayResult, disputeResult] = await Promise.all([
  readJsonSource(bindingPath, "binding"),
  readJsonSource(policyPath, "policy"),
  readJsonSource(gatewayPath, "gateway"),
  readJsonSource(disputePath, "dispute")
]);
const sourceErrors = [
  ...bindingResult.reasons,
  ...policyResult.reasons,
  ...gatewayResult.reasons,
  ...disputeResult.reasons
];
const report = await buildLivePilotPreflight(
  {
    binding: bindingResult.value,
    policy: policyResult.value,
    gatewayConfig: gatewayResult.value,
    disputePacket: disputeResult.value
  },
  {
    env: process.env,
    sourceErrors
  }
);

console.log(JSON.stringify({
  paths: {
    binding: bindingPath,
    policy: policyPath,
    gateway: gatewayPath,
    dispute: disputePath
  },
  ...report
}, null, 2));

process.exit(report.valid ? 0 : 1);

async function readJsonSource(path, label) {
  try {
    const absolutePath = isAbsolute(path) ? path : resolve(root, path);
    return {
      value: JSON.parse(await readFile(absolutePath, "utf8")),
      reasons: []
    };
  } catch (error) {
    return {
      value: null,
      reasons: [`Unable to load ${label} JSON from ${path}: ${error.message}`]
    };
  }
}
