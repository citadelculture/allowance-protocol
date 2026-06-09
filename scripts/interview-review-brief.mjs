#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildInterviewReviewBrief,
  publicInterviewReviewBriefReport
} from "../src/interviewReviewBrief.mjs";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const workspaceDir = process.argv[2] || process.env.ALLOW_INTERVIEW_WORKSPACE_DIR || join(root, "work/interview-workspace");
const outputPath = process.argv[3] || process.env.ALLOW_INTERVIEW_REVIEW_BRIEF_PATH || join(root, "work/interview-review-brief.md");

try {
  const report = await buildInterviewReviewBrief(resolve(workspaceDir), {
    root
  });
  const target = resolve(outputPath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${report.markdown}\n`, "utf8");
  console.log(JSON.stringify({
    ...publicInterviewReviewBriefReport(report),
    briefPath: target
  }, null, 2));
  process.exitCode = report.valid ? 0 : 1;
} catch (error) {
  console.error(`Interview review brief failed: ${error.message}`);
  process.exit(1);
}
