#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  summarizePilotBinding,
  validatePilotBinding,
  verifyPilotWalletControlSignatureAsync
} from "../src/pilotBinding.mjs";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const bindingPath = process.argv[2] || process.env.ALLOW_PILOT_BINDING_PATH || "ops/pilot_binding.template.json";

try {
  const binding = JSON.parse(await readFile(resolve(root, bindingPath), "utf8"));
  const policyPath = process.argv[3] || process.env.ALLOW_POLICY_PATH || binding?.policy?.policyPath;
  const policyResult = await readPolicy(policyPath);
  const walletControl = await verifyPilotWalletControlSignatureAsync(binding);
  const validation = validatePilotBinding(binding, {
    policy: policyResult.policy,
    requirePolicy: process.env.ALLOW_PILOT_BINDING_REQUIRE_POLICY !== "0"
  });
  const valid = validation.valid && policyResult.valid && walletControl.valid;
  const reasons = [...new Set([...policyResult.reasons, ...walletControl.reasons, ...validation.reasons])];
  const warnings = [...new Set([...policyResult.warnings, ...walletControl.warnings, ...validation.warnings])];

  console.log(
    JSON.stringify(
      {
        path: bindingPath,
        ...summarizePilotBinding(binding, {
          policy: policyResult.policy,
          requirePolicy: process.env.ALLOW_PILOT_BINDING_REQUIRE_POLICY !== "0"
        }),
        valid,
        reasons,
        warnings,
        policy: {
          path: policyPath || null,
          loaded: Boolean(policyResult.policy)
        },
        walletControl,
        validation
      },
      null,
      2
    )
  );

  process.exitCode = valid ? 0 : 1;
} catch (error) {
  console.error(`Pilot binding validation failed: ${error.message}`);
  process.exit(1);
}

async function readPolicy(policyPath) {
  const reasons = [];
  const warnings = [];

  if (!policyPath) {
    return {
      valid: false,
      policy: null,
      reasons: ["Missing policy path for pilot binding validation"],
      warnings
    };
  }

  try {
    const absolutePolicyPath = isAbsolute(policyPath) ? policyPath : resolve(root, policyPath);
    return {
      valid: true,
      policy: JSON.parse(await readFile(absolutePolicyPath, "utf8")),
      reasons,
      warnings
    };
  } catch (error) {
    return {
      valid: false,
      policy: null,
      reasons: [`Unable to load policy document: ${error.message}`],
      warnings
    };
  }
}
