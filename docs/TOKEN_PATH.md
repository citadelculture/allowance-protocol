# Token Path

Allow Protocol can become tokenized, but the token should not lead the project.

## Possible Token Utility

The token can be useful if it secures behavior that the network already needs:

- Merchant staking for higher trust tiers
- Slashing for false endpoint claims or unresolved disputes
- Fee discounts for high-volume policy evaluation
- Governance over public risk taxonomies
- Routing priority for verified merchants
- Grants to builders integrating Allow middleware

## Avoid

- Promising price appreciation
- Selling the token as the reason to use the product
- Emissions without usage
- Treasury control by one hot wallet
- Liquidity that depends on fake volume
- Hidden influencer allocations

## Suggested Supply Sketch

This is a placeholder, not a launch instruction.

- 35 percent ecosystem and grants
- 20 percent protocol treasury
- 17 percent team with four-year vesting and one-year cliff
- 13 percent early builders and advisors with vesting
- 10 percent liquidity and market operations
- 5 percent public community allocation

## Launch Gate

Do not deploy the token. The only allowed next step is legal-review readiness, and even that requires:

- working product
- visible usage
- public risk disclosures
- multisig treasury
- independent contract review
- passing deployment manifest with token launch and transferability disabled
- clear jurisdictional advice

Run:

```bash
npm run token-governance -- ops/token_governance.json
```

The manifest must keep launch, transfers, sale, airdrop, liquidity, market-making, influencer promotion, and return claims disabled. `legal_review_ready` requires at least 100 active agents, 50 merchants, 10,000 credible receipts, and 20 percent third-party receipt share, plus counsel, multisig, review, external approval, and evidence bundle references.

## First Token-Adjacent Mechanism

Before a transferable token, launch non-transferable merchant reputation points backed by receipt history. This gives the network a primitive to learn from without creating immediate speculation.
