#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { runX402FacilitatorSmoke } from "../src/x402Smoke.mjs";

const configPath = process.argv[2] || process.env.ALLOW_GATEWAY_CONFIG || "ops/gateway.x402.example.json";
const config = JSON.parse(await readFile(configPath, "utf8"));
const paymentSignature = await paymentSignatureFromEnv(process.env);
const report = await runX402FacilitatorSmoke({
  config,
  env: process.env,
  paymentSignature
});

console.log(
  JSON.stringify(
    {
      path: configPath,
      ...report
    },
    null,
    2
  )
);

process.exitCode = report.valid ? 0 : 1;

async function paymentSignatureFromEnv(env) {
  if (env.ALLOW_X402_PAYMENT_SIGNATURE_PATH) {
    return (await readFile(env.ALLOW_X402_PAYMENT_SIGNATURE_PATH, "utf8")).trim();
  }
  return env.ALLOW_X402_PAYMENT_SIGNATURE || env.PAYMENT_SIGNATURE || "";
}
