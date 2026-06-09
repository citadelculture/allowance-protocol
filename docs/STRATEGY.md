# Allow Protocol Strategy

Allow Protocol is the allowance layer for autonomous AI payments.

The wedge is simple: AI agents are gaining wallets, payment rails, and onchain identities, but they still need budgeted spending controls before teams will let them touch real money. Allow gives each agent an enforceable spending envelope: merchant allowlists, per-transaction caps, epoch budgets, metadata filters, route blocks, and receipt proofs.

## Why This Now

Coinbase's x402 documentation describes an HTTP-native payment model where clients can pay APIs and content directly with stablecoins. Coinbase AgentKit gives agents wallet and onchain action tooling. Solana's Agent Registry pushes the agent identity and reputation side of the market.

Those systems increase agent payment surface area. Allow focuses on the missing operating layer: what an agent is allowed to buy, from whom, at what price, under which metadata constraints, with what receipt trail.

## Market Position

Allow should not launch as a memecoin. It should launch as useful infrastructure with a public usage scoreboard.

The first market is builders of agentic apps, MCP servers, x402 APIs, hosted inference, data endpoints, research agents, and wallet-bearing automations.

The second market is merchants who want agents to buy from them but need to prove their endpoints are safe, priced correctly, and receipt-compatible.

The third market is token holders only after usage exists.

## Monetization Math (2026-06 owner discussion)

Fees on micropayments need enormous scale: at a 0.5% take, $100k/yr of
revenue requires ~$20M/yr of routed agent spend (~2B one-cent requests).
Per-transaction fees are the long-term prize, not the first dollar.

Realistic first revenue is hosted policy + audit SaaS sold to teams running
agent fleets: ~20 teams at $200/mo or 4-5 enterprise compliance contracts at
~$50k/yr both clear $200k/yr. The buyer trigger is a finance/security team
asking what stops deployed agents from spending wrong.

The DIY objection ("teams can cap spend themselves") is answered by three
things simple caps cannot provide: adversarial correctness in the details
(retry header loss, per-chain USDC signing domains, accepts-ordering and
asset-substitution attacks, v1/v2 transport differences — all found and
fixed in this repo), receipts a *second party* can verify (self-imposed
limits prove nothing to a CFO, merchant, or client), and one policy plane
plus audit trail across heterogeneous agent frameworks. The standing risk
is platform wallets shipping good-enough native limits; speed and the
neutral cross-platform audit position are the race.

Usage gates before token consideration stay as documented: 100 agents, 50
merchants, 10,000 credible receipts.

## Product Primitive

An Allow policy answers one question:

Can this agent spend this amount with this merchant for this resource right now?

The result is one of:

- `allow`: execute and record receipt
- `review`: pause for controller or higher-trust route
- `deny`: block before signing payment

Every decision produces a receipt hash, even when denied. Denied receipts become a public safety metric.

## Day-One Product

- Local policy evaluator
- Dashboard for payment intent simulation
- Receipt ledger
- No-custody onchain receipt registry prototype
- X launch account with daily public shipping cadence

## Billion-Dollar Path

A billion-dollar valuation requires network effects, not just a token.

The compounding loop:

1. Agents need spend authority.
2. Merchants want to be on agent allowlists.
3. Every safe payment produces a receipt.
4. Receipt volume becomes an agent-commerce trust graph.
5. The trust graph powers routing, pricing, insurance, and reputation.
6. The token becomes useful only when it secures or prioritizes that network.

## Initial Chain Choice

Start on Base for x402 and AgentKit proximity. Track Solana Agent Registry integration as a second ecosystem path once the product has proof of demand.

## Non-Negotiables

- No fake volume
- No undisclosed paid shilling
- No guaranteed returns
- No custody of user funds in v0
- No token before there is measurable usage
- No autonomous trading permissions
