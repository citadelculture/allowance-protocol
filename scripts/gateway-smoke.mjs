#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runLocalGatewaySmoke } from "../src/gatewaySmoke.mjs";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const configPath = process.argv[2] || process.env.ALLOW_GATEWAY_CONFIG || "ops/gateway.example.json";

try {
  const config = JSON.parse(await readFile(resolve(root, configPath), "utf8"));
  const smoke = await runLocalGatewaySmoke(config);

  console.log(
    JSON.stringify(
      {
        path: configPath,
        ...smoke
      },
      null,
      2
    )
  );

  process.exitCode = smoke.valid ? 0 : 1;
} catch (error) {
  console.error(`Gateway smoke failed: ${error.message}`);
  process.exit(1);
}
