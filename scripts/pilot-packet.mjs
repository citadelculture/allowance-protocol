#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { buildMerchantPilotPacket } from "../src/pilotPacket.mjs";

const intakePath = process.argv[2] || "ops/merchant_intake.example.json";

try {
  const intake = JSON.parse(await readFile(intakePath, "utf8"));
  const packet = await buildMerchantPilotPacket(intake);

  console.log(
    JSON.stringify(
      {
        path: intakePath,
        ...packet
      },
      null,
      2
    )
  );

  process.exitCode = packet.valid ? 0 : 1;
} catch (error) {
  console.error(`Pilot packet failed: ${error.message}`);
  process.exit(1);
}
