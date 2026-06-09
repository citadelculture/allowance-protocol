# Secret Exposure Response

If a wallet private key, seed phrase, bearer token, API key, or OAuth secret is pasted into chat or a repository, treat it as compromised.

```bash
npm run secret-exposure-response -- ops/secret_exposure_incident.template.json
npm run credential-rotation-action-pack -- ops/secret_exposure_incident.template.json
```

## Immediate Owner Actions

- Move funds from the exposed wallet to a fresh wallet controlled outside this repository.
- Stop using the exposed wallet for Allow Protocol.
- Revoke the exposed X bearer token in the X developer portal.
- Create replacement credentials only in a local secret manager or deployment provider.
- Record only redacted proof references in the incident file.

## Never Store

Do not put raw private keys, seed phrases, bearer tokens, API keys, access tokens, refresh tokens, OAuth secrets, or deployment secrets in this repository.

The validator fails if secret-like fields or common secret literals appear in the incident record. It does not move funds, revoke tokens, post to X, sign wallet payloads, deploy contracts, store secrets, update canonical state, or enable tokens.

Launch sequencing treats unresolved exposure as a live-action blocker, so X posting, outreach, signing, deployment, pilot traffic, and live merchant promotion remain paused until the incident is contained.

After containment, rerun `npm run live-resource-handoff` with only public/redacted replacement readiness fields.
