# Controller Signing Ceremony

Use this checklist before any production runtime accepts paid requests. The controller wallet signs the allowance policy; Allow never needs custody of user funds.

## Preconditions

- Dedicated controller wallet selected for policy ownership.
- Production merchant list, caps, metadata rules, and nonce requirement reviewed.
- No private key is pasted into chat, committed to the repository, or stored in `ops/`.
- `ops/signed-policy*.json` and `ops/*.local.json` are ignored by git.

## Ceremony

1. Generate a no-secret signing packet for the intended controller:

```bash
npm run policy-signing-packet -- allow-policy.example.json 0x1111111111111111111111111111111111111111
```

The packet includes the unsigned production policy, EIP-712 typed data, expected signed policy shape, and verification commands. It does not sign anything and does not ask for private-key material.

Before the controller wallet owner signs, generate a draft external action approval packet:

```bash
npm run controller-signing-action-pack -- allow-policy.example.json 0x1111111111111111111111111111111111111111
```

The generated packet has `actionType: "controller_policy_signature"` and must name the exact controller wallet address. Do not put private keys in the packet.

After the controller owner fills approval attribution and every safety flag, run:

```bash
npm run external-action-approval -- <approved-controller-policy-signature-packet.json>
```

2. Sign the packet's `typedData` in the controller wallet and attach the resulting signature to `signedPolicyShape.controllerSignature`.
3. Store the signed JSON in a private or gitignored path such as `ops/signed-policy.local.json`.

Fallback for a local-only signing environment:

```bash
ALLOW_CONTROLLER_PRIVATE_KEY=0x... npm run sign-policy > ops/signed-policy.local.json
```

Never paste the private key into chat, commit it, or leave it in runtime environment variables.

4. Verify that the signed file recovers the expected controller:

```bash
npm run verify-policy -- ops/signed-policy.local.json
```

5. Produce a ceremony audit report:

```bash
ALLOW_EXPECTED_CONTROLLER=0x... \
ALLOW_PRODUCTION=1 \
ALLOW_REQUIRE_AGENT_SIGNATURE=1 \
ALLOW_POLICY_PATH=ops/signed-policy.local.json \
npm run ceremony-audit -- ops/signed-policy.local.json
```

The audit checks the EIP-712 signature, recovered controller, expected controller, production mode, runtime policy source, signed-agent-intent enforcement, fixture disablement, and absence of controller or agent private keys from the runtime environment.

6. Record post-signing execution evidence:

```bash
npm run controller-signing-execution-evidence -- ops/controller_signing_execution_template.json
```

Fill the template with the approved `controller_policy_signature` packet, signed policy JSON, human signing details, storage handoff, ceremony env, and redacted proof. This validates that the signing step happened after final approval and that the signed policy was stored without private-key material.

7. Run a production-mode smoke test with the signed file:

```bash
ALLOW_PRODUCTION=1 ALLOW_REQUIRE_AGENT_SIGNATURE=1 ALLOW_POLICY_PATH=ops/signed-policy.local.json npm start
```

8. Confirm paid routes return receipts with `policySignatureMode=eip712`.
9. Move the signed policy into the deployment secret store or runtime config path.

## Rotation

Rotate the controller when a key is exposed, a policy owner changes, caps materially change, or a launch partner requests a new allowance envelope. Re-run the full ceremony for every rotation.

## Launch Rule

Do not run production with demo signatures. `ALLOW_USE_FIXTURE=1` is only for local smoke tests.
