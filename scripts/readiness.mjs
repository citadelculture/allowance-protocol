#!/usr/bin/env node

import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildReadinessAudit } from "../src/readiness.mjs";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const audit = await buildReadinessAudit(root, process.env);

console.log(JSON.stringify(audit, null, 2));

process.exitCode = audit.status === "not_ready" ? 1 : 0;
