# Rate Limits

Allow rate limits protect paid routes before policy evaluation and before upstream delivery.

The default key is built from:

- policy controller
- policy agent id
- route id
- request remote address

This keeps the limiter server-side by default. Do not rely on client-provided headers as the only production identity source.

## Paid Route

```js
const paidSearchRoute = createPaidRoute({
  policy,
  merchantId: "mcp_search",
  amountUsd: 0.018,
  rateLimit: {
    max: 60,
    windowMs: 60_000
  },
  handler
});
```

## Gateway

```json
{
  "rateLimit": {
    "max": 60,
    "windowMs": 60000
  },
  "routes": [
    {
      "pathPrefix": "/paid-search",
      "merchantId": "mcp_search",
      "amountUsd": 0.018
    }
  ]
}
```

Routes can also define their own `rateLimit` object. Over-limit requests return `429` with:

- `x-allow-rate-limit`
- `x-allow-rate-limit-remaining`
- `x-allow-rate-limit-reset`
- `retry-after`

Rate-limited requests are not recorded as policy receipts because no payment decision was made.
