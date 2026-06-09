# Pilot Agent Binding

Run `npm run pilot-authorization` before pilot binding. Use the emitted `pilot-authorization:<authorizationId>` as `pilot.approvalRef` so the agent wallet, signed policy, and gateway config are bound to the same merchant-approved scope.

Production pilots must bind a real agent wallet before signed payment intents are accepted.

Run:

```bash
npm run validate-pilot-binding -- ops/pilot_binding.template.json ops/signed-policy.local.json
```

The template is intentionally invalid. It should fail until the pilot merchant, agent wallet, signed policy, runtime settings, and approval evidence are filled in.

Before pilot traffic, run the combined live preflight:

```bash
npm run live-pilot-preflight -- ops/pilot_binding.template.json ops/signed-policy.local.json ops/gateway.x402.example.json ops/dispute_template.json
```

This verifies the binding together with signed policy, gateway evidence, settlement requirement, dispute support path, and runtime safety flags.

## Required Evidence

- merchant approval for the pilot endpoint and environment
- a real non-zero EVM agent wallet address
- wallet control evidence, including the deterministic binding challenge and recovered wallet signature
- a non-demo EIP-712 controller-signed policy
- policy `agentAddress` matching the binding wallet
- policy `requireAgentIntentSignature=true`
- policy merchant allowlist containing the pilot merchant
- runtime `ALLOW_REQUIRE_AGENT_SIGNATURE=1`
- runtime `ALLOW_AGENT_ADDRESS` matching the binding wallet
- no `ALLOW_AGENT_PRIVATE_KEY`, no `ALLOW_CONTROLLER_PRIVATE_KEY`, and no fixture runtime for the public pilot

## Scope

This binding does not custody funds and does not authorize trading. It approves one wallet to sign payment intents for one scoped pilot policy. Any new merchant, chain, controller, wallet, spend cap, or policy fingerprint needs a new binding packet.

The wallet challenge is deterministic and includes binding id, merchant id, environment, network, agent id, wallet address, policy id, and policy fingerprint. A signature over a different challenge does not pass.

Keep the binding packet and signed policy out of public posts unless the merchant and operator have approved disclosure.
