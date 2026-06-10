// Stage the public website into dist/site/ for deployment to any static
// host or web server. No build step — the dashboard runs browser-native ESM.
//
//   npm run build-site
//   rsync -av dist/site/ user@yourserver:/var/www/allowprotocol/

import { cpSync, mkdirSync, rmSync } from "node:fs";

rmSync("dist/site", { recursive: true, force: true });
mkdirSync("dist/site/src", { recursive: true });
for (const f of ["index.html", "console.html", "app.js", "styles.css"]) {
  cpSync(f, `dist/site/${f}`);
}
cpSync("src", "dist/site/src", { recursive: true, filter: (src) => !src.includes(".test.") });

console.log("Static site staged in dist/site/");
console.log("Deploy: rsync -av dist/site/ user@server:/var/www/allowprotocol/");
console.log("Optional live API: run `node server.mjs` on the server and proxy /api/* to it.");
