#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { buildMerchantInterviewPacket, buildMerchantInterviewPackets } from "../src/interviewPacket.mjs";

const candidateId = process.argv[2] || "";
const candidatesPath = process.env.ALLOW_CONTACT_CANDIDATES || "ops/contact_candidates.json";
const prospectsPath = process.env.ALLOW_PROSPECTS || "ops/prospects.json";
const scriptPath = process.env.ALLOW_INTERVIEW_SCRIPT || "ops/interview_script.json";

const [candidates, prospects, interviewScript] = await Promise.all([
  readJson(candidatesPath),
  readJson(prospectsPath),
  readJson(scriptPath)
]);

if (candidateId) {
  const candidate = candidates.find((item) => item.id === candidateId);
  if (!candidate) {
    console.log(JSON.stringify({
      candidateId,
      valid: false,
      status: "action_required",
      reasons: [`Unknown candidate id: ${candidateId}`]
    }, null, 2));
    process.exit(1);
  }

  const prospect = prospects.find((item) => item.id === candidate.prospectId) || {};
  const packet = buildMerchantInterviewPacket(candidate, prospect, interviewScript);
  console.log(JSON.stringify(packet, null, 2));
  process.exit(packet.valid ? 0 : 1);
}

const packets = buildMerchantInterviewPackets(candidates, prospects, interviewScript, {
  limit: Number(process.env.ALLOW_INTERVIEW_PACKET_LIMIT || 3)
});
const report = {
  generatedAt: new Date().toISOString(),
  valid: packets.length > 0 && packets.every((packet) => packet.valid),
  status: packets.length > 0 && packets.every((packet) => packet.valid) ? "ready_for_human_review" : "action_required",
  count: packets.length,
  packets
};

console.log(JSON.stringify(report, null, 2));
process.exit(report.valid ? 0 : 1);

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}
