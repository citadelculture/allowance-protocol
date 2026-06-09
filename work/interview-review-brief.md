# Allow Merchant Interview Review Brief

Generated: 2026-06-09T05:40:16.562Z
Workspace: /Users/dom/Documents/Codex/2026-06-08/your-task-is-to-build-a/outputs/allow-protocol/work/interview-workspace
Status: ready_for_interview_review
Audit: verified_interview_workspace (valid)

## Safety Boundary

- This brief is local interview review material only.
- No outreach is sent, no call is scheduled, no interview is counted, and no merchant approval is created by this brief.
- Keep the ask product-feedback-only and explicitly not a token pitch.
- Completed interviews count only after real answers, a validated merchant intake, and `npm run interview-report`.

## Review Queue

- Interview packets: 5
- Completed-record templates: 5
- Merchant-intake templates: 5
- Completed-interview shortfall: 5
- Shortfall after this prep batch: 0
- Blocked candidates: 1

### 1. BlockRun Labs

- Candidate id: `blockrun-partners`
- Prospect: `Agentic Market: Market Research services`
- Channel: `partner/contact page`
- Destination: `https://blockrun.ai/`
- Surface: Agentic Market Market Research bundle / Exa Neural Search service wrapper
- Packet: `packets/01-blockrun-partners.interview-packet.json` (verified)
- Record template: `records/01-blockrun-partners.completed-interview.template.json` (verified)
- Intake template: `intakes/01-blockrun-partners.merchant-intake.template.json` (verified)
- Questions: 9
- Record approvals true: 0/4
- Record answers filled: 0
- Pilot approval captured: no
- Intake can test this week: no
- Suggested intake path: `ops/intakes/blockrun-partners.json`
- Validate intake: `npm run validate-merchant -- ops/intakes/blockrun-partners.json`
- Count completed interview: `npm run interview-report`

Opening:

```text
We are building Allow Protocol, a no-custody allowance layer for agent payments. It sits before x402-style settlement and answers: can this agent spend this amount with this merchant for this resource right now?
```

Questions:

- Do you expect AI agents to call or pay for your API/MCP server directly?
- Do you already price per request, per result, per token, per job, or per bundle?
- What can go wrong if an agent calls your endpoint too often or with bad metadata?
- Do you need buyer-side spend limits, merchant allowlists, or nonce/replay protection?
- Would a denied-payment receipt help you debug abuse or failed agent workflows?
- Where would Allow sit best: client middleware, server middleware, MCP gateway, or wallet policy hook?
- What metadata should never be included in a paid request?
- What would make this integration too risky or annoying to try?
- Would you test Allow on one low-risk Agentic Market Market Research bundle / Exa Neural Search service wrapper path if the first pass takes less than one hour?

Close:

```text
If we send you a 20-line middleware example, would you try it on one low-risk endpoint? We are not pitching a token. We need product feedback from builders who actually handle paid agent requests.
```

### 2. BlockRun Franklin maintainers

- Candidate id: `blockrun-github-franklin`
- Prospect: `Agentic Market: Market Research services`
- Channel: `GitHub issue or repository discussion`
- Destination: `https://github.com/BlockRunAI/Franklin`
- Surface: x402-enabled API marketplace repository
- Packet: `packets/02-blockrun-github-franklin.interview-packet.json` (verified)
- Record template: `records/02-blockrun-github-franklin.completed-interview.template.json` (verified)
- Intake template: `intakes/02-blockrun-github-franklin.merchant-intake.template.json` (verified)
- Questions: 9
- Record approvals true: 0/4
- Record answers filled: 0
- Pilot approval captured: no
- Intake can test this week: no
- Suggested intake path: `ops/intakes/blockrun-github-franklin.json`
- Validate intake: `npm run validate-merchant -- ops/intakes/blockrun-github-franklin.json`
- Count completed interview: `npm run interview-report`

Opening:

```text
We are building Allow Protocol, a no-custody allowance layer for agent payments. It sits before x402-style settlement and answers: can this agent spend this amount with this merchant for this resource right now?
```

Questions:

- Do you expect AI agents to call or pay for your API/MCP server directly?
- Do you already price per request, per result, per token, per job, or per bundle?
- What can go wrong if an agent calls your endpoint too often or with bad metadata?
- Do you need buyer-side spend limits, merchant allowlists, or nonce/replay protection?
- Would a denied-payment receipt help you debug abuse or failed agent workflows?
- Where would Allow sit best: client middleware, server middleware, MCP gateway, or wallet policy hook?
- What metadata should never be included in a paid request?
- What would make this integration too risky or annoying to try?
- Would you test Allow on one low-risk x402-enabled API marketplace repository path if the first pass takes less than one hour?

Close:

```text
If we send you a 20-line middleware example, would you try it on one low-risk endpoint? We are not pitching a token. We need product feedback from builders who actually handle paid agent requests.
```

### 3. Parallel

- Candidate id: `parallel-contact`
- Prospect: `Agentic Market: Market Research services`
- Channel: `contact form`
- Destination: `https://contact.parallel.ai/`
- Surface: Parallel Search / task API
- Packet: `packets/03-parallel-contact.interview-packet.json` (verified)
- Record template: `records/03-parallel-contact.completed-interview.template.json` (verified)
- Intake template: `intakes/03-parallel-contact.merchant-intake.template.json` (verified)
- Questions: 9
- Record approvals true: 0/4
- Record answers filled: 0
- Pilot approval captured: no
- Intake can test this week: no
- Suggested intake path: `ops/intakes/parallel-contact.json`
- Validate intake: `npm run validate-merchant -- ops/intakes/parallel-contact.json`
- Count completed interview: `npm run interview-report`

