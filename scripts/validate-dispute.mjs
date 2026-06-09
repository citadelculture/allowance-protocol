#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { summarizeDisputePacket, validateDisputePacket } from "../src/disputeProcess.mjs";

const disputePath = process.argv[2] || process.env.ALLOW_DISPUTE_PATH || "ops/dispute_template.json";

try {
  const packet = JSON.parse(await readFile(disputePath, "utf8"));
  const validation = validateDisputePacket(packet, {
    requireResolution: process.env.ALLOW_REQUIRE_DISPUTE_RESOLUTION === "1"
  });
  console.log(
    JSON.stringify(
      {
        path: disputePath,
        ...summarizeDisputePacket(packet, {
          requireResolution: process.env.ALLOW_REQUIRE_DISPUTE_RESOLUTION === "1"
        }),
        validation
      },
      null,
      2
    )
  );
  process.exitCode = validation.valid ? 0 : 1;
} catch (error) {
  console.error(`Dispute validation failed: ${error.message}`);
  process.exit(1);
}
