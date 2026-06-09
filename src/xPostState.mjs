import { buildXPostExecutionEvidenceReport } from "./xPostExecutionEvidence.mjs";

export const PIPELINE_X_POST_STATUSES = ["draft_only", "posted"];

const X_POST_STATUS_RANK = {
  draft_only: 0,
  posted: 1
};

export async function buildXPostStateReport(input = {}, options = {}) {
  const launchPosts = Array.isArray(input.launchPosts) ? input.launchPosts : Array.isArray(input.posts) ? input.posts : [];
  const executionRecords = recordsFromInput(input.executionRecords ?? input.records);
  const reasons = [];
  const warnings = [];
  const launchPostIds = new Set(launchPosts.map((post) => post.id).filter(Boolean));
  const launchPostsById = new Map(launchPosts.map((post) => [post.id, post]));
  const seenEvidenceIds = new Set();
  const seenExecutedPostIds = new Set();

  const executionEntries = [];
  for (const [index, record] of executionRecords.entries()) {
    const report = await buildXPostExecutionEvidenceReport(record, options.executionOptions || {});
    const entryReasons = [...report.reasons];
    const evidenceId = report.evidenceId || record?.evidenceId || `executionRecord[${index}]`;
    const packetPost = postFromRecord(record);
    const postId = String(record?.postId || record?.launchPostId || packetPost?.id || "").trim();

    if (seenEvidenceIds.has(evidenceId)) entryReasons.push(`Duplicate evidenceId: ${evidenceId}`);
    if (evidenceId) seenEvidenceIds.add(evidenceId);
    if (!postId) entryReasons.push("Missing launch post id in execution evidence");
    if (postId && launchPostIds.size > 0 && !launchPostIds.has(postId)) {
      entryReasons.push(`Unknown launch post id: ${postId}`);
    }
    if (postId && seenExecutedPostIds.has(postId)) {
      entryReasons.push(`Duplicate post execution evidence for postId: ${postId}`);
    }
    if (postId) seenExecutedPostIds.add(postId);

    const launchPost = launchPostsById.get(postId);
    if (launchPost && String(packetPost?.text || "") !== String(launchPost.text || "")) {
      entryReasons.push("approvalPacket.payload.post.text must match launch post text");
    }

    const valid = report.valid && entryReasons.length === 0;
    executionEntries.push({
      index,
      evidenceId,
      valid,
      postId: postId || null,
      status: report.status,
      executionStatus: report.executionStatus,
      approvalRef: report.approvalRef,
      postedAt: report.posted.postedAt,
      accountHandle: report.posted.accountHandle,
      postUrl: report.posted.postUrl,
      reasons: unique(entryReasons),
      warnings: report.warnings,
      evidenceBoundary: report.evidenceBoundary
    });
    reasons.push(...entryReasons.map((reason) => `${evidenceId}: ${reason}`));
    warnings.push(...report.warnings.map((warning) => `${evidenceId}: ${warning}`));
  }

  const validEntries = executionEntries.filter((entry) => entry.valid);
  const entriesByPost = groupBy(validEntries, "postId");
  const postsReport = launchPosts.map((post) => postStateReport(post, entriesByPost.get(post.id) || []));

  for (const post of postsReport) {
    reasons.push(...post.reasons.map((reason) => `${post.postId}: ${reason}`));
    warnings.push(...post.warnings.map((warning) => `${post.postId}: ${warning}`));
  }

  return {
    generatedAt: new Date().toISOString(),
    valid: reasons.length === 0,
    status: statusForReport({ reasons, validEntries, postsReport }),
    counts: {
      launchPosts: launchPosts.length,
      executionRecords: executionEntries.length,
      validExecutionRecords: validEntries.length,
      invalidExecutionRecords: executionEntries.length - validEntries.length,
      postsWithValidatedExecution: postsReport.filter((post) => post.hasValidatedExecution).length,
      postedClaims: postsReport.filter((post) => post.current.status === "posted").length
    },
    byCurrentStatus: statusCounts(postsReport.map((post) => post.current.status)),
    byProjectedStatus: statusCounts(postsReport.map((post) => post.projected.status)),
    executionEntries,
    posts: postsReport,
    projectedLaunchPosts: postsReport.map((post) => post.projected),
    reasons: unique(reasons),
    warnings: unique(warnings),
    nextAction: nextActionForReport({ reasons, validEntries, postsReport }),
    evidenceBoundary: {
      postsContent: false,
      approvesExternalAction: false,
      sendsOutreach: false,
      signsWalletPayloads: false,
      startsPilotTraffic: false,
      movesFunds: false,
      storesSecrets: false,
      marksApproved: false,
      marksTokenReady: false
    }
  };
}

