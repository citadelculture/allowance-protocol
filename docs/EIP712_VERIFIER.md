# EIP-712 Verifier Path

Allow now exposes a typed-data verifier boundary for controller-owned policies.

## What Exists

- `buildPolicyTypedData(policy, fingerprint)` builds the `AllowPolicy` typed-data object.
- `verifyPolicySignature(policy, fingerprint, options)` validates demo signatures locally or delegates sync EIP-712 recovery to an injected verifier.
- `verifyPolicySignatureAsync(policy, fingerprint, options)` recovers EIP-712 signers with `viem` when no custom recovery function is supplied.
- `evaluatePaymentIntent(..., { policyVerifier })` passes sync signature verification into the policy decision path.
- `evaluatePaymentIntentAsync(..., { policyVerifier })` supports audited async recovery through `viem`.
- `createPaidRoute({ policyVerifier })` and `createAllowPreflightMiddleware({ policyVerifier })` support the same verifier.

## Demo Mode

Demo mode accepts:

```text
sig_demo_<policyFingerprint>
```

This is only for local testing. It is intentionally visible in warnings:

```text
Demo policy signature accepted; replace with EIP-712 verification before production
```

## EIP-712 Mode

Production callers should inject a recovery function:

```js
const result = evaluatePaymentIntent(intent, policy, receipts, {
  policyVerifier: {
    mode: "eip712",
    recoverController: ({ typedData, signature }) => {
      return recoverAddressWithAuditedLibrary({ typedData, signature });
    }
  }
});
```

Allow rejects the policy if the recovered controller does not match `policy.controller`.

The default async production path uses `viem`:

```js
const result = await evaluatePaymentIntentAsync(intent, policy, receipts, {
  policyVerifier: {
    mode: "eip712",
    production: true
  }
});
```

Server runtime production mode also forces EIP-712:

```bash
ALLOW_PRODUCTION=1 ALLOW_REQUIRE_AGENT_SIGNATURE=1 ALLOW_POLICY_PATH=ops/signed-policy.local.json npm start
```

or:

```bash
NODE_ENV=production ALLOW_REQUIRE_AGENT_SIGNATURE=1 ALLOW_POLICY_PATH=ops/signed-policy.local.json npm start
```

In production mode, demo policy signatures are denied and agent intent signatures are required.

Production mode requires a signed policy:

```bash
ALLOW_PRODUCTION=1 ALLOW_REQUIRE_AGENT_SIGNATURE=1 ALLOW_POLICY_PATH=ops/signed-policy.local.json npm start
```

or:

```bash
ALLOW_PRODUCTION=1 ALLOW_REQUIRE_AGENT_SIGNATURE=1 ALLOW_POLICY_JSON='{"policyId":"..."}' npm start
```

For local smoke tests only, explicitly allow the deterministic fixture:

```bash
ALLOW_PRODUCTION=1 ALLOW_REQUIRE_AGENT_SIGNATURE=1 ALLOW_USE_FIXTURE=1 npm start
```

The fixture is a deterministic EIP-712 policy used only for smoke tests and local verification; it is not a treasury, user wallet, or deployed production controller.

## Signing A Policy

Preferred no-secret handoff:

```bash
npm run policy-signing-packet -- allow-policy.example.json 0x1111111111111111111111111111111111111111
```

This prints the unsigned production policy and EIP-712 typed data for the controller wallet to sign outside the repository.

Fallback for a local-only controller key:

```bash
ALLOW_CONTROLLER_PRIVATE_KEY=0x... npm run sign-policy
```

Optional template:

```bash
ALLOW_CONTROLLER_PRIVATE_KEY=0x... ALLOW_POLICY_TEMPLATE=allow-policy.example.json npm run sign-policy
```

The command prints signed policy JSON. It does not store or transmit the private key.

## Required Before Mainnet

- Recover the controller from the exact typed-data payload.
- Require valid address-shaped `controller`, `verifyingContract`, and chain id.
- Keep known-signature fixtures in tests.
- Keep demo mode disabled in production deployments.
- Use `ALLOW_POLICY_PATH` or `ALLOW_POLICY_JSON` with a real controller-signed policy before any public deployment.
