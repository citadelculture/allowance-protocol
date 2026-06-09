#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { buildSigningCeremonyAudit } from "../src/signingCeremony.mjs";

const policyPath = process.argv[2] || process.env.ALLOW_POLICY_PATH;

if (!policyPath && !process.env.ALLOW_POLICY_JSON) {
  console.error("Usage: npm run ceremony-audit -- path/to/signed-policy.local.json");
  process.exit(2);
}

try {
  const policy = process.env.ALLOW_POLICY_JSON
    ? JSON.parse(process.env.ALLOW_POLICY_JSON)
    : JSON.parse(await readFile(policyPath, "utf8"));
  const audit = await buildSigningCeremonyAudit({
    policy,
    expectedController: process.env.ALLOW_EXPECTED_CONTROLLER,
    env: process.env,
    policyPath
  });

  console.log(
    JSON.stringify(
      {
        path: policyPath || "ALLOW_POLICY_JSON",
        ...audit
      },
      null,
      2
    )
  );

  process.exitCode = audit.valid ? 0 : 1;
} catch (error) {
  console.error(`Signing ceremony audit failed: ${error.message}`);
  process.exit(1);
}
