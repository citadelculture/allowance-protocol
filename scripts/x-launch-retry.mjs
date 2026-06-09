// Retry the owner-authorized launch post from its approved packet, and on
// success pre-fill the execution evidence record.
//
//   node scripts/x-launch-retry.mjs            # validate packet, attempt post
//
// Exit codes: 0 posted (evidence prefilled), 2 still credit-blocked,
// 1 anything else (invalid packet, auth failure, unexpected API error).

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildExternalActionApprovalReport } from "../src/externalActionApproval.mjs";
import { postTweet, getMe, credsFromEnv } from "../src/xClient.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const packetPath = join(root, "ops/launch_post_packet.json");
const packet = JSON.parse(readFileSync(packetPath, "utf8"));

// Never post anything that does not pass the approval gate right now.
const approval = await buildExternalActionApprovalReport(packet);
if (!approval.valid) {
  console.error("Launch packet failed the approval gate:", JSON.stringify(approval.reasons, null, 2));
  process.exit(1);
}

const text = packet.action.exactText;
const creds = credsFromEnv();
const result = await postTweet({ text, creds });

if (!result.ok) {
  if (result.status === 402) {
    console.log("Still credit-blocked (HTTP 402 CreditsDepleted).");
    process.exit(2);
  }
  console.error(`Post failed (HTTP ${result.status}):`, JSON.stringify(result.body));
  process.exit(1);
}

const me = await getMe({ creds });
const handle = me.username ? `@${me.username}` : packet.action.destination;
const postUrl = me.username
  ? `https://x.com/${me.username}/status/${result.id}`
  : `https://x.com/i/web/status/${result.id}`;
const now = new Date().toISOString();

const evidence = {
  evidenceId: `x-post-execution-${result.id}`,
  generatedAt: now,
  executionStatus: "posted",
  approvalRef: `external-action:${packet.approvalId}`,
  approvalPacket: packet,
  posted: {
    postedAt: now,
    postedBy: "owner-authorized automation (session loop)",
    accountHandle: handle,
    postUrl,
    exactText: text,
    humanExecuted: false,
    accountOwnerApproved: true,
    automationUsed: true
  },
  proof: {
    type: "post_permalink",
    ref: postUrl,
    capturedAt: now,
    redacted: true
  },
  notes: [
    "Posted under the 2026-06-09 owner authorization amendment (owner_authorized_automated).",
    "Validate with: npm run x-post-execution-evidence -- work/x-post-execution.filled.json"
  ]
};

mkdirSync(join(root, "work"), { recursive: true });
const evidencePath = join(root, "work/x-post-execution.filled.json");
writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));

console.log(`Posted: ${postUrl}`);
console.log(`Evidence prefilled: ${evidencePath}`);
console.log("Next: npm run x-post-execution-evidence -- work/x-post-execution.filled.json");
