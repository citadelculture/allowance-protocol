#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { buildInterviewCampaignPlan } from "../src/interviewCampaign.mjs";

const candidatesPath = process.env.ALLOW_CONTACT_CANDIDATES || process.argv[2] || "ops/contact_candidates.json";
const prospectsPath = process.env.ALLOW_PROSPECTS || process.argv[3] || "ops/prospects.json";
const interviewsPath = process.env.ALLOW_INTERVIEWS || process.argv[4] || "ops/interviews.json";
const scriptPath = process.env.ALLOW_INTERVIEW_SCRIPT || process.argv[5] || "ops/interview_script.json";

const [candidates, prospects, interviews, script] = await Promise.all([
  readJson(candidatesPath),
  readJson(prospectsPath),
  readJson(interviewsPath),
  readJson(scriptPath)
]);

const plan = buildInterviewCampaignPlan(
  {
    candidates,
    prospects,
    interviews,
    script
  },
  {
    limit: Number(process.env.ALLOW_INTERVIEW_CAMPAIGN_LIMIT || 5),
    minimumCompleted: Number(process.env.ALLOW_INTERVIEW_MINIMUM_COMPLETED || 5)
  }
);

console.log(JSON.stringify(plan, null, 2));
process.exit(plan.valid ? 0 : 1);

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}
