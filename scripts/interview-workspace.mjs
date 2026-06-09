#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildInterviewWorkspaceReport,
  publicInterviewWorkspaceReport
} from "../src/interviewWorkspace.mjs";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const outputDir = resolvePath(process.argv[2] || process.env.ALLOW_INTERVIEW_WORKSPACE_DIR || join(root, "work/interview-workspace"));
const candidatesPath = process.env.ALLOW_CONTACT_CANDIDATES || "ops/contact_candidates.json";
const prospectsPath = process.env.ALLOW_PROSPECTS || "ops/prospects.json";
const interviewsPath = process.env.ALLOW_INTERVIEWS || "ops/interviews.json";
const scriptPath = process.env.ALLOW_INTERVIEW_SCRIPT || "ops/interview_script.json";

try {
  const [candidates, prospects, interviews, script] = await Promise.all([
    readJson(resolvePath(candidatesPath)),
    readJson(resolvePath(prospectsPath)),
    readJson(resolvePath(interviewsPath)),
    readJson(resolvePath(scriptPath))
  ]);
  const report = buildInterviewWorkspaceReport(
    {
      candidates,
      prospects,
      interviews,
      script
    },
    {
      outputDir: relativeOutputDir(outputDir),
      limit: Number(process.env.ALLOW_INTERVIEW_WORKSPACE_LIMIT || 5),
      minimumCompleted: Number(process.env.ALLOW_INTERVIEW_MINIMUM_COMPLETED || 5)
    }
  );
  await writeWorkspace(report, outputDir);
  console.log(JSON.stringify(publicInterviewWorkspaceReport(report), null, 2));
  process.exitCode = report.valid ? 0 : 1;
} catch (error) {
  console.error(`Interview workspace failed: ${error.message}`);
  process.exit(1);
}

async function writeWorkspace(report, dir) {
  await mkdir(dir, { recursive: true });
  for (const file of report.files || []) {
    const target = resolve(dir, file.path);
    if (!target.startsWith(`${dir}/`) && target !== dir) {
      throw new Error(`Refusing to write outside workspace: ${file.path}`);
    }
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, file.content, "utf8");
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function resolvePath(path) {
  return isAbsolute(path) ? resolve(path) : resolve(root, path);
}

function relativeOutputDir(path) {
  const relative = path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path;
  return relative || ".";
}
