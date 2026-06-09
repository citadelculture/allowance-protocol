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
