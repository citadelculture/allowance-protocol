# Production Policy Handoff

`npm run production-policy-handoff` writes `work/production-policy-handoff.md`, a local handoff for moving from the unsigned policy template to a verified controller-signed production policy.

Run:

```sh
npm run production-policy-handoff
```

The handoff packages:

- the no-secret policy signing packet command,
- the controller signing external-action packet command,
- the final external-action approval command,
- the post-signing execution evidence validator,
- `verify-policy`, `ceremony-audit`, readiness, and pilot evidence follow-up commands,
- the current policy-template blockers and signing evidence gaps.

The handoff is local review material only. It does not approve external actions, sign wallet payloads, store signed policies, store secrets, start runtime, start pilot traffic, deploy contracts, move funds, post content, send outreach, or enable a token.

Useful environment overrides:

```sh
ALLOW_EXPECTED_CONTROLLER=0x...
ALLOW_POLICY_TEMPLATE=allow-policy.example.json
ALLOW_CONTROLLER_SIGNING_EXECUTION_EVIDENCE=ops/controller_signing_execution_template.json
ALLOW_PRODUCTION_POLICY_HANDOFF_PATH=work/production-policy-handoff.md
```

Production policy readiness requires:

- a real 20-byte controller wallet address,
- a human-approved `controller_policy_signature` packet,
- wallet-side EIP-712 signing without private-key exposure,
- signed policy JSON stored outside the repository or in a gitignored local path,
- passing `npm run controller-signing-execution-evidence`,
- `ALLOW_POLICY_PATH` or `ALLOW_POLICY_JSON` configured before production runtime or live pilot preflight.
