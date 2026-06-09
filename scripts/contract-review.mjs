#!/usr/bin/env node

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { reviewAllowanceRegistry } from "../src/contractReview.mjs";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const contractPath = process.argv[2] || join(root, "contracts/AllowanceRegistry.sol");

try {
  const review = await reviewAllowanceRegistry(contractPath);
  console.log(
    JSON.stringify(
      {
        path: contractPath,
        ...review
      },
      null,
      2
    )
  );
  process.exitCode = review.valid ? 0 : 1;
} catch (error) {
  console.error(`Contract review failed: ${error.message}`);
  process.exit(1);
}
