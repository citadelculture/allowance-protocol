# Builder Quickstart

`npm run builder-quickstart` creates a local onboarding report for API and MCP builders. It evaluates the same Allow preflight rules used by the dashboard and emits curl commands for the local dev server.

Run:

```sh
npm run builder-quickstart
```

The report covers four local checks:

- allowed metered search preflight,
- PII-like metadata denied with `402`,
- blocked trading category denied with `402`,
- replayed intent nonce denied with `402`.

To exercise the HTTP path, start the local server:

```sh
PORT=4174 npm start
```

Then run the generated curl commands from the report. A passing local integration returns `x-allow-decision`, `x-allow-risk`, `x-allow-policy`, `x-allow-receipt`, and `x-allow-intent-nonce` headers on every preflight decision.

The running demo also exposes the same report as JSON:

```sh
curl -s http://127.0.0.1:4174/api/builder/quickstart
```

Use `POST /api/builder/quickstart` with an `intent` body to test a custom local intent while keeping the server-owned policy:

```sh
curl -s -X POST http://127.0.0.1:4174/api/builder/quickstart \
  -H 'content-type: application/json' \
  -d '{"intent":{"merchantId":"mcp_search","amountUsd":0.018,"resource":"/v1/search?q=custom","intentNonce":"custom-001","metadata":"public custom request"}}'
```

The quickstart is local and descriptive. It does not send network requests, post content, send outreach, sign wallet payloads, deploy contracts, start pilot traffic, move funds, store secrets, use private keys, use API tokens, publish the website, or enable a token.
