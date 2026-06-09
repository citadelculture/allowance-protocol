# Allow Merchant Interview Workspace

Generated: 2026-06-09T04:40:49.046Z
Workspace: work/interview-workspace
Campaign status: ready_for_human_review
Shortfall: 5
Shortfall after this batch: 0

## Safety Boundary

- This workspace is local preparation only.
- It does not send outreach, schedule interviews, request secrets, start pilot traffic, create merchant approval, or count interviews.
- Keep the ask product-feedback-only and explicitly not a token pitch.
- Completed interviews count only after `npm run interview-report` passes.

## Interview Prep Files

- BlockRun Labs: `packets/01-blockrun-partners.interview-packet.json`
  Record template: `records/01-blockrun-partners.completed-interview.template.json`
  Intake template: `intakes/01-blockrun-partners.merchant-intake.template.json`
- BlockRun Franklin maintainers: `packets/02-blockrun-github-franklin.interview-packet.json`
  Record template: `records/02-blockrun-github-franklin.completed-interview.template.json`
  Intake template: `intakes/02-blockrun-github-franklin.merchant-intake.template.json`
- Parallel: `packets/03-parallel-contact.interview-packet.json`
  Record template: `records/03-parallel-contact.completed-interview.template.json`
  Intake template: `intakes/03-parallel-contact.merchant-intake.template.json`
- Agentic Market seller tooling: `packets/04-agentic-market-seller-tools.interview-packet.json`
  Record template: `records/04-agentic-market-seller-tools.completed-interview.template.json`
  Intake template: `intakes/04-agentic-market-seller-tools.merchant-intake.template.json`
- the402: `packets/05-the402-contact.interview-packet.json`
  Record template: `records/05-the402-contact.completed-interview.template.json`
  Intake template: `intakes/05-the402-contact.merchant-intake.template.json`

## Blocked Candidates

- toon-haus-finance: Candidate is not draft_ready

## Completion Steps

1. Get explicit approval before any outbound contact.
2. Run the interview as product feedback, not as a token or investment conversation.
3. Fill at least five question answers or explicit skips.
4. Create and validate a merchant intake.
5. Add the completed interview to `ops/interviews.json`.
6. Run `npm run interview-report`.
