import { readFile, stat } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";

export const SITE_PUBLICATION_CHECK_STATUSES = [
  "ready_for_publication_approval",
  "needs_site_fixes",
  "unsafe_public_claims"
];

const REQUIRED_FILES = ["index.html", "styles.css", "app.js"];
const REQUIRED_DISCLOSURES = [
  {
    id: "experimental",
    pattern: /\bexperimental\b/i,
    message: "Site must disclose that the product is experimental"
  },
  {
    id: "no_token",
    pattern: /\bno\s+token\b|\btoken\s+plans?.{0,80}legal\s+review\b/i,
    message: "Site must disclose no token at launch or legal-review gating"
  },
  {
    id: "no_custody",
    pattern: /\bno[-\s]?custody\b|\bdoes\s+not\s+custody\b|\bnon[-\s]?custodial\b/i,
    message: "Site must disclose the no-custody boundary"
  },
  {
    id: "demo_metrics",
    pattern: /\bdemo\b.{0,80}\bmetrics\b|\bmetrics\b.{0,80}\bdemo\b|\bevidence[-\s]?backed\b/i,
    message: "Site must label demo metrics or evidence-backed claims"
  },
  {
    id: "wallet_security",
    pattern: /\bwallet\s+security\b|\bown\s+wallet\s+security\b|\buser.*responsible.*wallet\b/i,
    message: "Site must disclose user responsibility for wallet security"
  }
];

const BANNED_CLAIMS = [
  {
    id: "token_promotion",
    pattern: /\b(presale|airdrop|whitelist|claim\s+token|buy\s+token|token\s+launch)\b/i,
    message: "Site must not promote a token, presale, airdrop, or whitelist"
  },
  {
    id: "returns",
    pattern: /\b(guaranteed\s+returns?|100x|moon|investment\s+opportunity|market\s*cap)\b/i,
    message: "Site must not make return, hype, or market-cap claims"
  },
  {
    id: "partnership",
    pattern: /\b(partnered\s+with|official\s+partner|backed\s+by\s+(?!evidence\b|validated\b|execution\b|receipts?\b))/i,
    message: "Site must not imply partnerships without evidence"
  },
  {
    id: "unaudited_usage",
    pattern: /\b(live\s+mainnet\s+receipts?|production\s+volume|real\s+users?)\b/i,
    message: "Site must not claim live usage before validated evidence"
  }
];

export async function buildSitePublicationCheck(root, options = {}) {
  const generatedAt = options.generatedAt || new Date().toISOString();
  const reasons = [];
  const warnings = [];
  const files = {};

  for (const path of REQUIRED_FILES) {
    files[path] = await readRequiredFile(root, path);
    if (!files[path].exists) reasons.push(`Missing ${path}`);
  }

  const html = files["index.html"].source || "";
  const css = files["styles.css"].source || "";
  const js = files["app.js"].source || "";
  const combinedText = stripHtml(`${html}\n${css}\n${js}`);

  const title = html.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim() || "";
  if (!title) reasons.push("Missing HTML title");
  if (!/Allow Protocol/i.test(title)) reasons.push("HTML title should include Allow Protocol");
  if (!/<meta\s+name=["']viewport["']/i.test(html)) reasons.push("Missing responsive viewport meta tag");
  if (!/<script[^>]+type=["']module["'][^>]+src=["']\.\/app\.js["']/i.test(html)) {
    reasons.push("index.html must load ./app.js as a module");
  }
  if (!/<link[^>]+rel=["']stylesheet["'][^>]+href=["']\.\/styles\.css["']/i.test(html)) {
    reasons.push("index.html must load ./styles.css");
  }

  for (const disclosure of REQUIRED_DISCLOSURES) {
    if (!disclosure.pattern.test(combinedText)) reasons.push(disclosure.message);
  }

  const bannedMatches = BANNED_CLAIMS
    .filter((claim) => claim.pattern.test(combinedText))
    .map((claim) => claim.message);
  reasons.push(...bannedMatches);

  const externalRefs = externalReferences(html);
  if (externalRefs.length > 0) {
    warnings.push(...externalRefs.map((ref) => `External reference should be reviewed before publication: ${ref}`));
  }

  const localRefs = localReferences(html);
  for (const ref of localRefs) {
    const exists = await safeFileExists(root, ref);
    if (!exists) reasons.push(`Missing local site reference ${ref}`);
  }

  const publicClaimFlags = bannedMatches.length;
  const valid = reasons.length === 0;

  return {
    generatedAt,
    valid,
    status: valid ? "ready_for_publication_approval" : publicClaimFlags > 0 ? "unsafe_public_claims" : "needs_site_fixes",
    title: title || null,
    files: Object.fromEntries(Object.entries(files).map(([path, file]) => [path, {
      exists: file.exists,
      bytes: file.bytes
    }])),
    disclosures: REQUIRED_DISCLOSURES.map((item) => ({
      id: item.id,
      present: item.pattern.test(combinedText)
    })),
    externalRefs,
    localRefs,
    reasons: unique(reasons),
    warnings: unique(warnings),
    nextAction: valid
      ? "Run action-time approval for website publication before the owner publishes the site."
      : "Fix the static site copy, disclosures, and references before any publication approval.",
    evidenceBoundary: boundary()
  };
}

async function readRequiredFile(root, path) {
  try {
    const absolute = join(root, path);
    const [source, metadata] = await Promise.all([
      readFile(absolute, "utf8"),
      stat(absolute)
    ]);
    return {
      exists: true,
      bytes: metadata.size,
      source
    };
  } catch {
    return {
      exists: false,
      bytes: 0,
      source: ""
    };
  }
}

async function safeFileExists(root, ref) {
  const clean = normalize(ref).replace(/^(\.\.[/\\])+/, "");
  const absolute = join(root, clean);
  if (!absolute.startsWith(root)) return false;
  try {
    const metadata = await stat(absolute);
    return metadata.isFile();
  } catch {
    return false;
  }
}

function localReferences(html) {
  return unique([...html.matchAll(/\b(?:src|href)=["']([^"']+)["']/gi)]
    .map((match) => match[1])
    .filter((ref) => ref.startsWith("./") || ref.startsWith("/"))
    .map((ref) => ref.replace(/^\.\//, "").replace(/^\//, ""))
    .filter((ref) => ref && !ref.startsWith("#")));
}

function externalReferences(html) {
  return unique([...html.matchAll(/\b(?:src|href)=["'](https?:\/\/[^"']+)["']/gi)].map((match) => match[1]));
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function boundary() {
  return {
    readsStaticSiteFiles: true,
    writesFiles: false,
    publishesWebsite: false,
    postsContent: false,
    sendsOutreach: false,
    signsWalletPayloads: false,
    deploysContracts: false,
    startsPilotTraffic: false,
    movesFunds: false,
    storesSecrets: false,
    updatesCanonicalState: false,
    enablesToken: false,
    requiresHumanApproval: true,
    actionTimeApprovalRequired: true
  };
}
