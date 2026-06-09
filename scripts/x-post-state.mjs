#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildXPostStateReport } from "../src/xPostState.mjs";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const recordsPath = process.argv[2] || join(root, "ops/x_post_execution_records.json");

try {
  const [launchPosts, recordsValue] = await Promise.all([
    readJson(join(root, "launch/x_posts.json")),
    readJson(recordsPath)
  ]);
  const report = await buildXPostStateReport({
    launchPosts,
    executionRecords: recordsValue
  });

  console.log(
    JSON.stringify(
      {
        recordsPath,
        ...report
      },
      null,
      2
    )
  );
  process.exitCode = report.valid ? 0 : 1;
} catch (error) {
  console.error(`X post state validation failed: ${error.message}`);
  process.exit(1);
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}
