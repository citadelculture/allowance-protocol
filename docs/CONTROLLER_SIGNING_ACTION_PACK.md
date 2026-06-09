# Controller Signing Action Pack

The controller signing action pack turns a no-secret policy signing packet into a draft `controller_policy_signature` external-action approval packet.

```bash
npm run controller-signing-action-pack -- allow-policy.example.json 0x1111111111111111111111111111111111111111
```

The command exits nonzero until the production policy template is ready for a real controller wallet signature. It prints:

- policy id, controller, and policy fingerprint
- EIP-712 typed data to review in the wallet
- expected signed policy shape
- one draft external-action packet
- verification commands for `verify-policy`, `ceremony-audit`, and runtime smoke

The packet remains unapproved. Before the wallet owner signs, set approval attribution and safety flags, then run:

```bash
npm run external-action-approval -- <approved-controller-policy-signature-packet.json>
```

After the wallet owner signs, attach the signature to `signedPolicyShape.controllerSignature`, store the signed policy in a private or gitignored path, and run:

```bash
npm run verify-policy -- <signed-policy.json>
ALLOW_PRODUCTION=1 ALLOW_REQUIRE_AGENT_SIGNATURE=1 ALLOW_EXPECTED_CONTROLLER=<controller> npm run ceremony-audit -- <signed-policy.json>
```

Then validate the post-signing execution evidence:

```bash
npm run controller-signing-execution-evidence -- ops/controller_signing_execution_template.json
```

Boundary:

- does not sign typed data
- does not request or store private keys
- does not approve the external action
- does not store the signed policy
- does not start production runtime
- does not move funds
