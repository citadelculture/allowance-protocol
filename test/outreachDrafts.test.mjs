import assert from "node:assert/strict";
import { buildOutreachDraft, buildOutreachDrafts } from "../src/outreachDrafts.mjs";

const candidate = {
  id: "c1",
  prospectId: "p1",
  name: "Example API",
  relevantSurface: "paid search endpoint",
  contactPath: "https://example.com/contact",
  preferredChannel: "contact form",
  status: "draft_ready",
  confidence: 0.8
};

const prospect = {
  id: "p1",
  name: "Example prospect"
};

const draft = buildOutreachDraft(candidate, prospect);
assert.equal(draft.status, "draft_only");
assert.equal(draft.destination, "https://example.com/contact");
assert.ok(draft.subject.includes("paid search endpoint"));
assert.ok(draft.message.includes("No token pitch"));
assert.ok(draft.message.includes("nonce/replay checks"));

const drafts = buildOutreachDrafts(
  [
    candidate,
    { ...candidate, id: "c2", name: "Needs Discovery", status: "needs_contact_discovery", confidence: 1 }
  ],
  [prospect]
);

assert.equal(drafts.length, 1);
assert.equal(drafts[0].candidateId, "c1");

console.log("outreachDrafts tests passed");
