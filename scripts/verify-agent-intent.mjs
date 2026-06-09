#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { DEFAULT_POLICY, policyFingerprint } from "../src/policyEngine.mjs";
import { verifyAgentIntentSignatureAsync } from "../src/agentIntentSigner.mjs";

const intentPath = process.argv[2];
const policyPath = process.argv[3] || process.env.ALLOW_POLICY_PATH;

if (!intentPath) {
  console.error("Usage: npm run verify-agent-intent -- path/to/signed-intent.json [path/to/policy.json]");
  process.exit(2);
}

try {
  const intent = JSON.parse(await readFile(intentPath, "utf8"));
  const policy = policyPath ? JSON.parse(await readFile(policyPath, "utf8")) : DEFAULT_POLICY;
  const fingerprint = policyFingerprint(policy);
  const verification = await verifyAgentIntentSignatureAsync(intent, policy, fingerprint, {
    requireSignature: process.env.ALLOW_REQUIRE_AGENT_SIGNATURE === "1" ? true : undefined,
    expectedSigner: process.env.ALLOW_AGENT_ADDRESS || undefined
  });

  console.log(
    JSON.stringify(
      {
        path: intentPath,
        valid: verification.valid,
        mode: verification.mode,
        recoveredSigner: verification.recoveredSigner,
        fingerprint,
        reasons: verification.reasons,
        warnings: verification.warnings
      },
      null,
      2
    )
  );

  process.exitCode = verification.valid ? 0 : 1;
} catch (error) {
  console.error(`Agent intent verification failed: ${error.message}`);
  process.exit(1);
}
