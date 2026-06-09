// Post to X via OAuth 1.0a user context. Credentials come from env ONLY — never
// commit them. Requires the app to be set to Read and Write.
//
//   X_API_KEY=... X_API_SECRET=... X_ACCESS_TOKEN=... X_ACCESS_TOKEN_SECRET=... \
//     node scripts/x-post.mjs "your tweet text"
//
//   # preview the exact request without sending:
//   node scripts/x-post.mjs --dry-run "your tweet text"

import { postTweet, oauth1Header, credsFromEnv } from "../src/xClient.mjs";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const text = args.filter((a) => a !== "--dry-run").join(" ").trim();

if (!text) {
  console.error('Usage: node scripts/x-post.mjs [--dry-run] "tweet text"');
  process.exit(1);
}
if (text.length > 280) {
  console.error(`Tweet is ${text.length} chars (max 280).`);
  process.exit(1);
}

const creds = credsFromEnv();
const missing = Object.entries(creds).filter(([, v]) => !v).map(([k]) => k);
if (missing.length > 0) {
  console.error(`Missing env credentials: ${missing.join(", ")}`);
  console.error("Need X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET (OAuth 1.0a).");
  process.exit(1);
}

if (dryRun) {
  const { header } = oauth1Header({ method: "POST", url: "https://api.twitter.com/2/tweets", creds });
  console.log("DRY RUN — would POST https://api.twitter.com/2/tweets");
  console.log(`  body: ${JSON.stringify({ text })}`);
  console.log(`  authorization: ${header.slice(0, 48)}... (signed, ${header.length} chars)`);
  console.log(`  chars: ${text.length}/280`);
  process.exit(0);
}

const result = await postTweet({ text, creds });
if (result.ok && result.id) {
  console.log(`Posted: https://x.com/i/web/status/${result.id}`);
} else {
  console.error(`Post failed (HTTP ${result.status}):`, JSON.stringify(result.body, null, 2));
  process.exit(1);
}
