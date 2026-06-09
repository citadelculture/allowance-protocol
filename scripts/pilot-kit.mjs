#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { buildPilotKit } from "../src/pilotKit.mjs";

const intakePath = process.argv[2] || "ops/merchant_intake.example.json";
const raw = await readFile(intakePath, "utf8");
const intake = JSON.parse(raw);
const kit = buildPilotKit(intake);

console.log(
  JSON.stringify(
    {
      path: intakePath,
      ...kit
    },
    null,
    2
  )
);

process.exitCode = kit.readiness.valid ? 0 : 1;
