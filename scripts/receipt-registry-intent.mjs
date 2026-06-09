#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildReceiptRegistryIntent } from "../src/receiptRegistryIntent.mjs";
import { loadReceiptRecords } from "../src/receiptStore.mjs";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const manifestPath = process.argv[2] || join(root, "ops/receipt_registry_intent_template.json");

try {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const receiptRecord = await resolveReceiptRecord(root, manifest);
  const deploymentManifest = await resolveDeploymentManifest(root, manifest);
  const report = buildReceiptRegistryIntent(receiptRecord, {
    ...(manifest.registry || {}),
    deploymentManifest: deploymentManifest || manifest.deploymentManifest || manifest.deployment,
    requireAllowedDecision: manifest.requireAllowedDecision !== false,
    requireCredibleEvidence: manifest.requireCredibleEvidence === true || manifest.registry?.requireCredibleEvidence === true,
    requireMerchantApproval: manifest.requireMerchantApproval === true || manifest.registry?.requireMerchantApproval === true,
    requireDeployedRegistry: manifest.requireDeployedRegistry === true || manifest.registry?.requireDeployedRegistry === true
  });

  console.log(
    JSON.stringify(
      {
        manifestPath,
        intentId: manifest.intentId || null,
        receiptLogPath: manifest.receiptLogPath || null,
        receiptId: manifest.receiptId || report.sourceReceipt.id,
        ...report
      },
      null,
      2
    )
  );
  process.exitCode = report.valid ? 0 : 1;
} catch (error) {
  console.error(`Receipt registry intent failed: ${error.message}`);
  process.exit(1);
}

async function resolveReceiptRecord(rootDir, manifest = {}) {
  if (manifest.receiptRecord) return manifest.receiptRecord;
  if (manifest.record) return manifest.record;
  if (manifest.receipt) return { receipt: manifest.receipt, evidence: manifest.evidence || {} };
  if (!manifest.receiptLogPath) return {};

  const logPath = insideRoot(rootDir, manifest.receiptLogPath);
  const records = await loadReceiptRecords(logPath);
  if (manifest.receiptId) {
    const match = records.find((record) => record.receipt?.id === manifest.receiptId || record.id === manifest.receiptId);
    if (!match) throw new Error(`Receipt id ${manifest.receiptId} was not found in ${manifest.receiptLogPath}`);
    return match;
  }
  if (records.length !== 1) {
    throw new Error("receiptId is required when receiptLogPath contains zero or multiple records");
  }
  return records[0];
}

async function resolveDeploymentManifest(rootDir, manifest = {}) {
  if (manifest.deploymentManifestPath) {
    const path = insideRoot(rootDir, manifest.deploymentManifestPath);
    return JSON.parse(await readFile(path, "utf8"));
  }
  return manifest.deploymentManifest || null;
}

function insideRoot(rootDir, path) {
  const absolute = resolve(rootDir, path);
  const normalizedRoot = resolve(rootDir);
  if (absolute !== normalizedRoot && !absolute.startsWith(`${normalizedRoot}/`)) {
    throw new Error(`${path} must stay inside the project root`);
  }
  return absolute;
}
