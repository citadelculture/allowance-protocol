# Launch Sequence

The launch sequencer turns readiness gates and evidence ledgers into one ordered critical path.

```bash
npm run launch-sequence
npm run launch-handoff-brief
npm run approval-runbook
npm run approval-preflight
npm run approval-request
npm run approval-decision-template
npm run approval-decision -- <approved-decision.json> --require-approved
npm run approval-packet-preview -- <approved-decision.json> <approved-packet.preview.json>
```

The report stages are:

1. public build post
2. merchant outreach
3. merchant interviews through audited prep workspace and review brief
4. controller policy signature
5. deployment review package
6. live pilot traffic
7. live directory claims
8. token legal review

Stage statuses:

- `complete`: required evidence exists
- `ready_for_human_action`: tooling is ready, but a human must approve and perform the external action
- `waiting_for_evidence`: the next artifact must be filled with real evidence before approval
- `blocked`: an earlier real-world dependency is missing
- `not_ready`: a required readiness gate failed

The sequencer does not post to X, send outreach, schedule interviews, sign wallet payloads, deploy contracts, run pilot traffic, mark merchants live, enable tokens, move funds, or store secrets. It only names the next lawful action and the evidence required before the next stage can advance.

For merchant interviews, the critical path includes `npm run interview-workspace`, `npm run interview-workspace-audit`, `npm run interview-review-brief`, and `npm run interview-completion-handoff` before completed evidence can count. The briefs are local handoff material only; outbound contact still needs explicit action-time approval.

`npm run launch-handoff-brief` writes `work/launch-handoff-brief.md`, a concise local handoff over the launch sequence, external-action review brief, interview review brief, open readiness gates, and blocked evidence. It fails if either underlying review brief is invalid. It does not approve or execute anything.

`npm run approval-runbook` writes `work/approval-runbook.md` from the audited external-action review brief. It turns the next ready packet into pre-approval, manual execution, post-execution evidence, and safety steps. It does not approve packets, execute actions, or update state.

`npm run approval-preflight` writes `work/approval-preflight.md` and fails closed unless the current external-action stage, review brief, approval runbook, approval command, evidence command, and post-evidence preview path line up. It is still local review material only.

`npm run approval-request` writes `work/approval-request.md`, a concise action-time approval request for the current draft packet. It refuses to be ready if the packet has already been approved or any approval flag is prefilled.

`npm run approval-decision-template` writes `work/approval-decision.template.json`, a pending JSON template bound to the current draft packet SHA-256. It is the local place to record a later action-time approval or rejection, but it does not approve, execute, or update anything by itself.

`npm run approval-decision -- <approved-decision.json> --require-approved` validates the filled decision against the current draft packet hash before the packet is edited and before `external-action-approval` can be meaningfully run.

`npm run approval-packet-preview -- <approved-decision.json> <approved-packet.preview.json>` derives a separate approved packet copy from the validated decision. The original draft packet remains unchanged, and the derived preview still needs `external-action-approval`.

`npm run launch-sequence` exits nonzero only when the sequence is structurally not ready. A `ready_for_external_action`, `waiting_for_evidence`, or `blocked_by_prior_evidence` status can still exit zero because those are expected before real approval, interviews, signatures, deployment review, and pilot evidence exist.
