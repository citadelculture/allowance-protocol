export function buildOutreachDraft(candidate, prospect) {
  const contactName = candidate.name || "builder";
  const productSurface = candidate.relevantSurface || "paid agent endpoint";
  const prospectName = prospect?.name || candidate.prospectId || "your service";

  const subject = `Allow Protocol feedback for ${productSurface}`;

  const message = [
    `Hi ${contactName},`,
    "",
    "I am building Allow Protocol, a no-custody policy layer for agent payments.",
    "",
    `I found ${productSurface} while mapping early x402 and agent-service merchants. The specific question: would a pre-settlement guard help before an agent pays for services like this?`,
    "",
    "Allow blocks unsafe paid requests before settlement:",
    "- merchant allowlists",
    "- per-transaction and daily spend caps",
    "- metadata filters",
    "- per-policy nonce/replay checks",
    "- receipts for allowed and denied attempts",
    "",
    "Would you be open to giving blunt feedback on the middleware shape, or testing one low-risk endpoint?",
    "",
    "No token pitch. I am trying to learn where agent-payment guardrails are actually painful."
  ].join("\n");

  return {
    prospectId: candidate.prospectId,
    candidateId: candidate.id,
    channel: candidate.preferredChannel || "unknown",
    destination: candidate.contactPath,
    subject,
    message,
    status: "draft_only"
  };
}

export function buildOutreachDrafts(candidates = [], prospects = []) {
  return candidates
    .filter((candidate) => candidate.status === "draft_ready")
    .sort((a, b) => {
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      return a.name.localeCompare(b.name);
    })
    .slice(0, 5)
    .map((candidate) => {
      const prospect = prospects.find((item) => item.id === candidate.prospectId);
      return buildOutreachDraft(candidate, prospect);
    });
}
