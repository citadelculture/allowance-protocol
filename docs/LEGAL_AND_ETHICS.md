# Legal And Ethics Notes

This project must be run as infrastructure, not as a market manipulation campaign.

## Allowed

- Building open-source software
- Publishing real product metrics
- Posting accurate progress updates
- Deploying audited or reviewed contracts
- Using a multisig for treasury funds
- Integrating real APIs and agent frameworks
- Designing token utility after usage exists
- Keeping token launch, transfers, liquidity, sales, airdrops, and return claims disabled until `npm run token-governance` proves legal-review readiness

## Not Allowed

- Pump-and-dump coordination
- Fake volume
- Wash trading
- Misleading market cap claims
- Undisclosed paid promotion
- Promising returns
- Quantified usage claims without evidence
- Partnership or endorsement claims without explicit approval
- Hiding team or treasury allocations
- Giving agents unrestricted trading authority
- Storing sensitive metadata onchain
- Putting raw prompts, private keys, or personal data in dispute packets
- Advancing token design from hype or market-cap targets instead of usage evidence and legal review

## Custody

The v0 protocol should not custody user funds. It should evaluate payment intents and record receipt proofs. If future versions add escrow, that must be separately designed, reviewed, and audited.

## Disclosures

Every public launch surface should state:

- The product is experimental.
- Receipts are not an audit guarantee.
- Token plans, if any, are subject to legal review.
- Users are responsible for their own wallet security.
- Refunds or settlement reversals are handled outside Allow custody unless a separately reviewed flow exists.
