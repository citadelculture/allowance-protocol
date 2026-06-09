import { createHash } from "node:crypto";
import { buildInterviewCampaignPlan } from "./interviewCampaign.mjs";

export const INTERVIEW_WORKSPACE_STATUSES = [
  "ready_for_review",
  "complete",
  "needs_script",
  "no_ready_candidates"
];

export function buildInterviewWorkspaceReport(input = {}, options = {}) {
  const generatedAt = options.generatedAt || new Date().toISOString();
  const outputDir = options.outputDir || "work/interview-workspace";
  const campaign = input.campaign || buildInterviewCampaignPlan(input, options);
  const actions = Array.isArray(campaign.plannedActions) ? campaign.plannedActions : [];
  const reasons = [...(campaign.reasons || [])];
  const warnings = [...(campaign.warnings || [])];

  const packetFiles = actions.map((action, index) => fileFromJson({
    kind: "interview_packet",
    path: `packets/${prefix(index)}-${slug(action.candidateId)}.interview-packet.json`,
    action,
    content: action.packet || {}
  }));
  const recordTemplateFiles = actions.map((action, index) => fileFromJson({
    kind: "interview_record_template",
    path: `records/${prefix(index)}-${slug(action.candidateId)}.completed-interview.template.json`,
    action,
    content: interviewRecordTemplate(action, options)
  }));
  const intakeTemplateFiles = actions.map((action, index) => fileFromJson({
    kind: "merchant_intake_template",
    path: `intakes/${prefix(index)}-${slug(action.candidateId)}.merchant-intake.template.json`,
    action,
    content: merchantIntakeTemplate(action)
  }));

  const manifest = buildManifest({
    generatedAt,
    outputDir,
    campaign,
    packetFiles,
    recordTemplateFiles,
    intakeTemplateFiles
  });
  const checklist = buildChecklist({
    generatedAt,
    outputDir,
    campaign,
    packetFiles,
    recordTemplateFiles,
    intakeTemplateFiles
  });
  const manifestContent = stringifyJson(manifest);
  const checklistContent = `${checklist}\n`;
  const files = [
    {
      kind: "manifest",
      path: "manifest.json",
      sha256: sha256(manifestContent),
      bytes: Buffer.byteLength(manifestContent, "utf8"),
      content: manifestContent
    },
    {
      kind: "checklist",
      path: "REVIEW_CHECKLIST.md",
      sha256: sha256(checklistContent),
      bytes: Buffer.byteLength(checklistContent, "utf8"),
      content: checklistContent
    },
    ...packetFiles,
    ...recordTemplateFiles,
    ...intakeTemplateFiles
  ];
  const status = workspaceStatus(campaign, actions);
  const valid = status === "complete" || status === "ready_for_review";

  return {
    generatedAt,
    valid,
    status,
    outputDir,
    campaign: {
      status: campaign.status,
      valid: campaign.valid,
      campaignTarget: campaign.campaignTarget,
      nextAction: campaign.nextAction
    },
    counts: {
      files: files.length,
      plannedActions: actions.length,
      interviewPackets: packetFiles.length,
      interviewRecordTemplates: recordTemplateFiles.length,
      merchantIntakeTemplates: intakeTemplateFiles.length,
      blockedCandidates: campaign.blockedCandidates?.length || 0,
      shortfall: campaign.campaignTarget?.shortfall || 0,
      shortfallAfterPlan: campaign.campaignTarget?.shortfallAfterPlan || 0
    },
    manifestPath: `${outputDir}/manifest.json`,
    checklistPath: `${outputDir}/REVIEW_CHECKLIST.md`,
    files,
    manifest,
    checklist,
    reasons: unique(reasons),
    warnings: unique(warnings),
    nextAction: nextActionForWorkspace(status, actions, campaign),
    evidenceBoundary: {
      writesLocalInterviewPrepFiles: true,
      writesLocalEvidenceTemplates: true,
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

export function publicInterviewWorkspaceReport(report = {}) {
  return {
    ...report,
    files: (report.files || []).map(({ content, ...file }) => file),
    manifest: report.manifest,
    checklist: undefined
  };
}

function buildManifest({ generatedAt, outputDir, campaign, packetFiles, recordTemplateFiles, intakeTemplateFiles }) {
  return {
    artifact: "allow_interview_workspace",
    generatedAt,
    outputDir,
    campaign: {
      status: campaign.status,
      valid: campaign.valid,
      target: campaign.campaignTarget,
      nextAction: campaign.nextAction,
      reasons: campaign.reasons || [],
      warnings: campaign.warnings || []
    },
    interviewPackets: packetFiles.map(withoutContent),
    interviewRecordTemplates: recordTemplateFiles.map(withoutContent),
    merchantIntakeTemplates: intakeTemplateFiles.map(withoutContent),
    blockedCandidates: campaign.blockedCandidates || [],
    instructions: [
      "Use these files as local interview preparation only.",
      "Do not send outreach, schedule calls, or claim interviews from this workspace.",
      "After a human-run interview, copy the record template into ops/interviews.json and fill all required evidence.",
      "Create a completed merchant intake in ops/intakes/ and set the interview intakePath to that file.",
      "Run npm run interview-report before any interview counts toward launch readiness."
    ],
    evidenceBoundary: {
      writesLocalInterviewPrepFiles: true,
      sendsOutreach: false,
      schedulesInterviews: false,
      countsAsCompletedInterview: false,
      requestsSecrets: false,
      tokenPitch: false
    }
  };
}

function buildChecklist({ generatedAt, outputDir, campaign, packetFiles, recordTemplateFiles, intakeTemplateFiles }) {
  const lines = [
    "# Allow Merchant Interview Workspace",
    "",
    `Generated: ${generatedAt}`,
    `Workspace: ${outputDir}`,
    `Campaign status: ${campaign.status}`,
    `Shortfall: ${campaign.campaignTarget?.shortfall || 0}`,
    `Shortfall after this batch: ${campaign.campaignTarget?.shortfallAfterPlan || 0}`,
    "",
    "## Safety Boundary",
    "",
    "- This workspace is local preparation only.",
    "- It does not send outreach, schedule interviews, request secrets, start pilot traffic, create merchant approval, or count interviews.",
    "- Keep the ask product-feedback-only and explicitly not a token pitch.",
    "- Completed interviews count only after `npm run interview-report` passes.",
    "",
    "## Interview Prep Files",
    ""
  ];

  if (packetFiles.length === 0) {
    lines.push("- No interview candidates are ready for review.");
  } else {
    for (const [index, packet] of packetFiles.entries()) {
      const record = recordTemplateFiles[index];
      const intake = intakeTemplateFiles[index];
      lines.push(`- ${packet.candidateName}: \`${packet.path}\``);
      lines.push(`  Record template: \`${record.path}\``);
      lines.push(`  Intake template: \`${intake.path}\``);
    }
  }

  if (campaign.blockedCandidates?.length > 0) {
    lines.push("", "## Blocked Candidates", "");
    for (const candidate of campaign.blockedCandidates) {
      lines.push(`- ${candidate.candidateId}: ${(candidate.blockers || []).join("; ") || "blocked"}`);
    }
  }

  lines.push(
    "",
    "## Completion Steps",
    "",
    "1. Get explicit approval before any outbound contact.",
    "2. Run the interview as product feedback, not as a token or investment conversation.",
    "3. Fill at least five question answers or explicit skips.",
    "4. Create and validate a merchant intake.",
    "5. Add the completed interview to `ops/interviews.json`.",
    "6. Run `npm run interview-report`."
  );

  return lines.join("\n");
}

function interviewRecordTemplate(action, options) {
  const packet = action.packet || {};
  const questions = Array.isArray(packet.questions) ? packet.questions : [];
  return {
    id: `interview-${slug(action.candidateId)}`,
    prospectId: action.prospectId || packet.prospectId || "",
    candidateId: action.candidateId || packet.candidateId || "",
    status: "completed",
    completedAt: "",
    completedBy: "",
    channel: packet.channel || action.channel || "",
    destination: packet.destination || action.destination || "",
    summary: "",
    intakePath: "",
    suggestedIntakePath: `ops/intakes/${slug(action.candidateId || action.prospectId)}.json`,
    answers: questions.map((question, index) => ({
      id: `q${index + 1}`,
      question,
      answer: "",
      skipped: false
    })),
    approvals: {
      productFeedbackOnly: false,
      noTokenPitch: false,
      noSecretsRequested: false,
      merchantUnderstandsPrototype: false
    },
    pilotApproval: {
      merchantApprovedTestEndpoint: false,
      testEndpoint: "",
      maxTestSpendUsd: null,
      approvedAt: "",
      approvedBy: ""
    },
    source: {
      workspace: options.outputDir || "work/interview-workspace",
      packetPath: `packets/${slug(action.candidateId)}.interview-packet.json`,
      publicEvidence: packet.publicEvidence || ""
    },
    notes: [
      "Template only. This must fail interview-report until a real interview is completed and approvals are true.",
      "Do not record private keys, seed phrases, API secrets, bearer tokens, passwords, or settlement credentials.",
      "A pilot endpoint requires separate explicit merchant approval and live-pilot preflight."
    ]
  };
}

function merchantIntakeTemplate(action) {
  const packet = action.packet || {};
  const surface = packet.relevantSurface || "paid agent endpoint";
  return {
    merchantId: "",
    name: packet.prospectName || packet.candidateName || "",
    website: httpUrl(packet.destination) ? packet.destination : "",
    service: {
      category: "",
      endpointType: "",
      description: surface,
      pricingModel: "",
      examplePriceUsd: null
    },
    agentPaymentFit: {
      expectsAgentUsers: false,
      currentX402Support: false,
      currentMcpSupport: false,
      needsSpendCaps: true,
      needsMetadataFilters: true,
      needsReplayProtection: true,
      needsReceipts: true
    },
    risk: {
      sensitiveMetadataClasses: [],
      abuseModes: [],
      maxSafeTestSpendUsd: null
    },
    integration: {
      preferredSurface: "",
      canTestThisWeek: false,
      testEndpoint: "",
      successMetric: ""
    },
    interviewRefs: {
      prospectId: action.prospectId || packet.prospectId || "",
      candidateId: action.candidateId || packet.candidateId || "",
      publicEvidence: packet.publicEvidence || ""
    },
    notes: "Template only. Fill from completed merchant interview answers before running npm run validate-merchant."
  };
}

function fileFromJson({ kind, path, action, content }) {
  const source = stringifyJson(content);
  return {
    kind,
    path,
    actionId: action.actionId || null,
    candidateId: action.candidateId || null,
    candidateName: action.candidateName || null,
    prospectId: action.prospectId || null,
    prospectName: action.prospectName || null,
    sha256: sha256(source),
    bytes: Buffer.byteLength(source, "utf8"),
    content: source
  };
}

function workspaceStatus(campaign, actions) {
  if (campaign.status === "complete") return "complete";
  if (campaign.status === "needs_script") return "needs_script";
  if (actions.length > 0) return "ready_for_review";
  return "no_ready_candidates";
}

function nextActionForWorkspace(status, actions, campaign) {
  if (status === "complete") return "Use validated interviews to choose one merchant-approved protected endpoint test.";
  if (status === "needs_script") return "Add at least five interview questions before generating a workspace.";
  if (actions.length > 0) return `Review ${actions[0].candidateName || actions[0].candidateId} interview prep first.`;
  return campaign.nextAction || "Discover more public contact candidates before generating interview prep files.";
}

function httpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function withoutContent({ content, ...file }) {
  return file;
}

function prefix(index) {
  return String(index + 1).padStart(2, "0");
}

function stringifyJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256(content) {
  return `0x${createHash("sha256").update(content).digest("hex")}`;
}

function slug(value) {
  const text = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return text || "interview";
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
