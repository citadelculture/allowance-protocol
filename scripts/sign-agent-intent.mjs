#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { DEFAULT_POLICY, policyFingerprint } from "../src/policyEngine.mjs";
import { signAgentIntentWithPrivateKey } from "../src/agentIntentSigner.mjs";

const intentPath = process.argv[2];
const policyPath = process.argv[3] || process.env.ALLOW_POLICY_PATH;

if (!intentPath) {
  console.error("Usage: ALLOW_AGENT_PRIVATE_KEY=0x... npm run sign-agent-intent -- path/to/intent.json [path/to/policy.json]");
  process.exit(2);
}

try {
  const intent = JSON.parse(await readFile(intentPath, "utf8"));
  const policy = policyPath ? JSON.parse(await readFile(policyPath, "utf8")) : DEFAULT_POLICY;
  const fingerprint = policyFingerprint(policy);
  const signed = await signAgentIntentWithPrivateKey(
    intent,
    policy,
    fingerprint,
    process.env.ALLOW_AGENT_PRIVATE_KEY
  );

  console.log(
    JSON.stringify(
      {
        ...signed.intent,
        headers: signed.headers
      },
      null,
      2
    )
  );
} catch (error) {
  console.error(`Agent intent signing failed: ${error.message}`);
  process.exit(1);
}
