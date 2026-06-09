import assert from "node:assert/strict";
import {
  INTERVIEW_INTAKE_FIELDS,
  buildMerchantInterviewPacket,
  buildMerchantInterviewPackets,
  validateInterviewPacketSource
} from "../src/interviewPacket.mjs";

const script = {
  opening: "Opening",
  questions: [
    "Do agents call your API?",
    "Do you price per request?",
    "What can go wrong?",
    "Do you need spend limits?",
    "Would receipts help?",
    "Where should Allow sit?",
    "What metadata is sensitive?",
    "Can you test this week?"
  ],
  close: "Close"
};

const prospect = {
  id: "agentic-market-research",
  name: "Agentic Market Research",
  segment: "x402 sellers",
  evidence: "Public x402 market research bundle.",
  score: {
    existingEndpoint: 2,
    usageBasedPricing: 2,
    agentUsersLikely: 2,
    metadataOrAbuseRisk: 2,
    canTestWithinWeek: 1,
    publicProofPotential: 2
  }
};

const candidate = {
  id: "blockrun-partners",
  prospectId: "agentic-market-research",
  name: "BlockRun Labs",
  relevantSurface: "market research endpoint",
  contactPath: "https://blockrun.ai/",
  preferredChannel: "contact form",
  publicEvidence: "Public marketplace operator.",
  confidence: 0.82,
  status: "draft_ready"
};

const packet = buildMerchantInterviewPacket(candidate, prospect, script, { questionCount: 6 });

assert.equal(packet.valid, true);
assert.equal(packet.status, "ready_for_human_review");
assert.equal(packet.candidateId, "blockrun-partners");
assert.equal(packet.destination, "https://blockrun.ai/");
assert.equal(packet.evidenceBoundary.outreachSentByThisPacket, false);
assert.equal(packet.evidenceBoundary.countsAsCompletedInterview, false);
assert.ok(packet.questions.some((question) => question.includes("less than one hour")));
assert.ok(packet.humanApprovalChecklist.some((item) => item.includes("not a token pitch")));
assert.ok(INTERVIEW_INTAKE_FIELDS.includes("integration.testEndpoint"));
assert.equal(validateInterviewPacketSource(candidate, prospect, script).valid, true);

const packets = buildMerchantInterviewPackets(
  [
    { ...candidate, id: "lower-confidence", confidence: 0.1 },
    candidate,
    { ...candidate, id: "not-ready", status: "needs_contact_discovery", confidence: 1 }
  ],
  [prospect],
  script,
  { limit: 1 }
);

assert.equal(packets.length, 1);
assert.equal(packets[0].candidateId, "blockrun-partners");

const invalid = buildMerchantInterviewPacket(
  {
    id: "bad",
    prospectId: "missing",
    name: "Bad Candidate",
    relevantSurface: "endpoint",
    contactPath: "mailto:bad@example.com",
    status: "draft_ready"
  },
  {},
  { questions: ["q1"] }
);

assert.equal(invalid.valid, false);
assert.equal(invalid.status, "action_required");
assert.ok(invalid.reasons.includes("Contact path must be an http or https URL"));
assert.ok(invalid.reasons.includes("Interview script must include at least five questions"));

console.log("interviewPacket tests passed");
