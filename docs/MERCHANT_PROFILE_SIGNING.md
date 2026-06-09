# Merchant Profile Signing

Merchant profiles are signed before a listing can be marked `live`.

Candidate and pilot-ready entries may remain unsigned while discovery is in progress. Live entries must include:

- `signer`
- `merchantSignature`
- `signatureMode: "eip712"`
- `publicProof`

Sign a profile:

```bash
ALLOW_MERCHANT_PRIVATE_KEY=0x... npm run sign-merchant-profile -- ops/merchant-profile.local.json
```

Verify a signed profile:

```bash
npm run verify-merchant-profile -- ops/signed-merchant-profile.local.json
```

Verify every `live` listing in the merchant directory:

```bash
npm run merchant-directory
```

The EIP-712 payload signs hashes of the endpoint, pricing, payment, risk, receipt, and surface metadata. It does not sign raw sensitive request metadata.

## Listing Rule

Do not mark a merchant directory entry `live` until the merchant has approved the listing, signed the profile, supplied public proof or an approved announcement link, and passed directory signature validation.
