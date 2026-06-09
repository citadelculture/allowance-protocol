# Interview Campaign

The interview campaign planner turns contact candidates into a review-only batch for the five-interview growth gate.

```bash
npm run interview-campaign
```

The command reads:

- `ops/contact_candidates.json`
- `ops/prospects.json`
- `ops/interviews.json`
- `ops/interview_script.json`

It prints:

- the completed-interview shortfall
- review-ready interview packets
- candidates blocked by contact discovery, invalid URLs, missing script fields, or existing scheduled/completed records
- the shortfall remaining after the current batch
- evidence instructions for making a completed call count in `npm run interview-report`

This planner does not send outreach, post to X, start pilot traffic, request secrets, or count an interview as complete. It only prepares the next human-reviewed actions.

## Local Workspace

Generate local prep files for the current review-ready batch:

```bash
npm run interview-workspace
```

By default this writes:

- `work/interview-workspace/manifest.json`
- `work/interview-workspace/REVIEW_CHECKLIST.md`
- `work/interview-workspace/packets/*.interview-packet.json`
- `work/interview-workspace/records/*.completed-interview.template.json`
- `work/interview-workspace/intakes/*.merchant-intake.template.json`

The completed-interview templates are intentionally incomplete. They keep answers blank, safety approvals false, and `intakePath` empty so they cannot count until a real human interview and validated merchant intake exist. The workspace does not send outreach, schedule interviews, request secrets, approve a merchant, start pilot traffic, or count interviews.

Audit the workspace before using the prep files:

```bash
npm run interview-workspace-audit
```

The audit is read-only. It recomputes hashes, checks byte counts, flags missing or unexpected files, scans for secret-like material, and verifies completed-interview and merchant-intake templates remain incomplete and invalid as launch evidence.

Generate a local review brief after the audit passes:

```bash
npm run interview-review-brief
```

By default this writes `work/interview-review-brief.md`. The brief lists each candidate, destination, packet/template paths, questions, completion commands, blocked candidates, and the safety boundary. It depends on the audit and fails if the workspace has been edited into completed evidence or merchant approval. It does not send outreach, schedule calls, count interviews, approve merchants, start pilot traffic, request secrets, or pitch a token.

## Completion Boundary

A packet becomes real interview evidence only after:

- the account owner approves the outbound message
- scheduled records include `scheduledAt`, `scheduledBy`, `channel`, `outreachEvidenceRef`, and the safety approvals
- the referenced outreach execution evidence has `outreachStatus: "scheduled"` and the same prospect, candidate, and interview id
- the merchant answers or explicitly skips at least five questions
- the record confirms product-feedback-only, no-token-pitch, no-secrets, and prototype-understanding approvals
- the linked merchant intake validates
- `npm run interview-report` passes

If the report says `shortfallAfterPlan` is greater than zero, keep contact discovery open and add more public candidates before claiming the five-interview gate is done.
