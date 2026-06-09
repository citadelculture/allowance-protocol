# Merchant Directory

Allow keeps a local merchant directory for paid endpoints that want agent traffic under spending policy.

The directory is not a marketplace launch claim. Entries must stay in `candidate` or `pilot_ready` until there is merchant approval, receipt evidence, and public proof for a `live` status.

## Validate

```bash
npm run merchant-directory
```

The validator checks:

- endpoint type and URL
- pricing model and unit price
- payment protocol, asset, and chain
- integration surfaces
- metadata risk class and tags
- receipt fields
- refund and dispute contact metadata
- EIP-712 profile signature recovery for `live` listings
- review freshness

Before changing a merchant to `live`, also run:

```bash
npm run merchant-promotion -- ops/merchant_promotion_template.json ops/merchant_directory.json ops/pilot_disclosure_template.json ops/gateway-receipts.local.jsonl
```

This binds the live profile signature to merchant-approved receipt evidence and a disclosure packet scoped for `merchant_directory`.

## Statuses

- `candidate`: needs merchant confirmation before testing.
- `pilot_ready`: has enough metadata to run a controlled pilot.
- `live`: approved for public listing with evidence and proof.
- `paused`: temporarily unavailable or under review.

## Listing Rules

- Do not list sensitive metadata directly.
- Do not mark a merchant `live` without a public proof link, EIP-712 merchant profile signature that passes `npm run merchant-directory`, and a passing `npm run merchant-promotion` report.
- Keep pilot refund and dispute rules explicit.
- Keep receipt support mandatory for every listed merchant.
- Review entries at least every 90 days.
