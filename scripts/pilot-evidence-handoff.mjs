#!/usr/bin/env node

import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPilotEvidenceReport } from "../src/pilotEvidence.mjs";
import {
  buildPilotEvidenceHandoff,
  publicPilotEvidenceHandoffReport
} from "../src/pilotEvidenceHandoff.mjs";
import { buildPilotTrafficActionPack, safePilotRuntimeEnv } from "../src/pilotTrafficActionPack.mjs";
import { loadReceiptRecordsFromPaths } from "../src/metrics.mjs";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const outputPath = process.argv[2] || process.env.ALLOW_PILOT_EVIDENCE_HANDOFF_PATH || join(root, "work/pilot-evidence-handoff.md");
const paths = {
  binding: process.env.ALLOW_PILOT_BINDING_PATH || "ops/pilot_binding.template.json",
  policy: process.env.ALLOW_POLICY_PATH || "ops/signed-policy.local.json",
  gateway: process.env.ALLOW_GATEWAY_CONFIG || "ops/gateway.x402.example.json",
  dispute: process.env.ALLOW_DISPUTE_PACKET || "ops/dispute_template.json",
  receiptLog: process.env.ALLOW_RECEIPT_LOG || "ops/gateway-receipts.pilot.jsonl",
  allowedExecutionEvidence: process.env.ALLOW_ALLOWED_PILOT_EXECUTION_EVIDENCE || "work/pilot-traffic-allowed-execution.json",
  deniedExecutionEvidence: process.env.ALLOW_DENIED_PILOT_EXECUTION_EVIDENCE || "work/pilot-traffic-denied-execution.json",
  pilotDisclosure: process.env.ALLOW_PILOT_DISCLOSURE_PATH || "ops/pilot_disclosure_template.json",
  pilotTrafficExecutionRecords: process.env.ALLOW_PILOT_TRAFFIC_EXECUTION_RECORDS || "ops/pilot_traffic_execution_records.json"
};

try {
  const report = await buildCurrentPilotEvidenceHandoff(paths);
  const target = resolvePath(outputPath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${report.markdown}\n`, "utf8");
  console.log(JSON.stringify({
    ...publicPilotEvidenceHandoffReport(report),
    handoffPath: target
  }, null, 2));
} catch (error) {
  console.error(`Pilot evidence handoff failed: ${error.message}`);
  process.exit(1);
}

async function buildCurrentPilotEvidenceHandoff(inputPaths) {
  const [bindingResult, policyResult, gatewayResult, disputeResult] = await Promise.all([
    readJsonSource(inputPaths.binding, "binding"),
    readJsonSource(inputPaths.policy, "policy"),
    readJsonSource(inputPaths.gateway, "gateway"),
    readJsonSource(inputPaths.dispute, "dispute")
  ]);
  const sourceErrors = [
    ...bindingResult.reasons,
    ...policyResult.reasons,
    ...gatewayResult.reasons,
    ...disputeResult.reasons
  ];
  const trafficActionPack = await buildPilotTrafficActionPack(
    {
      preflight: {
        binding: bindingResult.value,
        policy: policyResult.value,
        gatewayConfig: gatewayResult.value,
        disputePacket: disputeResult.value
      },
      runtimeEnv: safePilotRuntimeEnv(process.env),
      sourceErrors
    },
    {
      gatewayBaseUrl: process.env.ALLOW_GATEWAY_BASE_URL || "$ALLOW_GATEWAY_BASE_URL"
    }
  );
  const receiptLogs = await loadReceiptRecordsFromPaths([resolvePath(inputPaths.receiptLog)]);
  const pilotEvidence = buildPilotEvidenceReport(receiptLogs.records, {
    merchantId: process.env.ALLOW_PILOT_MERCHANT_ID || "",
    minimumActiveAgents: process.env.ALLOW_PILOT_MIN_ACTIVE_AGENTS || 1
  });

  return buildPilotEvidenceHandoff({
    trafficActionPack,
    pilotEvidence,
    receiptLogPath: inputPaths.receiptLog,
    paths: inputPaths,
    sourceWarnings: receiptLogs.missingPaths.map((path) => `Receipt log missing: ${path}`)
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
