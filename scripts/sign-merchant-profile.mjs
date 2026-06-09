#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { signMerchantProfileWithPrivateKey } from "../src/merchantProfileSigner.mjs";

const profilePath = process.argv[2];

if (!profilePath) {
  console.error("Usage: ALLOW_MERCHANT_PRIVATE_KEY=0x... npm run sign-merchant-profile -- path/to/merchant-profile.json");
  process.exit(2);
}

try {
  const profile = JSON.parse(await readFile(profilePath, "utf8"));
  const signed = await signMerchantProfileWithPrivateKey(profile, process.env.ALLOW_MERCHANT_PRIVATE_KEY);

  console.log(JSON.stringify(signed.profile, null, 2));
} catch (error) {
  console.error(`Merchant profile signing failed: ${error.message}`);
  process.exit(1);
}
