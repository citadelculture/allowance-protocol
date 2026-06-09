import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { validateInterviewRecord } from "./interviewEvidence.mjs";
import { validateMerchantIntake } from "./merchantIntake.mjs";

export const INTERVIEW_WORKSPACE_AUDIT_STATUSES = [
  "verified_interview_workspace",
  "needs_workspace_fixes",
  "missing_manifest"
];

const INTERVIEW_APPROVAL_FLAGS = [
  "productFeedbackOnly",
  "noTokenPitch",
  "noSecretsRequested",
  "merchantUnderstandsPrototype"
];

const SENSITIVE_TEXT_PATTERNS = [
  { id: "private_key", pattern: /\b0x[0-9a-fA-F]{64}\b/, reason: "Interview workspace files must not include private keys or seed-like hex values" },
  { id: "seed_phrase", pattern: /\b(?:seed phrase|mnemonic|recovery phrase)\b/i, reason: "Interview workspace files must not include wallet seed or recovery phrase material" },
  { id: "bearer_token", pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b/i, reason: "Interview workspace files must not include bearer tokens" },
  { id: "api_key", pattern: /\b(api[_-]?key|secret|password)\s*[:=]\s*\S+/i, reason: "Interview workspace files must not include API keys, secrets, or passwords" }
];

