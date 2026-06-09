#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildInterviewEvidenceReport } from "../src/interviewEvidence.mjs";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const interviewsPath = process.argv[2] || process.env.ALLOW_INTERVIEWS || "ops/interviews.json";
const interviewsFile = isAbsolute(interviewsPath) ? interviewsPath : join(root, interviewsPath);
const [interviews, prospects, contactCandidates] = await Promise.all([
  readJson(interviewsFile),
  readJson(join(root, "ops/prospects.json")),
  readJson(join(root, "ops/contact_candidates.json"))
]);
const report = await buildInterviewEvidenceReport(root, interviews, {
  prospects,
  contactCandidates
});

console.log(JSON.stringify({
  path: interviewsPath,
  ...report
}, null, 2));

process.exit(report.valid ? 0 : 1);

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}