function postStateReport(post, evidenceEntries) {
  const reasons = [];
  const warnings = [];
  const currentStatus = normalizeKnown(post.status, PIPELINE_X_POST_STATUSES, "draft_only");
  const hasValidatedExecution = evidenceEntries.length > 0;
  const projectedStatus = hasValidatedExecution ? "posted" : currentStatus;

  if (!PIPELINE_X_POST_STATUSES.includes(String(post.status || "draft_only"))) {
    reasons.push("Invalid post status");
  }
  if (X_POST_STATUS_RANK[currentStatus] > 0 && !hasValidatedExecution) {
    reasons.push(`status=${currentStatus} has no valid X post execution evidence`);
  }
  if (hasValidatedExecution && X_POST_STATUS_RANK[currentStatus] > X_POST_STATUS_RANK[projectedStatus]) {
    reasons.push(`status=${currentStatus} is ahead of validated evidence status=${projectedStatus}`);
  }
  if (hasValidatedExecution && currentStatus === "draft_only") {
    warnings.push("Launch post remains draft_only; projected state is posted from execution evidence");
  }

  return {
    postId: post.id || null,
    current: {
      status: currentStatus
    },
    evidence: {
      evidenceIds: evidenceEntries.map((entry) => entry.evidenceId),
      postUrls: unique(evidenceEntries.map((entry) => entry.postUrl).filter(Boolean)),
      accountHandles: unique(evidenceEntries.map((entry) => entry.accountHandle).filter(Boolean)),
      latestPostedAt: latestDate(evidenceEntries.map((entry) => entry.postedAt).filter(Boolean))
    },
    projected: {
      ...post,
      status: projectedStatus
    },
    hasValidatedExecution,
    reasons,
    warnings
  };
}

function postFromRecord(record = {}) {
  return record?.approvalPacket?.payload?.post || record?.approval?.packet?.payload?.post || record?.post || {};
}

function recordsFromInput(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object" && Array.isArray(value.records)) return value.records;
  return [];
}

function statusForReport({ reasons, validEntries, postsReport }) {
  if (reasons.length > 0) return "needs_state_fixes";
  if (postsReport.some((post) => post.current.status === "posted")) return "state_backed_by_x_post_evidence";
  if (validEntries.length > 0) return "has_x_post_execution_evidence";
  return "no_x_post_execution_evidence_yet";
}

function nextActionForReport({ reasons, validEntries, postsReport }) {
  if (reasons.length > 0) return "Fix X post execution evidence or launch post statuses before citing public posts";
  if (validEntries.length > 0) return "Add verified public post evidence to the launch evidence bundle before citing it";
  if (postsReport.length > 0) return "Keep launch posts draft_only until account-owner approval and human-posted execution evidence exist";
  return "Create draft-only launch posts before preparing X post approvals";
}

function normalizeKnown(value, allowed, fallback) {
  const text = String(value || fallback);
  return allowed.includes(text) ? text : fallback;
}

function groupBy(items, key) {
  const groups = new Map();
  for (const item of items) {
    const value = item[key];
    if (!value) continue;
    if (!groups.has(value)) groups.set(value, []);
    groups.get(value).push(item);
  }
  return groups;
}

function statusCounts(values) {
  return values.reduce((acc, value) => {
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function latestDate(values) {
  return values.sort().at(-1) || null;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
