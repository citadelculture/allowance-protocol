#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildSecretExposureResponseReport,
  publicSecretExposureResponseReport
} from "../src/secretExposureResponse.mjs";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const incidentPath = process.argv[2] || process.env.ALLOW_SECRET_EXPOSURE_INCIDENT_PATH || join(root, "ops/secret_exposure_incident.template.json");

try {
  const source = await readFile(incidentPath, "utf8");
  const report = buildSecretExposureResponseReport(JSON.parse(source));
  console.log(JSON.stringify({
    incidentPath,
    ...publicSecretExposureResponseReport(report)
  }, null, 2));
  process.exitCode = report.valid ? 0 : 1;
} catch (error) {
  const report = buildSecretExposureResponseReport(null, {
    sourceErrors: [`Unable to read secret exposure incident ${incidentPath}: ${error.message}`]
  });
  console.log(JSON.stringify({
    incidentPath,
    ...publicSecretExposureResponseReport(report)
  }, null, 2));
  process.exit(1);
}
