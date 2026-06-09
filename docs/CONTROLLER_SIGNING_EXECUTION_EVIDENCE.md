# Controller Signing Execution Evidence

Controller signing execution evidence is the post-signing audit record for one approved `controller_policy_signature` external action.

Run:

```bash
npm run controller-signing-execution-evidence -- ops/controller_signing_execution_template.json
```

The template exits nonzero until it includes:

- the final approved `controller_policy_signature` external-action packet
- `approvalRef` pointing to that packet id
- the post-signature production policy JSON
- human signing details with automation disabled
- proof that no private key material was exposed or left in runtime env
- storage handoff details for the signed policy path or secret store
- production ceremony env requiring `ALLOW_PRODUCTION=1` and `ALLOW_REQUIRE_AGENT_SIGNATURE=1`
- redacted proof, such as a ceremony-audit capture or secret-store receipt

## Boundary

This command does not sign typed data, approve the external action, store the signed policy, start production runtime, move funds, or store secrets. It only validates the evidence record created after a human signs and stores the production policy.

Passing evidence still does not run a pilot, create receipts, mark merchants live, or unlock token work.
