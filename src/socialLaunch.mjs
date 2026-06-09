import { validateDistributionClaims } from "./distributionClaims.mjs";

export const X_POST_LIMIT = 280;

export function countPostChars(text) {
  return [...String(text || "")].length;
}

export function validateXPost(post, options = {}) {
  const limit = Number(options.limit || X_POST_LIMIT);
  const reasons = [];
  const warnings = [];
  const length = countPostChars(post?.text);

  if (!post || typeof post !== "object") {
    return {
      valid: false,
      reasons: ["Post must be an object"],
      warnings: [],
      length: 0,
      remaining: limit
    };
  }

  if (!String(post.id || "").trim()) reasons.push("Missing post id");
  if (!String(post.text || "").trim()) reasons.push("Missing post text");
  if (length > limit) reasons.push(`Post exceeds ${limit} characters`);
  if (post.status !== "draft_only") warnings.push("Post is not marked draft_only");

  const claims = validateDistributionClaims(post.text, {
    evidenceRef: post.evidenceRef,
    evidencePath: post.evidencePath,
    validEvidenceRefs: options.validEvidenceRefs,
    allowUsageClaims: post.allowUsageClaims,
    partnershipApproved: post.partnershipApproved,
    requireExperimentalDisclosure: options.requireExperimentalDisclosure
  });
  reasons.push(...claims.reasons);
  warnings.push(...claims.warnings);

  return {
    valid: reasons.length === 0,
    reasons,
    warnings,
    claimFlags: claims.flags,
    length,
    remaining: limit - length
  };
}

export function summarizeLaunchPosts(posts = [], options = {}) {
  const validated = posts.map((post) => ({
    id: post.id,
    status: post.status || "unknown",
    assetPath: post.assetPath || null,
    ...validateXPost(post, options)
  }));

  return {
    valid: validated.every((post) => post.valid),
    count: validated.length,
    readyDrafts: validated.filter((post) => post.valid && post.status === "draft_only").length,
    posts: validated
  };
}
