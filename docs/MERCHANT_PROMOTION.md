# Live Merchant Promotion

Live merchant listings need more than a valid directory shape. They need merchant approval, credible pilot receipts, a redacted disclosure packet, and an EIP-712 signed live profile.

## Command

```bash
npm run merchant-promotion -- ops/merchant_promotion_template.json ops/merchant_directory.json ops/pilot_disclosure_template.json ops/gateway-receipts.local.jsonl
```

The template exits nonzero. It is a checklist shape, not launch evidence.

## Promotion Rule

A merchant can move to `live` only when:

- the merchant is already present in the directory as `pilot_ready` or `live`
- the proposed merchant profile has `status: "live"`
- `publicProof` is a valid HTTPS URL and matches the signed merchant profile
- the live merchant profile passes EIP-712 signature verification
- the pilot disclosure packet passes `npm run pilot-disclosure`
- the disclosure `merchantApproval.scope` includes `merchant_directory`
- the disclosure evidence reference matches the promotion evidence reference
- the operator approval flags confirm no token claims, proof review, live-listing approval, and signature review

The command does not update the directory. Apply the live entry only after the report passes.

## Evidence Boundary

`npm run merchant-promotion` does not publish content, contact merchants, update files, move funds, or store secrets. It validates that a live listing is backed by merchant-approved proof.
