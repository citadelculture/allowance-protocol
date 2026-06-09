# Token Governance Lock

Allow has no token at launch. The token path stays locked until product usage, legal review, governance controls, and evidence bundles are strong enough to justify design work.

## Command

```bash
npm run token-governance -- ops/token_governance.json
```

The default manifest should pass as a locked state and warn that legal-review usage thresholds are unmet. Passing this command does not permit a token launch.

## Locked State

While `phase` is `locked`, all token-side-effect fields must be false:

- `launchEnabled`
- `transferable`
- `salePlanned`
- `airdropPlanned`
- `liquidityPlanned`
- `marketMakingPlanned`
- `influencerPromotionPlanned`
- `returnClaimsPlanned`

Public summary text is also checked against the distribution-claims guard.

## Legal Review Readiness

Changing `phase` to `legal_review_ready` requires:

- at least 100 active agents with credible evidence
- at least 50 merchants with credible receipts
- at least 10,000 credible receipts
- at least 20 percent third-party receipt share
- usage evidence bundle reference
- outside counsel reference
- token risk disclosure reference
- treasury multisig reference
- allocation policy reference
- independent counsel, risk disclosure, multisig, contract review, external approval, and evidence bundle approval flags

Even then, `tokenLaunchPermitted` remains false. Legal review readiness is not a launch permission.

## Boundary

`npm run token-governance` does not deploy a token, enable transfers, start a sale, create liquidity, move funds, or permit token launch.
