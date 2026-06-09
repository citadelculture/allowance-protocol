#!/usr/bin/env node

import { readFile, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadReceiptRecordsFromPaths, receiptLogPathsFromEnv } from "../src/metrics.mjs";
import { buildPilotDisclosureReport } from "../src/pilotDisclosure.mjs";
import { buildXPostActionPack } from "../src/xPostActionPack.mjs";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const postsPath = process.argv[2] || join(root, "launch/x_posts.json");
const destination = process.argv[3] || process.env.ALLOW_X_HANDLE || "@allow_protocol";

try {
  const posts = JSON.parse(await readFile(resolvePath(postsPath), "utf8"));
  const disclosures = await loadDisclosureEvidence(root);
  const assetReasons = await assetReasonsForPosts(posts);
  const report = buildXPostActionPack(posts, {
    destination,
    requestedBy: process.env.ALLOW_EXTERNAL_ACTION_REQUESTED_BY || "allow-operator",
    requestedAt: process.env.ALLOW_EXTERNAL_ACTION_REQUESTED_AT,
    approvalIdPrefix: process.env.ALLOW_X_POST_APPROVAL_ID_PREFIX || "x_post",
    validEvidenceRefs: disclosures.validEvidenceRefs,
    requireExperimentalDisclosure: process.env.ALLOW_REQUIRE_EXPERIMENTAL_DISCLOSURE === "1"
  });
  report.disclosures = disclosures;
  report.assetReasons = assetReasons;
  if (assetReasons.length || !disclosures.valid) {
    report.valid = false;
    report.status = "needs_post_fixes";
    report.reasons = [...new Set([...(report.reasons || []), ...assetReasons])];
  }

  console.log(
    JSON.stringify(
      {
        postsPath,
        ...report
      },
      null,
      2
    )
  );
  process.exitCode = report.valid ? 0 : 1;
} catch (error) {
  console.error(`X post action pack failed: ${error.message}`);
  process.exit(1);
}

async function assetReasonsForPosts(posts) {
  const reasons = [];
  for (const post of Array.isArray(posts) ? posts : []) {
    if (!post.assetPath) continue;
    try {
      await stat(resolvePath(post.assetPath));
    } catch {
      reasons.push(`${post.id || "post"}: Missing asset: ${post.assetPath}`);
    }
  }
  return reasons;
}

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
      const packet = JSON.parse(await readFile(resolvePath(path), "utf8"));
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

function resolvePath(path) {
  return isAbsolute(path) ? path : resolve(root, path);
}