Opening:

```text
We are building Allow Protocol, a no-custody allowance layer for agent payments. It sits before x402-style settlement and answers: can this agent spend this amount with this merchant for this resource right now?
```

Questions:

- Do you expect AI agents to call or pay for your API/MCP server directly?
- Do you already price per request, per result, per token, per job, or per bundle?
- What can go wrong if an agent calls your endpoint too often or with bad metadata?
- Do you need buyer-side spend limits, merchant allowlists, or nonce/replay protection?
- Would a denied-payment receipt help you debug abuse or failed agent workflows?
- Where would Allow sit best: client middleware, server middleware, MCP gateway, or wallet policy hook?
- What metadata should never be included in a paid request?
- What would make this integration too risky or annoying to try?
- Would you test Allow on one low-risk Parallel Search / task API path if the first pass takes less than one hour?

Close:

```text
If we send you a 20-line middleware example, would you try it on one low-risk endpoint? We are not pitching a token. We need product feedback from builders who actually handle paid agent requests.
```

### 4. Agentic Market seller tooling

- Candidate id: `agentic-market-seller-tools`
- Prospect: `Agentic Market: Market Research services`
- Channel: `seller tooling / marketplace path`
- Destination: `https://agentic.market/tools/sellers`
- Surface: x402 service discovery and seller validation
- Packet: `packets/04-agentic-market-seller-tools.interview-packet.json` (verified)
- Record template: `records/04-agentic-market-seller-tools.completed-interview.template.json` (verified)
- Intake template: `intakes/04-agentic-market-seller-tools.merchant-intake.template.json` (verified)
- Questions: 9
- Record approvals true: 0/4
- Record answers filled: 0
- Pilot approval captured: no
- Intake can test this week: no
- Suggested intake path: `ops/intakes/agentic-market-seller-tools.json`
- Validate intake: `npm run validate-merchant -- ops/intakes/agentic-market-seller-tools.json`
- Count completed interview: `npm run interview-report`

Opening:

```text
We are building Allow Protocol, a no-custody allowance layer for agent payments. It sits before x402-style settlement and answers: can this agent spend this amount with this merchant for this resource right now?
```

Questions:

- Do you expect AI agents to call or pay for your API/MCP server directly?
- Do you already price per request, per result, per token, per job, or per bundle?
- What can go wrong if an agent calls your endpoint too often or with bad metadata?
- Do you need buyer-side spend limits, merchant allowlists, or nonce/replay protection?
- Would a denied-payment receipt help you debug abuse or failed agent workflows?
- Where would Allow sit best: client middleware, server middleware, MCP gateway, or wallet policy hook?
- What metadata should never be included in a paid request?
- What would make this integration too risky or annoying to try?
- Would you test Allow on one low-risk x402 service discovery and seller validation path if the first pass takes less than one hour?

Close:

```text
If we send you a 20-line middleware example, would you try it on one low-risk endpoint? We are not pitching a token. We need product feedback from builders who actually handle paid agent requests.
```

### 5. the402

- Candidate id: `the402-contact`
- Prospect: `Base agent wallet and x402 service builders`
- Channel: `contact form`
- Destination: `https://the402.ai/contact/`
- Surface: Base mainnet x402 service marketplace, MCP catalog, and provider onboarding
- Packet: `packets/05-the402-contact.interview-packet.json` (verified)
- Record template: `records/05-the402-contact.completed-interview.template.json` (verified)
- Intake template: `intakes/05-the402-contact.merchant-intake.template.json` (verified)
- Questions: 9
- Record approvals true: 0/4
- Record answers filled: 0
- Pilot approval captured: no
- Intake can test this week: no
- Suggested intake path: `ops/intakes/the402-contact.json`
- Validate intake: `npm run validate-merchant -- ops/intakes/the402-contact.json`
- Count completed interview: `npm run interview-report`

Opening:

```text
We are building Allow Protocol, a no-custody allowance layer for agent payments. It sits before x402-style settlement and answers: can this agent spend this amount with this merchant for this resource right now?
```

Questions:

- Do you expect AI agents to call or pay for your API/MCP server directly?
- Do you already price per request, per result, per token, per job, or per bundle?
- What can go wrong if an agent calls your endpoint too often or with bad metadata?
- Do you need buyer-side spend limits, merchant allowlists, or nonce/replay protection?
- Would a denied-payment receipt help you debug abuse or failed agent workflows?
- Where would Allow sit best: client middleware, server middleware, MCP gateway, or wallet policy hook?
- What metadata should never be included in a paid request?
- What would make this integration too risky or annoying to try?
- Would you test Allow on one low-risk Base mainnet x402 service marketplace, MCP catalog, and provider onboarding path if the first pass takes less than one hour?

Close:

```text
If we send you a 20-line middleware example, would you try it on one low-risk endpoint? We are not pitching a token. We need product feedback from builders who actually handle paid agent requests.
```

## Blocked Candidates

- toon-haus-finance: Candidate is not draft_ready

## Completion Steps

1. Get explicit approval before any outbound contact.
2. Run the interview as product feedback, not as a token or investment conversation.
3. Fill at least five answers or explicit skips in the completed-record template.
4. Create and validate a merchant intake.
5. Add the completed interview record to `ops/interviews.json`.
6. Run `npm run interview-report` before counting the interview.

## Final Reminder

Run `npm run interview-workspace-audit` before review. This brief does not send outreach, schedule calls, count interviews, approve merchants, or start pilot traffic.
