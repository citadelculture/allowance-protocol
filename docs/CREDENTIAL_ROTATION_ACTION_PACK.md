# Credential Rotation Action Pack

Generate owner-only rotation steps from the redacted secret exposure incident:

```bash
npm run credential-rotation-action-pack
```

The pack is a checklist, not an executor. It does not move funds, revoke tokens, post to X, sign wallet payloads, deploy contracts, store secrets, or update state.

## Owner Flow

- Move funds from the exposed wallet to a fresh wallet controlled outside this repository.
- Retire the exposed wallet from Allow Protocol handoff manifests.
- Revoke or regenerate exposed X/API credentials in the owning provider console.
- Store replacements only in a local secret manager or deployment provider.
- Update `ops/secret_exposure_incident.template.json` with only redacted proof references and ISO timestamps.
- Rerun `npm run secret-exposure-response`, `npm run live-resource-handoff`, `npm run readiness`, and `npm run operate`.

Do not paste private keys, seed phrases, bearer tokens, API keys, access tokens, refresh tokens, screenshots containing secrets, or replacement credentials into chat, repository files, action packets, or evidence records.
