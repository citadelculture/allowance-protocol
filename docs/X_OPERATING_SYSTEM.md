# X Operating System

The X account should build trust through public shipping, not hype.

## Bio

Allow Protocol
The allowance layer for autonomous payments.
Agent spend policies, x402 guardrails, and verifiable receipts.

## Pinned Post

AI agents are getting wallets.

The missing primitive is not more autonomy. It is allowance.

Allow Protocol gives agents explicit spend envelopes:

- merchant allowlists
- per-tx caps
- daily budgets
- metadata filters
- route blocks
- receipt proofs

We are building in public.

## Daily Cadence

Post one of each per day:

- Build log: what shipped
- Risk note: a concrete agent payment failure mode
- Integration ask: who should test the next connector

## First 10 Posts

1. AI agents should not get blank-check wallets. They need allowances.
2. The core Allow question: can this agent spend this amount with this merchant for this resource right now?
3. x402 makes payment native to HTTP. Allow makes spending safe enough to automate.
4. Every agent payment should leave a receipt. Denied payments are signal too.
5. Our first blocklist category is autonomous trading. The first killer app is safer API spend.
6. Merchant allowlists beat broad wallet permissions.
7. Metadata filtering matters because payment requests can leak secrets.
8. We are starting on Base because the agent-payment stack is closest there.
9. We are tracking Solana Agent Registry because identity and reputation need to travel.
10. No token until receipts exist. Usage first, speculation later.

## Launch Pack

Run:

```bash
npm run launch-pack
npm run x-post-action-pack
npm run x-post-execution-evidence -- ops/x_post_execution_template.json
npm run x-post-state -- ops/x_post_execution_records.json
npm run outreach-approval
npm run external-action-approval -- ops/external_action_template.json
```

The launch pack lives in `launch/` and contains draft-only post variants plus the rendered dashboard screenshot. Treat posting as an external action that requires account-owner approval.

> Amendment (2026-06-09): the account owner has authorized automated posting
> via `npm run x-post` with the env-var OAuth credentials, stated directly in
> the live session conversation. See the Owner Authorization Amendment in
> `docs/EXTERNAL_ACTION_APPROVAL.md`. Posts are previewed with `--dry-run`
> first and recorded in the X post execution ledger after publication.
The X post action pack generates unapproved `x_post` packets for those drafts. The external action approval packet must reference the exact X text and approved account handle. The command validates the post but does not post it.
After a human posts, the X post execution evidence command validates exact text, account handle, public post URL, and redacted proof.
The X post state command reconciles passed execution records against `launch/x_posts.json` before any post is treated as posted.
The outreach approval command checks outbound messages for claim safety and draft-only status; it does not post or send.

## Reply Strategy

Reply to:

- x402 builders
- MCP server builders
- agent framework maintainers
- wallet infrastructure teams
- API founders

Do not argue with price-only accounts. Convert serious builders into testers.

## Weekly Public Update

Format:

- Receipts recorded
- Payments blocked
- New merchants
- New agents
- Biggest risk learned
- Next integration
