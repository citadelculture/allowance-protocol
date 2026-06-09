#!/usr/bin/env node

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSitePublicationCheck } from "../src/sitePublicationCheck.mjs";

const defaultRoot = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const root = resolve(process.argv[2] || process.env.ALLOW_SITE_ROOT || defaultRoot);

try {
  const report = await buildSitePublicationCheck(root);
  console.log(JSON.stringify({
    root,
    ...report
  }, null, 2));
  process.exitCode = report.valid ? 0 : 1;
} catch (error) {
  console.error(`Site publication check failed: ${error.message}`);
  process.exit(1);
}
