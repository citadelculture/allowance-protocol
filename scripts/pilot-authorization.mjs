#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPilotAuthorizationReport } from "../src/pilotAuthorization.mjs";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const packetPath = process.argv[2] || join(root, "ops/pilot_authorization_template.json");
const intakePath = process.argv[3] || "";
const interviewsPath = process.argv[4] || join(root, "ops/interviews.json");

try {
  const packet = await readJson(resolve(root, packetPath));
  const intake = intakePath ? await readJson(resolve(root, intakePath)) : null;
  const interviews = await readJson(resolve(root, interviewsPath));
  const report = buildPilotAuthorizationReport(packet, {
    intake,
    interviews
  });

  console.log(
    JSON.stringify(
      {
        packetPath,
        intakePath: intakePath || null,
        interviewsPath,
        ...report
      },
      null,
      2
    )
  );
  process.exitCode = report.valid ? 0 : 1;
} catch (error) {
  console.error(`Pilot authorization validation failed: ${error.message}`);
  process.exit(1);
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}
