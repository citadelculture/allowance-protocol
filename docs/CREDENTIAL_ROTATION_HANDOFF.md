# Credential Rotation Handoff

`npm run credential-rotation-handoff` writes `work/credential-rotation-handoff.md`, a local owner checklist for containing exposed wallet/API credentials before any live Allow Protocol action.

```bash
npm run credential-rotation-handoff
```

The handoff reads the redacted incident record and the credential rotation action-pack model. It does not move funds, revoke tokens, store secrets, store replacement credentials, post to X, send outreach, sign wallet payloads, deploy contracts, start runtime, update state, or enable a token.

## Inputs

Override the incident source or output path with:

```bash
ALLOW_SECRET_EXPOSURE_INCIDENT_PATH=ops/secret_exposure_incident.template.json
ALLOW_CREDENTIAL_ROTATION_HANDOFF_PATH=work/credential-rotation-handoff.md
npm run credential-rotation-handoff
```

## Owner Flow

- Complete each owner-only wallet/provider action outside the repository.
- Update only redacted proof references and ISO-8601 timestamps in the incident record.
- Rerun `npm run secret-exposure-response`, `npm run live-resource-handoff`, `npm run readiness`, and `npm run operate`.

Do not paste private keys, seed phrases, bearer tokens, API keys, access tokens, refresh tokens, screenshots containing secrets, or replacement credentials into chat, repository files, action packets, or evidence records.
