#!/usr/bin/env node

import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildInterviewEvidenceReport } from "../src/interviewEvidence.mjs";
import {
  buildInterviewReviewBrief,
  publicInterviewReviewBriefReport
} from "../src/interviewReviewBrief.mjs";
import {
  buildInterviewCompletionHandoff,
  publicInterviewCompletionHandoffReport
} from "../src/interviewCompletionHandoff.mjs";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const outputPath = process.argv[2] || process.env.ALLOW_INTERVIEW_COMPLETION_HANDOFF_PATH || join(root, "work/interview-completion-handoff.md");
const paths = {
  workspace: process.env.ALLOW_INTERVIEW_WORKSPACE_DIR || "work/interview-workspace",
  interviews: process.env.ALLOW_INTERVIEWS || "ops/interviews.json",
  prospects: process.env.ALLOW_PROSPECTS || "ops/prospects.json",
  contactCandidates: process.env.ALLOW_CONTACT_CANDIDATES || "ops/contact_candidates.json"
};

try {
  const report = await buildCurrentInterviewCompletionHandoff(paths);
  const target = resolvePath(outputPath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${report.markdown}\n`, "utf8");
  console.log(JSON.stringify({
    ...publicInterviewCompletionHandoffReport(report),
    handoffPath: target
  }, null, 2));
} catch (error) {
  console.error(`Interview completion handoff failed: ${error.message}`);
  process.exit(1);
}

async function buildCurrentInterviewCompletionHandoff(inputPaths) {
  const [interviewsRead, prospectsRead, candidatesRead] = await Promise.all([
    readJsonSource(inputPaths.interviews, "interviews"),
    readJsonSource(inputPaths.prospects, "prospects"),
    readJsonSource(inputPaths.contactCandidates, "contact candidates")
  ]);
  const sourceErrors = [
    ...interviewsRead.reasons,
    ...prospectsRead.reasons,
    ...candidatesRead.reasons
  ];
  const reviewBrief = await buildInterviewReviewBrief(resolvePath(inputPaths.workspace), {
    root
  });
  const interviewEvidenceReport = await buildInterviewEvidenceReport(
    root,
    Array.isArray(interviewsRead.value) ? interviewsRead.value : [],
    {
      prospects: Array.isArray(prospectsRead.value) ? prospectsRead.value : [],
      contactCandidates: Array.isArray(candidatesRead.value) ? candidatesRead.value : []
    }
  );

  return buildInterviewCompletionHandoff({
    reviewBrief: publicInterviewReviewBriefReport(reviewBrief),
    interviewEvidenceReport,
    paths: inputPaths,
    sourceErrors
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
