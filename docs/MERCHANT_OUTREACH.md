# Merchant Outreach Kit

Allow Protocol needs real merchants before it needs a token.

The first growth motion is to recruit API and MCP builders who already sell, meter, or gate access to search, data, research, inference, or workflow endpoints.

## Source-Backed Thesis

- Coinbase x402 docs describe HTTP-native stablecoin payments for APIs, AI agents, paywalls, microservices, and proxy services.
- The x402 facilitator exposes verification and settlement APIs for resource servers.
- The official MCP Registry gives public MCP server creators a metadata surface and discovery path.
- Base's agent page frames the market around agent wallets, x402 services, and spend guardrails.
- Agentic Market positions x402 services as discoverable APIs that agents can pay without accounts or API keys.

## Ideal Customer Profile

Prioritize builders with all of these traits:

- They expose an API, MCP server, or data endpoint.
- Their endpoint has clear per-request value.
- They already meter usage or want usage-based pricing.
- Their users include agents, automations, analysts, researchers, or developers.
- A bad agent request can waste money, leak metadata, or trigger abuse.
- They can test a middleware integration in less than one hour.

Avoid for now:

- Token projects seeking price promotion.
- Trading bots that need broad autonomous swap authority.
- Custodial wallet products that require us to hold funds.
- Teams that only want airdrops, points, or token allocations.

## First Target Segments

1. x402 sellers and service marketplaces
   - They already accept or explore machine payments.
   - Their pain is buyer-side trust: budgets, nonce replay checks, metadata filtering, and receipt trails.

2. MCP server developers
   - They publish tools that agents can call.
   - Their pain is safe monetization and trustworthy discovery.

3. Search, data, and research APIs
   - They are high-frequency, per-request, and often agent-friendly.
   - Their pain is usage control and abuse prevention.

4. Inference and compute endpoints
   - They can have variable cost.
   - Their pain is cost ceilings, reconciliation, and spend anomaly checks.

5. Base agent ecosystem teams
   - Base is explicitly pushing agent wallets, x402 services, and spend guardrails.
   - Their pain is policy control across wallet-bearing agents.

## Interview Script

Goal: learn whether Allow solves an urgent merchant or agent-spend problem.

Opening:

> We are building Allow Protocol, a no-custody allowance layer for agent payments. It sits before x402-style settlement and answers: can this agent spend this amount with this merchant for this resource right now?

Questions:

1. Do you expect AI agents to call or pay for your API/MCP server directly?
2. Do you already price per request, per result, per token, per job, or per bundle?
3. What can go wrong if an agent calls your endpoint too often or with bad metadata?
4. Do you need buyer-side spend limits, merchant allowlists, or nonce/replay protection?
5. Would a denied-payment receipt help you debug abuse or failed agent workflows?
6. Where would Allow sit best: client middleware, server middleware, MCP gateway, or wallet policy hook?
7. What metadata should never be included in a paid request?
8. What would make this integration too risky or annoying to try?
9. Could you test a single protected endpoint this week?
10. What metric would prove this is useful to you?

Close:

> If we send you a 20-line middleware example, would you try it on one low-risk endpoint? We are not pitching a token. We need product feedback from builders who actually handle paid agent requests.

## Qualification Score

Score each prospect from 0 to 2:

- Existing API or MCP endpoint
- Existing usage-based pricing or strong desire for it
- Agent users likely in the next 90 days
- Sensitive metadata or abuse risk
- Can test middleware within one week
- Clear public proof if integration works

Priority:

- 9-12: immediate interview
- 6-8: async outreach
- 3-5: nurture
- 0-2: skip

## First Outreach Message

Before sending any outreach, run:

```bash
npm run outreach-approval
npm run outreach-action-pack
```

The approval report checks that generated drafts stay `draft_only`, have a safe destination, avoid token hype and unapproved partnership or usage claims, and do not include secret-looking text. The action pack turns those drafts into exact `merchant_outreach` approval packets. Neither command sends messages.

After a packet passes final external-action approval and a human sends the message, validate the send evidence:

```bash
npm run outreach-execution-evidence -- ops/outreach_execution_template.json
```

This checks the exact sent text against the approved packet, verifies human execution flags, and records response state without counting a completed interview.

Then add the passed record to `ops/outreach_execution_records.json` and reconcile the pipeline:

```bash
npm run outreach-state -- ops/outreach_execution_records.json
```

Before scheduling an interview, generate a review-only interview packet:

```bash
npm run interview-packet
```

The packet turns a contact candidate into questions, required intake fields, and human approval checks. It does not send outreach and does not count as a completed interview.

If the merchant schedules a call, add a `scheduled` record to `ops/interviews.json` with `scheduledAt`, `scheduledBy`, `channel`, safety approvals, and `outreachEvidenceRef` pointing to the scheduled outreach evidence. Then run:

```bash
npm run interview-report
```

The report will show the scheduled count but still requires completed answers and linked intake before readiness can pass.

After a completed interview, run:

```bash
npm run interview-report
```

The report only counts interviews with at least five answers, safety approvals, and a linked merchant intake JSON that validates.

Subject or DM:

> Quick builder question on paid agent APIs

Message:

> I am building Allow Protocol, a no-custody policy layer for agent payments.
>
> It sits before x402-style settlement and blocks unsafe requests before an agent pays: per-tx caps, merchant allowlists, metadata filters, nonce/replay checks, and receipts.
>
> I saw you are building in the paid API / MCP / agent-service lane. Would you be open to testing one protected endpoint or giving blunt feedback on the middleware shape?
>
> No token pitch. I am trying to learn where agent-payment guardrails are actually painful.

## Public Ask

Use this post when asking for testers:

> Looking for 5 API or MCP builders who expect AI agents to pay for their service.
>
> Allow Protocol is a no-custody allowance layer for agent payments:
> - merchant allowlists
> - spend caps
> - metadata filters
> - nonce/replay checks
> - receipts
>
> No token pitch. I need blunt middleware feedback.

## Proof To Collect

- One screenshot of an allowed request
- One screenshot of a blocked replay
- One merchant quote about the guardrail they care about
- One integration friction note
- One pricing or policy change requested by the merchant

## Sources

- Coinbase x402 overview: https://docs.cdp.coinbase.com/x402/welcome
- Coinbase x402 facilitator: https://docs.cdp.coinbase.com/api-reference/v2/rest-api/x402-facilitator/x402-facilitator
- MCP Registry: https://modelcontextprotocol.io/registry/about
- Base agents: https://www.base.org/agents
- Agentic Market: https://agentic.market/
