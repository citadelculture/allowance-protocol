#!/usr/bin/env node

import { createServer } from "node:http";
import { loadGatewayConfig, createAllowGatewayHandler } from "../src/gateway.mjs";
import { createJsonlReceiptStore } from "../src/receiptStore.mjs";
import {
  agentIntentVerifierFromEnv,
  assertProductionRuntimeReady,
  loadPolicyFromEnv,
  policyVerifierFromEnv
} from "../src/runtimeConfig.mjs";
import { x402FacilitatorVerifierFromEnv } from "../src/x402Facilitator.mjs";

const configPath = process.argv[2] || process.env.ALLOW_GATEWAY_CONFIG || "ops/gateway.example.json";
const config = await loadGatewayConfig(configPath);
const policy = await loadPolicyFromEnv(process.env);
const runtimeReadiness = assertProductionRuntimeReady(process.env, policy);
const policyVerifier = policyVerifierFromEnv(process.env);
const agentIntentVerifier = agentIntentVerifierFromEnv(process.env);
const settlementVerifier = x402FacilitatorVerifierFromEnv(process.env, { config });
const receipts = [];
const receiptPath = process.env.ALLOW_RECEIPT_LOG || config.receipts.path;
const receiptStore = receiptPath ? createJsonlReceiptStore(receiptPath) : null;
const handler = createAllowGatewayHandler({
  config,
  policy,
  policyVerifier,
  agentIntentVerifier,
  settlementVerifier,
  receipts,
  receiptStore
});

const server = createServer(async (req, res) => {
  try {
    await handler(req, res);
  } catch (error) {
    res.writeHead(500, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    });
    res.end(JSON.stringify({ error: error.message }, null, 2));
  }
});

server.listen(config.listen.port, config.listen.host, () => {
  console.log(`Allow Gateway ${config.name} running at http://${config.listen.host}:${config.listen.port}`);
  console.log(`Protecting ${config.routes.length} route(s), upstream ${config.upstream.baseUrl}`);
  if (runtimeReadiness.mode === "production") console.log("Production runtime guard: signed agent intents required");
  if (receiptPath) console.log(`Writing receipt log to ${receiptPath}`);
});
