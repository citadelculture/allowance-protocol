import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildSitePublicationCheck } from "../src/sitePublicationCheck.mjs";

const root = await mkdtemp(join(tmpdir(), "allow-site-check-"));

await writeFile(join(root, "styles.css"), "body { color: #111; }\n");
await writeFile(join(root, "app.js"), "console.log('demo');\n");
await writeFile(
  join(root, "index.html"),
  `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Allow Protocol</title>
  <link rel="stylesheet" href="./styles.css">
</head>
<body>
  <main>
    <h1>Allow Protocol</h1>
    <p>Experimental no-custody payment policy console.</p>
    <p>The metrics are demo metrics until backed by evidence-backed execution records.</p>
    <p>There is no token at launch, and any future token plan is subject to legal review.</p>
    <p>Users remain responsible for their own wallet security.</p>
  </main>
  <script type="module" src="./app.js"></script>
</body>
</html>`
);

const report = await buildSitePublicationCheck(root, {
  generatedAt: "2026-06-09T12:40:00.000Z"
});

assert.equal(report.valid, true);
assert.equal(report.status, "ready_for_publication_approval");
assert.equal(report.title, "Allow Protocol");
assert.deepEqual(report.disclosures.map((item) => item.present), [true, true, true, true, true]);
assert.equal(report.evidenceBoundary.publishesWebsite, false);
assert.equal(report.evidenceBoundary.requiresHumanApproval, true);

await writeFile(
  join(root, "index.html"),
  `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Allow Protocol</title>
  <link rel="stylesheet" href="./styles.css">
</head>
<body>
  <main>
    <h1>Allow Protocol</h1>
    <p>Official partner token presale with 100x market cap potential.</p>
  </main>
  <script type="module" src="./app.js"></script>
</body>
</html>`
);

const unsafe = await buildSitePublicationCheck(root);
assert.equal(unsafe.valid, false);
assert.equal(unsafe.status, "unsafe_public_claims");
assert.ok(unsafe.reasons.includes("Site must not promote a token, presale, airdrop, or whitelist"));
assert.ok(unsafe.reasons.includes("Site must not make return, hype, or market-cap claims"));
assert.ok(unsafe.reasons.includes("Site must not imply partnerships without evidence"));

await writeFile(
  join(root, "index.html"),
  `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Allow Protocol</title>
  <link rel="stylesheet" href="./missing.css">
</head>
<body>
  <main>
    <p>Experimental no-custody demo metrics. No token at launch. Users remain responsible for wallet security.</p>
  </main>
  <script type="module" src="./app.js"></script>
</body>
</html>`
);

const missingRef = await buildSitePublicationCheck(root);
assert.equal(missingRef.valid, false);
assert.equal(missingRef.status, "needs_site_fixes");
assert.ok(missingRef.reasons.includes("index.html must load ./styles.css"));
assert.ok(missingRef.reasons.includes("Missing local site reference missing.css"));

console.log("sitePublicationCheck tests passed");
