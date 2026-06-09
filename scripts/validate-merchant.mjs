#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { buildMerchantPolicyPatch, summarizeMerchantReadiness } from "../src/merchantIntake.mjs";

const intakePath = process.argv[2];

if (!intakePath) {
  console.error("Usage: npm run validate-merchant -- path/to/merchant-intake.json");
  process.exit(2);
}

try {
  const raw = await readFile(intakePath, "utf8");
  const intake = JSON.parse(raw);
  const readiness = summarizeMerchantReadiness(intake);
  const policyPatch = buildMerchantPolicyPatch(intake);

  console.log(
    JSON.stringify(
      {
        path: intakePath,
        readiness,
        policyPatch: policyPatch.policyPatch,
        merchant: policyPatch.merchant
      },
      null,
      2
    )
  );

  process.exitCode = readiness.valid ? 0 : 1;
} catch (error) {
  console.error(`Merchant validation failed: ${error.message}`);
  process.exit(1);
}
