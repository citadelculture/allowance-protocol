import { summarizeLaunchPosts } from "./socialLaunch.mjs";

export const X_POST_ACTION_PACK_STATUSES = ["ready_for_human_approval", "needs_post_fixes"];
export const LAUNCH_POST_ACTION_PACK_STATUSES = X_POST_ACTION_PACK_STATUSES;

const APPROVAL_FLAGS = [
  "humanWillExecute",
  "automationDisabled",
  "exactActionReviewed",
  "externalSideEffectAcknowledged",
  "noPrivateKeys",
  "noCustodyOrEscrow",
  "noTokenPitch",
  "noMarketManipulation",
  "legalEthicsReviewed"
];

export function buildXPostActionPack(posts = [], options = {}) {
  const launchPosts = Array.isArray(posts) ? posts : [];
  const launchPack = summarizeLaunchPosts(launchPosts, {
    ...(options.launchOptions || {}),
    validEvidenceRefs: options.validEvidenceRefs || options.launchOptions?.validEvidenceRefs,
    requireExperimentalDisclosure:
      options.requireExperimentalDisclosure ?? options.launchOptions?.requireExperimentalDisclosure
  });
  const requestedBy = String(options.requestedBy || "allow-operator").trim();
  const requestedAt = String(options.requestedAt || isoDate()).trim();
  const destination = normalizeHandle(options.destination || "@allow_protocol");
  const approvalIdPrefix = String(options.approvalIdPrefix || "x_post").trim();
  const packets = launchPosts.map((post) =>
    buildXPostExternalActionPacket(post, {
      requestedBy,
      requestedAt,
      destination,
      approvalIdPrefix
    })
  );
  const reasons = [
    ...launchPack.posts.flatMap((post) => post.reasons.map((reason) => `${post.id || "post"}: ${reason}`))
  ];
  const warnings = [
    ...launchPack.posts.flatMap((post) => post.warnings.map((warning) => `${post.id || "post"}: ${warning}`))
  ];

  if (!launchPosts.length) reasons.push("No X post drafts available for action approval");
  if (!isXHandle(destination)) reasons.push("destination must be the X account handle");
  for (const post of launchPack.posts) {
    if (post.status !== "draft_only") {
      reasons.push(`${post.id || "post"}: post.status must be draft_only before preparing X action approvals`);
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    valid: reasons.length === 0,
    status: reasons.length === 0 ? "ready_for_human_approval" : "needs_post_fixes",
    destination,
    launchPack,
    count: packets.length,
    readyDrafts: launchPack.readyDrafts,
    posts: launchPack.posts,
    packets,
    reasons: unique(reasons),
    warnings: unique(warnings),
    nextAction:
      reasons.length === 0
        ? "Review each x_post packet with the account owner, then run external-action-approval before posting."
        : "Fix launch post drafts, assets, disclosure evidence, or destination handle before preparing X approvals.",
    evidenceBoundary: {
      postsContent: false,
      sendsOutreach: false,
      signsWalletPayloads: false,
      startsPilotTraffic: false,
      movesFunds: false,
      storesSecrets: false,
      marksApproved: false,
      requiresHumanApproval: true,
      finalExternalActionApprovalRequired: true
    }
  };
}

export function buildXPostExternalActionPacket(post = {}, options = {}) {
  const approvalIdPrefix = String(options.approvalIdPrefix || "x_post").trim();
  const postId = String(post.id || "post").trim();
  const approvalId = `${approvalIdPrefix}_${slug(postId)}`;
  const destination = normalizeHandle(options.destination || "@allow_protocol");

  return {
    approvalId,
    actionType: "x_post",
    status: "draft",
    requestedBy: String(options.requestedBy || "allow-operator").trim(),
    requestedAt: String(options.requestedAt || isoDate()).trim(),
    approvedBy: "",
    approvedAt: "",
    action: {
      summary: `Human posts Allow launch draft ${postId || "post"} from the approved X account`,
      channel: "x",
      destination,
      executionMode: "human_only",
      exactText: post.text || "",
      automated: false
    },
    approvals: Object.fromEntries(APPROVAL_FLAGS.map((flag) => [flag, false])),
    payload: {
      post
    },
    notes: [
      "Generated from the launch post pack.",
      "This packet must remain draft until the X account owner reviews the exact text and sets every approval flag.",
      "Run npm run external-action-approval on the approved packet before any human posts.",
      "Do not add token sale, investment, return, partnership, or usage claims without approved evidence."
    ]
  };
}

export const buildLaunchPostActionPack = buildXPostActionPack;
export const buildLaunchPostExternalActionPacket = buildXPostExternalActionPacket;

function normalizeHandle(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.startsWith("@") ? text : `@${text}`;
}

function isXHandle(value) {
  return /^@[A-Za-z0-9_]{1,30}$/.test(String(value || ""));
}

function slug(value) {
  const text = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return text || "post";
}

function isoDate() {
  return new Date().toISOString().slice(0, 10);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
