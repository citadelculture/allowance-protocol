#!/usr/bin/env node

import { readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadReceiptRecordsFromPaths, receiptLogPathsFromEnv } from "../src/metrics.mjs";
import { buildPilotDisclosureReport } from "../src/pilotDisclosure.mjs";
import { summarizeLaunchPosts } from "../src/socialLaunch.mjs";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const postsPath = join(root, "launch/x_posts.json");
const posts = JSON.parse(await readFile(postsPath, "utf8"));
const disclosures = await loadDisclosureEvidence(root);
const report = summarizeLaunchPosts(posts, {
  validEvidenceRefs: disclosures.validEvidenceRefs
});
report.disclosures = disclosures;

for (const post of report.posts) {
  if (!post.assetPath) continue;
  try {
    await stat(join(root, post.assetPath));
  } catch {
    post.valid = false;
    post.reasons.push(`Missing asset: ${post.assetPath}`);
  }
}

report.valid = report.posts.every((post) => post.valid) && disclosures.valid;

console.log(JSON.stringify(report, null, 2));
process.exitCode = report.valid ? 0 : 1;

async function loadDisclosureEvidence(root) {
  const disclosurePaths = String(process.env.ALLOW_DISCLOSURE_PATHS || "")
    .split(",")
    .map((path) => path.trim())
    .filter(Boolean);
  const receiptPaths = receiptLogPathsFromEnv(process.env, [join(root, "ops/gateway-receipts.local.jsonl")]);

  if (disclosurePaths.length === 0) {
    return {
      valid: true,
      requiredForUsageClaims: true,
      reports: [],
      validEvidenceRefs: []
    };
  }

  const loaded = await loadReceiptRecordsFromPaths(receiptPaths);
  const reports = [];
  for (const path of disclosurePaths) {
    try {
      const packet = JSON.parse(await readFile(path, "utf8"));
      reports.push({
        path,
        ...buildPilotDisclosureReport(packet, loaded.records, {
          minimumActiveAgents: process.env.ALLOW_PILOT_MIN_ACTIVE_AGENTS || 1,
          requireExperimentalDisclosure: process.env.ALLOW_REQUIRE_EXPERIMENTAL_DISCLOSURE === "1"
        })
      });
    } catch (error) {
      reports.push({
        path,
        valid: false,
        reasons: [`Failed to load disclosure packet: ${error.message}`],
        warnings: []
      });
    }
  }

  return {
    valid: reports.every((item) => item.valid),
    requiredForUsageClaims: true,
    receiptLogs: {
      loaded: loaded.loadedPaths,
      missing: loaded.missingPaths
    },
    reports,
    validEvidenceRefs: reports.filter((item) => item.valid).map((item) => item.evidenceRef).filter(Boolean)
  };
}