export async function buildInterviewWorkspaceAuditReport(workspaceDir, options = {}) {
  const root = resolve(options.root || process.cwd());
  const workspaceRoot = resolve(root, workspaceDir || "work/interview-workspace");
  const manifestPath = resolve(workspaceRoot, "manifest.json");
  const generatedAt = options.generatedAt || new Date().toISOString();
  const reasons = [];
  const warnings = [];

  const manifestSource = await readText(manifestPath);
  if (!manifestSource.ok) {
    return baseReport({
      generatedAt,
      workspaceRoot,
      manifestPath,
      valid: false,
      status: "missing_manifest",
      reasons: [`Unable to read interview workspace manifest: ${manifestSource.error}`],
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
  if (manifest?.artifact !== "allow_interview_workspace") {
    reasons.push("manifest.artifact must be allow_interview_workspace");
  }
  if (manifest?.evidenceBoundary?.countsAsCompletedInterview !== false) {
    reasons.push("manifest evidence boundary must not count completed interviews");
  }
  if (manifest?.evidenceBoundary?.sendsOutreach !== false) {
    reasons.push("manifest evidence boundary must not send outreach");
  }
  if (manifest?.evidenceBoundary?.requestsSecrets !== false) {
    reasons.push("manifest evidence boundary must not request secrets");
  }

  const expectedEntries = [
    ...expectedEntriesFrom(manifest.interviewPackets, "interview_packet"),
    ...expectedEntriesFrom(manifest.interviewRecordTemplates, "interview_record_template"),
    ...expectedEntriesFrom(manifest.merchantIntakeTemplates, "merchant_intake_template")
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
  if (extraFiles.length > 0) warnings.push(`Interview workspace contains untracked files: ${extraFiles.join(", ")}`);

  return baseReport({
    generatedAt,
    workspaceRoot,
    manifestPath,
    valid: reasons.length === 0,
    status: reasons.length === 0 ? "verified_interview_workspace" : "needs_workspace_fixes",
    reasons: unique(reasons),
    warnings: unique(warnings),
    fileReports,
    extraFiles
  });
}

function baseReport({ generatedAt, workspaceRoot, manifestPath, valid, status, reasons, warnings, fileReports, extraFiles }) {
  const interviewPackets = fileReports.filter((file) => file.kind === "interview_packet");
  const interviewRecordTemplates = fileReports.filter((file) => file.kind === "interview_record_template");
  const merchantIntakeTemplates = fileReports.filter((file) => file.kind === "merchant_intake_template");
  return {
    generatedAt,
    valid,
    status,
    workspaceDir: workspaceRoot,
    manifestPath,
    counts: {
      checkedFiles: fileReports.length,
      interviewPackets: interviewPackets.length,
      interviewRecordTemplates: interviewRecordTemplates.length,
      merchantIntakeTemplates: merchantIntakeTemplates.length,
      missingFiles: fileReports.filter((file) => file.status === "missing").length,
      hashMismatches: fileReports.filter((file) => file.hashMatches === false).length,
      unsafeFiles: fileReports.filter((file) => file.safe === false).length,
      extraFiles: extraFiles.length
    },
    files: fileReports,
    extraFiles,
    reasons: unique(reasons),
    warnings: unique(warnings),
    nextAction: valid
      ? "Use the workspace for human interview prep only; completed interviews still require validated evidence"
      : "Regenerate or fix the interview workspace before using it for review",
    evidenceBoundary: {
      readsLocalWorkspaceFiles: true,
      writesFiles: false,
      sendsOutreach: false,
      schedulesInterviews: false,
      countsAsCompletedInterview: false,
      createsMerchantApproval: false,
      startsPilotTraffic: false,
      requestsSecrets: false,
      storesSecrets: false,
      tokenPitch: false,
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
  } else if (entry.kind === "interview_packet") {
    auditInterviewPacket(parsed.value, entry, reasons);
  } else if (entry.kind === "interview_record_template") {
    auditInterviewRecordTemplate(parsed.value, entry, reasons, warnings);
  } else if (entry.kind === "merchant_intake_template") {
    auditMerchantIntakeTemplate(parsed.value, entry, reasons, warnings);
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

function auditInterviewPacket(packet, entry, reasons) {
  if (packet.candidateId !== entry.candidateId) reasons.push("candidateId must match manifest entry");
  if (packet.prospectId !== entry.prospectId) reasons.push("prospectId must match manifest entry");
  if (packet.status !== "ready_for_human_review") reasons.push("interview packet status must remain ready_for_human_review");
  if (packet.valid !== true) reasons.push("interview packet valid must remain true");
  if (!Array.isArray(packet.questions) || packet.questions.length < 5) {
    reasons.push("interview packet must include at least five questions");
  }
  if (packet.evidenceBoundary?.outreachSentByThisPacket !== false) {
    reasons.push("interview packet must not mark outreach as sent");
  }
  if (packet.evidenceBoundary?.merchantApprovedByThisPacket !== false) {
    reasons.push("interview packet must not mark merchant approval");
  }
  if (packet.evidenceBoundary?.countsAsCompletedInterview !== false) {
    reasons.push("interview packet must not count as a completed interview");
  }
  if (!String(packet.nextAction || "").includes("Review interview packet")) {
    reasons.push("interview packet nextAction must remain review-only");
  }
}

function auditInterviewRecordTemplate(record, entry, reasons, warnings) {
  if (record.candidateId !== entry.candidateId) reasons.push("record template candidateId must match manifest entry");
  if (record.prospectId !== entry.prospectId) reasons.push("record template prospectId must match manifest entry");
  if (record.status !== "completed") reasons.push("record template status should remain completed for later copy/fill");
  if (String(record.completedAt || "").trim()) reasons.push("record template completedAt must remain empty");
  if (String(record.completedBy || "").trim()) reasons.push("record template completedBy must remain empty");
  if (String(record.summary || "").trim()) reasons.push("record template summary must remain empty");
  if (String(record.intakePath || "").trim()) reasons.push("record template intakePath must remain empty");
  if (record.pilotApproval?.merchantApprovedTestEndpoint !== false) {
    reasons.push("record template must not include merchant pilot approval");
  }
  if (String(record.pilotApproval?.testEndpoint || "").trim()) {
    reasons.push("record template pilotApproval.testEndpoint must remain empty");
  }

  for (const flag of INTERVIEW_APPROVAL_FLAGS) {
    if (record.approvals?.[flag] !== false) reasons.push(`record template approvals.${flag} must remain false`);
  }

  const answered = answerCount(record.answers);
  if (answered > 0) reasons.push("record template answers must remain blank");

  const validation = validateInterviewRecord(record);
  if (validation.valid) reasons.push("record template must not validate before a real completed interview");
  if (!validation.reasons.includes("Missing completedAt")) {
    warnings.push("record template no longer fails on missing completedAt");
  }
  if (!validation.reasons.includes("Completed interview must include at least five answered questions")) {
    warnings.push("record template no longer fails on missing answers");
  }
}

function auditMerchantIntakeTemplate(intake, entry, reasons, warnings) {
  if (intake.interviewRefs?.candidateId !== entry.candidateId) {
    reasons.push("merchant intake template candidateId must match manifest entry");
  }
  if (intake.interviewRefs?.prospectId !== entry.prospectId) {
    reasons.push("merchant intake template prospectId must match manifest entry");
  }
  if (String(intake.merchantId || "").trim()) reasons.push("merchant intake template merchantId must remain empty");
  if (intake.integration?.canTestThisWeek !== false) {
    reasons.push("merchant intake template integration.canTestThisWeek must remain false");
  }
  if (String(intake.integration?.testEndpoint || "").trim()) {
    reasons.push("merchant intake template integration.testEndpoint must remain empty");
  }
  if (Number(intake.risk?.maxSafeTestSpendUsd || 0) > 0) {
    reasons.push("merchant intake template maxSafeTestSpendUsd must remain unset");
  }

  const validation = validateMerchantIntake(intake);
  if (validation.valid) reasons.push("merchant intake template must not validate before real merchant answers");
  if (!validation.reasons.includes("Missing merchantId")) {
    warnings.push("merchant intake template no longer fails on missing merchantId");
  }
}

function fileReport(entry, overrides = {}) {
  return {
    kind: entry.kind || null,
    path: entry.path || null,
    actionId: entry.actionId || null,
    candidateId: entry.candidateId || null,
    candidateName: entry.candidateName || null,
    prospectId: entry.prospectId || null,
    prospectName: entry.prospectName || null,
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

function answerCount(answers) {
  if (Array.isArray(answers)) {
    return answers.filter((answer) => answerText(answer)).length;
  }
  if (answers && typeof answers === "object") {
    return Object.values(answers).filter((answer) => answerText(answer)).length;
  }
  return 0;
}

function answerText(answer) {
  if (typeof answer === "string") return answer.trim();
  if (answer && typeof answer === "object") return String(answer.answer || answer.response || "").trim();
  return "";
}

function sha256(content) {
  return `0x${createHash("sha256").update(content).digest("hex")}`;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
