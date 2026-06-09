# Distribution Claims

Allow public distribution should be product-led and evidence-led.

The launch-pack validator blocks claims that would make the project look like a token promotion or investment solicitation.

## Blocked Claims

- guaranteed, risk-free, or no-risk outcomes
- profit, yield, APY, passive income, or investment-return promises
- price-hype language such as `100x`, `moon`, `pump`, or price targets
- token sale, presale, airdrop, whitelist, ICO, or token-launch calls
- market-cap or valuation promises
- investment-call language such as `buy now`, `invest now`, or `not financial advice`
- partnership, backing, endorsement, or integration claims without explicit approval
- quantified usage claims without an evidence reference

## Evidence Rule

Usage claims require evidence. For example:

```json
{
  "text": "Allow processed 1000 receipts this week.",
  "evidenceRef": "metrics-report:2026-06-08"
}
```

Claims about receipts, merchants, agents, users, integrations, pilots, or partners should come from `npm run metrics-report`, `npm run pilot-report`, `npm run merchant-directory`, or an approved merchant evidence packet.

For pilot usage claims, prefer an approved disclosure packet:

```bash
npm run pilot-disclosure -- ops/approved-pilot-disclosure.json ops/gateway-receipts.pilot.jsonl
```

When running the X launch-pack validator, pass approved disclosure paths so quantified usage claims can be checked against merchant-approved evidence:

```bash
ALLOW_DISCLOSURE_PATHS=ops/approved-pilot-disclosure.json \
ALLOW_RECEIPT_LOG=ops/gateway-receipts.pilot.jsonl \
npm run launch-pack
```

## Posting Rule

`npm run launch-pack` must pass before a post is approved.

The tool is not a legal opinion. It is a fail-closed product control that keeps draft posts aligned with the project posture:

- no token at launch
- usage first
- public metrics must be labeled as local, testnet, or mainnet
- partner claims require explicit approval
- paid endorsements or promotions require disclosure and legal review

## Reference Principles

- FTC advertising substantiation guidance says objective advertising claims need a reasonable basis before publication: https://www.ftc.gov/legal-library/browse/ftc-policy-statement-regarding-advertising-substantiation
- FTC endorsement guidance says endorsements and material connections should not mislead consumers: https://www.ftc.gov/news-events/topics/truth-advertising/advertisement-endorsements
- SEC investor alerts warn that social media can be used for investment fraud and that unsolicited investment opportunities should be treated cautiously: https://www.sec.gov/investor/alerts/socialmediaandfraud.pdf
- SEC statements on virtual token promotions warn about undisclosed paid promotion and investment claims: https://www.sec.gov/newsroom/speeches-statements/statement-potentially-unlawful-promotion-icos
