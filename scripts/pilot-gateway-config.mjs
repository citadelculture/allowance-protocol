#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPilotGatewayConfigReport } from "../src/pilotGatewayConfig.mjs";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const authorizationPath = process.argv[2] || join(root, "ops/pilot_authorization_template.json");
const intakePath = process.argv[3] || "";
const interviewsPath = process.argv[4] || join(root, "ops/interviews.json");
const paymentRequirementsPath = process.argv[5] || "";

try {
  const authorization = await readJson(resolve(root, authorizationPath));
  const intake = intakePath ? await readJson(resolve(root, intakePath)) : null;
  const interviews = await readJson(resolve(root, interviewsPath));
  const paymentRequirements = paymentRequirementsPath ? await readJson(resolve(root, paymentRequirementsPath)) : null;
  const report = buildPilotGatewayConfigReport(
    authorization,
    {
      intake,
      interviews
    },
    {
      paymentRequirements
    }
  );

  console.log(
    JSON.stringify(
      {
        authorizationPath,
        intakePath: intakePath || null,
        interviewsPath,
        paymentRequirementsPath: paymentRequirementsPath || null,
        ...report
      },
      null,
      2
    )
  );
  process.exitCode = report.valid ? 0 : 1;
} catch (error) {
  console.error(`Pilot gateway config build failed: ${error.message}`);
  process.exit(1);
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}
