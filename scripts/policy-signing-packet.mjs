#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { buildPolicySigningPacket } from "../src/policySigningPacket.mjs";

const templatePath = process.argv[2] || process.env.ALLOW_POLICY_TEMPLATE || "allow-policy.example.json";
const controller = process.argv[3] || process.env.ALLOW_EXPECTED_CONTROLLER || "";

try {
  const template = JSON.parse(await readFile(templatePath, "utf8"));
  const packet = buildPolicySigningPacket(template, { controller });

  console.log(JSON.stringify({
    path: templatePath,
    ...packet
  }, null, 2));

  process.exit(packet.valid ? 0 : 1);
} catch (error) {
  console.error(`Policy signing packet failed: ${error.message}`);
  process.exit(1);
}
