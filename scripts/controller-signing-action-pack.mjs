#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { buildControllerSigningActionPack } from "../src/controllerSigningActionPack.mjs";

const templatePath = process.argv[2] || process.env.ALLOW_POLICY_TEMPLATE || "allow-policy.example.json";
const controller = process.argv[3] || process.env.ALLOW_EXPECTED_CONTROLLER || "";

try {
  const template = JSON.parse(await readFile(templatePath, "utf8"));
  const report = buildControllerSigningActionPack(template, { controller });

  console.log(
    JSON.stringify(
      {
        path: templatePath,
        ...report
      },
      null,
      2
    )
  );
  process.exit(report.valid ? 0 : 1);
} catch (error) {
  console.error(`Controller signing action pack failed: ${error.message}`);
  process.exit(1);
}
