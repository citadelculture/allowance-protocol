#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  summarizeMerchantDirectory,
  validateMerchantDirectory,
  validateMerchantDirectorySignatures
} from "../src/merchantDirectory.mjs";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const directoryPath = process.argv[2] || join(root, "ops/merchant_directory.json");

try {
  const directory = JSON.parse(await readFile(directoryPath, "utf8"));
  const validation = validateMerchantDirectory(directory);
  const signatureValidation = await validateMerchantDirectorySignatures(directory);
  const summary = summarizeMerchantDirectory(directory);
  const valid = validation.valid && signatureValidation.valid;

  console.log(
    JSON.stringify(
      {
        path: directoryPath,
        valid,
        summary,
        signatureValidation,
        entries: validation.entries
      },
      null,
      2
    )
  );

  process.exitCode = valid ? 0 : 1;
} catch (error) {
  console.error(`Merchant directory validation failed: ${error.message}`);
  process.exit(1);
}
