# Pilot Disclosure

Pilot receipts are private operational evidence until the merchant approves a redacted public disclosure packet.

Use this gate before public usage claims, directory proof links, screenshots, or case studies.

## Command

```bash
npm run pilot-disclosure -- ops/pilot_disclosure_template.json ops/gateway-receipts.local.jsonl
```

The template exits nonzero. It is only a shape for real merchant-approved evidence.

## Packet Requirements

An approved packet must include:

- `status: "approved"`
- a stable `disclosureId` and `evidenceRef`
- the merchant id
- receipt ids for the selected evidence
- a public summary
- redacted metrics that do not overstate selected receipts
- merchant approval with `scope` containing `public_metrics`
- redaction attestations for raw metadata, personal data, secrets, and receipt-id-only references

For a live merchant directory listing, `merchantApproval.scope` must also include `merchant_directory`, and `npm run merchant-promotion` must pass.

The selected receipts must pass the same credible pilot rule as `npm run pilot-report`: merchant-approved testnet or mainnet evidence with at least one allowed 2xx delivery and one denied guard receipt for the same merchant.

## Public Claims

Quantified usage claims in the X launch pack require a valid disclosure evidence reference when the launch-pack CLI is run.

```bash
ALLOW_DISCLOSURE_PATHS=ops/approved-pilot-disclosure.json \
ALLOW_RECEIPT_LOG=ops/gateway-receipts.pilot.jsonl \
npm run launch-pack
```

If a post says `2 receipts`, `1 pilot`, `3 merchants`, or similar, its `evidenceRef` must match a valid disclosure packet.

## Redaction Boundary

Disclosure packets must not include:

- raw prompts or request bodies
- headers, authorization values, payment payloads, or x402 payment headers
- raw metadata or full request metadata
- private keys, seed phrases, API keys, or other secrets
- raw email addresses or phone numbers

Use receipt ids, reason categories, environment labels, and merchant-approved metrics instead.

## Evidence Boundary

`npm run pilot-disclosure` does not publish content, contact merchants, move funds, or store secrets. It only validates that a future public claim has merchant-approved evidence behind it.
