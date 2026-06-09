import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { buildOutreachExecutionEvidenceReport } from "./outreachExecutionEvidence.mjs";
import { buildXPostExecutionEvidenceReport } from "./xPostExecutionEvidence.mjs";

export const EXTERNAL_ACTION_WORKSPACE_AUDIT_STATUSES = [
  "verified_review_workspace",
  "needs_workspace_fixes",
  "missing_manifest"
];

const REQUIRED_APPROVAL_FLAGS = [
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

const SENSITIVE_TEXT_PATTERNS = [
  { id: "private_key", pattern: /\b0x[0-9a-fA-F]{64}\b/, reason: "Workspace files must not include private keys or seed-like hex values" },
  { id: "seed_phrase", pattern: /\b(?:seed phrase|mnemonic|recovery phrase)\b/i, reason: "Workspace files must not include wallet seed or recovery phrase material" },
  { id: "bearer_token", pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b/i, reason: "Workspace files must not include bearer tokens" },
  { id: "api_key", pattern: /\b(api[_-]?key|secret|password)\s*[:=]\s*\S+/i, reason: "Workspace files must not include API keys, secrets, or passwords" }
];

export async function buildExternalActionWorkspaceAuditReport(workspaceDir, options = {}) {
  const root = resolve(options.root || process.cwd());
  const workspaceRoot = resolve(root, workspaceDir || "work/external-action-workspace");
  const manifestPath = resolve(workspaceRoot, "manifest.json");
  const reasons = [];
  const warnings = [];
  const generatedAt = options.generatedAt || new Date().toISOString();

  const manifestSource = await readText(manifestPath);
  if (!manifestSource.ok) {
    return baseReport({
      generatedAt,
      workspaceRoot,
      manifestPath,
      valid: false,
      status: "missing_manifest",
      reasons: [`Unable to read workspace manifest: ${manifestSource.error}`],
      warnings,
      fileReports: [],
      extraFiles: []
    });
  }

  const manifestParse = parseJson(manifestSource.value, "manifest.json");
  if (!manifestParse.ok) {
    return baseReport({
      generatedAt,
      workspaceRoot,
      manifestPath,
      valid: false,
      status: "needs_workspace_fixes",
      reasons: [manifestParse.reason],
      warnings,
      fileReports: [],
      extraFiles: []
    });
  }

  const manifest = manifestParse.value;
  if (manifest?.artifact !== "allow_external_action_workspace") {
    reasons.push("manifest.artifact must be allow_external_action_workspace");
  }
  if (manifest?.evidenceBoundary?.approvesExternalAction !== false) {
    reasons.push("manifest evidence boundary must not approve external actions");
  }

  const expectedEntries = [
    ...expectedEntriesFrom(manifest.draftPackets, "draft_packet"),
    ...expectedEntriesFrom(manifest.executionEvidenceTemplates, "execution_evidence_template")
  ];
  const fileReports = [];
  for (const entry of expectedEntries) {
    fileReports.push(await auditExpectedFile(workspaceRoot, entry));
  }

  reasons.push(...fileReports.flatMap((file) => file.reasons.map((reason) => `${file.path}: ${reason}`)));
  warnings.push(...fileReports.flatMap((file) => file.warnings.map((warning) => `${file.path}: ${warning}`)));

  const expectedPaths = new Set(["manifest.json", "REVIEW_CHECKLIST.md", ...expectedEntries.map((entry) => entry.path)]);
  const actualFiles = await listWorkspaceFiles(workspaceRoot);
  const extraFiles = actualFiles.filter((path) => !expectedPaths.has(path));
  if (extraFiles.length > 0) warnings.push(`Workspace contains untracked files: ${extraFiles.join(", ")}`);

  return baseReport({
    generatedAt,
    workspaceRoot,
    manifestPath,
    valid: reasons.length === 0,
    status: reasons.length === 0 ? "verified_review_workspace" : "needs_workspace_fixes",
    reasons: unique(reasons),
    warnings: unique(warnings),
    fileReports,
    extraFiles
  });
}

function baseReport({ generatedAt, workspaceRoot, manifestPath, valid, status, reasons, warnings, fileReports, extraFiles }) {
  const draftPackets = fileReports.filter((file) => file.kind === "draft_packet");
  const evidenceTemplates = fileReports.filter((file) => file.kind === "execution_evidence_template");
  const missingFiles = fileReports.filter((file) => file.status === "missing").length;
  const hashMismatches = fileReports.filter((file) => file.hashMatches === false).length;
  return {
    generatedAt,
    valid,
    status,
    workspaceDir: workspaceRoot,
    manifestPath,
    counts: {
      checkedFiles: fileReports.length,
      draftPackets: draftPackets.length,
      evidenceTemplates: evidenceTemplates.length,
      missingFiles,
      hashMismatches,
      unsafeFiles: fileReports.filter((file) => file.safe === false).length,
      extraFiles: extraFiles.length
    },
    files: fileReports,
    extraFiles,
    reasons: unique(reasons),
    warnings: unique(warnings),
    nextAction: valid
      ? "Review draft packets, then approve and execute only with explicit human action"
      : "Regenerate or fix the external action workspace before any approval review",
    evidenceBoundary: {
      readsLocalWorkspaceFiles: true,
      writesFiles: false,
      postsContent: false,
      sendsOutreach: false,
      signsWalletPayloads: false,
      deploysContracts: false,
      startsPilotTraffic: false,
      promotesMerchant: false,
      movesFunds: false,
      storesSecrets: false,
      approvesExternalAction: false,
      requiresHumanApproval: true
    }
  };
}

async function auditExpectedFile(workspaceRoot, entry) {
  const reasons = [];
  const warnings = [];
  const safePath = safeResolve(workspaceRoot, entry.path);
  if (!safePath.ok) {
    return fileReport(entry, {
      status: "unsafe_path",
      safe: false,
      reasons: [safePath.reason],
      warnings
    });
  }

  const source = await readText(safePath.path);
  if (!source.ok) {
    return fileReport(entry, {
      status: "missing",
      safe: false,
      reasons: [`Unable to read file: ${source.error}`],
      warnings
    });
  }

  const actualSha256 = sha256(source.value);
  const actualBytes = Buffer.byteLength(source.value, "utf8");
  if (entry.sha256 && actualSha256 !== entry.sha256) {
    reasons.push(`SHA-256 mismatch: expected ${entry.sha256}, got ${actualSha256}`);
  }
  if (Number.isInteger(entry.bytes) && actualBytes !== entry.bytes) {
    reasons.push(`Byte size mismatch: expected ${entry.bytes}, got ${actualBytes}`);
  }

  const parsed = parseJson(source.value, entry.path);
  if (!parsed.ok) {
    reasons.push(parsed.reason);
  } else if (entry.kind === "draft_packet") {
    auditDraftPacket(parsed.value, entry, reasons, warnings);
  } else if (entry.kind === "execution_evidence_template") {
    await auditExecutionEvidenceTemplate(parsed.value, entry, reasons, warnings);
  } else {
    reasons.push(`Unsupported manifest file kind ${entry.kind}`);
  }

  const sensitiveFlags = sensitiveFlagsFor(source.value);
  reasons.push(...sensitiveFlags.map((flag) => flag.reason));

  return fileReport(entry, {
    status: reasons.length === 0 ? "verified" : "needs_fixes",
    safe: reasons.length === 0,
    actualSha256,
    actualBytes,
    hashMatches: actualSha256 === entry.sha256,
    reasons: unique(reasons),
    warnings: unique(warnings)
  });
}

function auditDraftPacket(packet, entry, reasons) {
  if (packet.approvalId !== entry.approvalId) reasons.push("approvalId must match manifest entry");
  if (packet.actionType !== entry.actionType) reasons.push("actionType must match manifest entry");
  if (packet.status !== "draft") reasons.push("draft packet status must remain draft");
  if (String(packet.approvedBy || "").trim()) reasons.push("draft packet approvedBy must be empty");
  if (String(packet.approvedAt || "").trim()) reasons.push("draft packet approvedAt must be empty");
  if (packet.action?.executionMode !== "human_only") reasons.push("draft packet executionMode must be human_only");
  if (packet.action?.automated !== false) reasons.push("draft packet action.automated must be false");

  for (const flag of REQUIRED_APPROVAL_FLAGS) {
    if (packet.approvals?.[flag] !== false) reasons.push(`draft packet approvals.${flag} must remain false`);
  }
}

async function auditExecutionEvidenceTemplate(evidence, entry, reasons, warnings) {
  if (evidence.approvalRef !== `external-action:${entry.approvalId}`) {
    reasons.push("evidence approvalRef must reference the manifest approvalId");
  }
  if (evidence.approvalPacket?.approvalId !== entry.approvalId) {
    reasons.push("evidence approvalPacket.approvalId must match manifest entry");
  }
  if (evidence.approvalPacket?.status !== "draft") {
    reasons.push("evidence template must embed the unapproved draft packet");
  }
  if (evidence.approvalPacket?.actionType !== entry.actionType) {
    reasons.push("evidence approvalPacket.actionType must match manifest entry");
  }

  if (entry.actionType === "x_post") {
    if (String(evidence.generatedAt || "").trim()) reasons.push("x_post evidence template generatedAt must remain empty");
    if (String(evidence.posted?.postedAt || "").trim()) reasons.push("x_post evidence template posted.postedAt must remain empty");
    if (String(evidence.posted?.postUrl || "").trim()) reasons.push("x_post evidence template posted.postUrl must remain empty");
    if (evidence.posted?.humanExecuted !== false) reasons.push("x_post evidence template posted.humanExecuted must remain false");
    if (evidence.posted?.accountOwnerApproved !== false) reasons.push("x_post evidence template posted.accountOwnerApproved must remain false");
    if (evidence.proof?.redacted !== false) reasons.push("x_post evidence template proof.redacted must remain false");
    const validation = await buildXPostExecutionEvidenceReport(evidence);
    if (validation.valid) reasons.push("x_post evidence template must not validate before human execution proof");
    if (!validation.reasons.includes("approvalPacket: External action must be approved before execution")) {
      warnings.push("x_post evidence template no longer fails on missing final approval");
    }
  } else if (entry.actionType === "merchant_outreach") {
    if (String(evidence.generatedAt || "").trim()) reasons.push("outreach evidence template generatedAt must remain empty");
    if (String(evidence.sent?.sentAt || "").trim()) reasons.push("outreach evidence template sent.sentAt must remain empty");
    if (evidence.sent?.humanExecuted !== false) reasons.push("outreach evidence template sent.humanExecuted must remain false");
    if (evidence.sent?.accountOwnerApproved !== false) reasons.push("outreach evidence template sent.accountOwnerApproved must remain false");
    if (evidence.proof?.redacted !== false) reasons.push("outreach evidence template proof.redacted must remain false");
    const validation = await buildOutreachExecutionEvidenceReport(evidence);
    if (validation.valid) reasons.push("outreach evidence template must not validate before human execution proof");
    if (!validation.reasons.includes("approvalPacket: External action must be approved before execution")) {
      warnings.push("outreach evidence template no longer fails on missing final approval");
    }
  }
}

function fileReport(entry, overrides = {}) {
  return {
    kind: entry.kind || null,
    path: entry.path || null,
    approvalId: entry.approvalId || null,
    actionType: entry.actionType || null,
    expectedSha256: entry.sha256 || null,
    expectedBytes: Number.isInteger(entry.bytes) ? entry.bytes : null,
    actualSha256: overrides.actualSha256 || null,
    actualBytes: Number.isInteger(overrides.actualBytes) ? overrides.actualBytes : null,
    hashMatches: overrides.hashMatches ?? null,
    status: overrides.status || "unchecked",
    safe: overrides.safe === true,
    reasons: overrides.reasons || [],
    warnings: overrides.warnings || []
  };
}

function expectedEntriesFrom(entries, kind) {
  return (Array.isArray(entries) ? entries : []).map((entry) => ({ ...entry, kind: entry.kind || kind }));
}

async function listWorkspaceFiles(root) {
  try {
    const out = [];
    await walk(root, "", out);
    return out.sort();
  } catch {
    return [];
  }
}

async function walk(root, relative, out) {
  const dir = relative ? resolve(root, relative) : root;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
    const childPath = resolve(root, childRelative);
    if (entry.isDirectory()) {
      await walk(root, childRelative, out);
    } else if (entry.isFile()) {
      const info = await stat(childPath);
      if (info.size >= 0) out.push(childRelative);
    }
  }
}

function safeResolve(root, relativePath) {
  const path = resolve(root, String(relativePath || ""));
  if (path !== root && !path.startsWith(`${root}${sep}`)) {
    return { ok: false, reason: `Refusing path outside workspace: ${relativePath}` };
  }
  return { ok: true, path };
}

async function readText(path) {
  try {
    return { ok: true, value: await readFile(path, "utf8") };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function parseJson(source, label) {
  try {
    return { ok: true, value: JSON.parse(source) };
  } catch (error) {
    return { ok: false, reason: `${label} must be valid JSON: ${error.message}` };
  }
}

function sensitiveFlagsFor(text) {
  return SENSITIVE_TEXT_PATTERNS.filter((rule) => rule.pattern.test(String(text || ""))).map((rule) => ({
    id: rule.id,
    reason: rule.reason
  }));
}

function sha256(content) {
  return `0x${createHash("sha256").update(content).digest("hex")}`;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
