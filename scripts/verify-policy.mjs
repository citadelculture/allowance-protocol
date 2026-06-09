#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { verifyProductionPolicy } from "../src/policyAudit.mjs";

const policyPath = process.argv[2] || process.env.ALLOW_POLICY_PATH;

if (!policyPath) {
  console.error("Usage: npm run verify-policy -- path/to/signed-policy.local.json");
  process.exit(2);
}

try {
  const raw = await readFile(policyPath, "utf8");
  const policy = JSON.parse(raw);
  const result = await verifyProductionPolicy(policy);

  console.log(
    JSON.stringify(
      {
        path: policyPath,
        valid: result.valid,
        policyId: result.policyId,
        fingerprint: result.fingerprint,
        controller: result.controller,
        recoveredController: result.recoveredController,
        signatureMode: result.signatureMode,
        verifierMode: result.verifierMode,
        reasons: result.reasons,
        warnings: result.warnings
      },
      null,
      2
    )
  );

  process.exitCode = result.valid ? 0 : 1;
} catch (error) {
  console.error(`Policy verification failed: ${error.message}`);
  process.exit(1);
}
