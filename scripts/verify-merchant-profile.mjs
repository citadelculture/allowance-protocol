#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { verifyMerchantProfileSignatureAsync } from "../src/merchantProfileSigner.mjs";

const profilePath = process.argv[2];

if (!profilePath) {
  console.error("Usage: npm run verify-merchant-profile -- path/to/signed-merchant-profile.json");
  process.exit(2);
}

try {
  const profile = JSON.parse(await readFile(profilePath, "utf8"));
  const verification = await verifyMerchantProfileSignatureAsync(profile, {
    requireSignature: process.env.ALLOW_REQUIRE_MERCHANT_SIGNATURE === "1" ? true : undefined
  });

  console.log(
    JSON.stringify(
      {
        path: profilePath,
        valid: verification.valid,
        mode: verification.mode,
        signer: profile.signer || null,
        recoveredSigner: verification.recoveredSigner,
        fingerprint: verification.fingerprint,
        reasons: verification.reasons,
        warnings: verification.warnings
      },
      null,
      2
    )
  );

  process.exitCode = verification.valid ? 0 : 1;
} catch (error) {
  console.error(`Merchant profile verification failed: ${error.message}`);
  process.exit(1);
}
