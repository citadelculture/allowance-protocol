# Demo Integration Packet

`npm run demo-integration-packet` builds a copyable packet for API and MCP builders evaluating Allow Protocol. It reuses the local policy engine and x402-compatible preflight response so the packet mirrors the dashboard behavior.

The packet includes:

- the payment intent fields a client must send,
- the policy fingerprint and budget envelope,
- the `x-allow-*` request and response headers,
- the receipt returned by the preflight decision,
- x402-compatible payment requirement metadata,
- negative-control tests for nonce replay, PII metadata, and blocked categories.

The command reads `ops/demo_integration_packet.template.json` by default. Pass a different JSON file to test another merchant or decision path:

```sh
npm run demo-integration-packet -- ./ops/demo_integration_packet.template.json
```

This artifact is descriptive only. It does not post content, send outreach, deploy contracts, sign wallet payloads, move funds, store secrets, use private keys, use API tokens, publish the website, or start pilot traffic. Live use still requires owner-side approval and separately validated execution evidence.
