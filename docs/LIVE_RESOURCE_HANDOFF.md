# Live Resource Handoff

The live resource handoff records whether the owner-controlled Base wallet, X account/API access, and optional website path are ready for action-time approval.

```bash
npm run live-resource-handoff -- ops/live_resource_handoff.template.json
```

The manifest must contain only public or redacted information:

- public Base wallet address
- maximum launch budget and per-action cap
- X handle and API readiness flags
- website URL or publication status
- explicit confirmation that action-time approval is still required

## Never Include

Do not store private keys, seed phrases, API keys, bearer tokens, OAuth secrets, refresh tokens, or deployment secrets in the repository.

The validator fails if secret-like fields or common secret literals are present. It does not post to X, send outreach, sign wallet payloads, deploy contracts, publish a website, move funds, update canonical state, or enable tokens.

## Use In The Launch Flow

1. Fill `ops/live_resource_handoff.template.json` with public/redacted resource readiness.
2. Run `npm run live-resource-handoff`.
3. Keep every external action gated by the existing approval request, approval decision, approved packet preview, and final external-action approval flow.
4. After a real action happens, attach execution evidence before any state update or public claim.
