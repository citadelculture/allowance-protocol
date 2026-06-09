# Interview Completion Handoff

`npm run interview-completion-handoff` writes `work/interview-completion-handoff.md`, a local bridge from audited interview prep to the evidence needed for the five-interview growth gate.

```bash
npm run interview-completion-handoff
```

The handoff reads the audited interview review brief and `ops/interviews.json`. It does not send outreach, schedule calls, count interviews, approve merchants, start pilot traffic, post content, sign wallet payloads, deploy contracts, move funds, request secrets, store secrets, pitch tokens, update state, or enable a token.

## Inputs

Override paths with:

```bash
ALLOW_INTERVIEW_WORKSPACE_DIR=work/interview-workspace
ALLOW_INTERVIEWS=ops/interviews.json
ALLOW_INTERVIEW_COMPLETION_HANDOFF_PATH=work/interview-completion-handoff.md
npm run interview-completion-handoff
```

## Completion Flow

- Review the prepared packet, record template, and intake template.
- Get explicit approval before any outbound contact.
- Run the conversation as product feedback only.
- Record at least five answers, the required safety approvals, and a linked merchant intake.
- Run `npm run validate-merchant -- <completed-intake.json>`.
- Add the completed interview to `ops/interviews.json`.
- Run `npm run interview-report` before any interview counts.
