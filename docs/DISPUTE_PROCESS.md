# Dispute Process

Allow records receipt-bound disputes so pilot merchants and agent operators can review billing, denial, settlement, or abuse issues without exposing raw request metadata.

Validate a dispute packet:

```bash
npm run validate-dispute -- ops/dispute_template.json
```

Require a final resolution before closing an issue:

```bash
ALLOW_REQUIRE_DISPUTE_RESOLUTION=1 npm run validate-dispute -- ops/dispute_template.json
```

## Packet Rules

- Tie every dispute to one or more receipt ids.
- Include a merchant id, category, severity, status, requested outcome, requester role, and requester contact.
- Reference evidence by receipt log path, metrics report, signed merchant profile, or approved merchant evidence packet.
- Do not include raw prompts, raw request metadata, private keys, seed phrases, email addresses, phone numbers, or payment secrets.
- Keep refunds and settlement reversals outside Allow unless a separately reviewed escrow or payment flow exists.

## Categories

- `billing`
- `incorrect_denial`
- `unsafe_allow`
- `settlement`
- `refund`
- `abuse`
- `other`

## Closure Rule

A pilot dispute is closed only when:

- the dispute packet validates
- `status` is `resolved`, `rejected`, or `withdrawn`
- merchant-visible evidence uses receipt ids and hashes instead of raw private metadata
- any refund or settlement action is handled by the merchant or facilitator, not by Allow custody

Receipts are evidence for review, not an audit guarantee.
