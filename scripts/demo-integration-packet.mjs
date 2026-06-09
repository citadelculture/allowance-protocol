#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildDemoIntegrationPacket,
  publicDemoIntegrationPacket
} from "../src/demoIntegrationPacket.mjs";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const packetPath = process.argv[2] || process.env.ALLOW_DEMO_INTEGRATION_PACKET_PATH || join(root, "ops/demo_integration_packet.template.json");

try {
  const source = await readFile(packetPath, "utf8");
  const report = buildDemoIntegrationPacket(JSON.parse(source));
  console.log(JSON.stringify({
    packetPath,
    ...publicDemoIntegrationPacket(report)
  }, null, 2));
  process.exitCode = report.valid ? 0 : 1;
} catch (error) {
  const report = buildDemoIntegrationPacket({}, {
    sourceErrors: [`Unable to read demo integration packet input ${packetPath}: ${error.message}`]
  });
  console.log(JSON.stringify({
    packetPath,
    ...publicDemoIntegrationPacket(report)
  }, null, 2));
  process.exit(1);
}
