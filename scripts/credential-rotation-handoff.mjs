#!/usr/bin/env node

import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCredentialRotationActionPack } from "../src/credentialRotationActionPack.mjs";
import {
  buildCredentialRotationHandoff,
  publicCredentialRotationHandoffReport
} from "../src/credentialRotationHandoff.mjs";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const outputPath = process.argv[2] || process.env.ALLOW_CREDENTIAL_ROTATION_HANDOFF_PATH || join(root, "work/credential-rotation-handoff.md");
const paths = {
  incident: process.env.ALLOW_SECRET_EXPOSURE_INCIDENT_PATH || "ops/secret_exposure_incident.template.json"
};

try {
  const report = await buildCurrentCredentialRotationHandoff(paths);
  const target = resolvePath(outputPath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${report.markdown}\n`, "utf8");
  console.log(JSON.stringify({
    ...publicCredentialRotationHandoffReport(report),
    handoffPath: target
  }, null, 2));
} catch (error) {
  console.error(`Credential rotation handoff failed: ${error.message}`);
  process.exit(1);
}

async function buildCurrentCredentialRotationHandoff(inputPaths) {
  const incidentResult = await readJsonSource(inputPaths.incident, "secret exposure incident");
  const actionPack = buildCredentialRotationActionPack(incidentResult.value || {}, {
    sourceErrors: incidentResult.reasons
  });

  return buildCredentialRotationHandoff({
    actionPack,
    paths: inputPaths,
    sourceErrors: incidentResult.reasons
  });
}

async function readJsonSource(path, label) {
  try {
    return {
      value: JSON.parse(await readFile(resolvePath(path), "utf8")),
      reasons: []
    };
  } catch (error) {
    return {
      value: null,
      reasons: [`Unable to load ${label} JSON from ${path}: ${error.message}`]
    };
  }
}

function resolvePath(path) {
  return isAbsolute(path) ? path : resolve(root, path);
}
