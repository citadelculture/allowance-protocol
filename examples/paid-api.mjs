import { createServer } from "node:http";
import { createPaidRoute, DEFAULT_POLICY } from "../src/index.mjs";

const port = Number(process.env.PORT || 4180);
const host = process.env.HOST || "127.0.0.1";
const receipts = [];

function sendJson(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(JSON.stringify(body, null, 2));
}

const paidSearch = createPaidRoute({
  policy: { ...DEFAULT_POLICY, spentTodayUsd: 0 },
  receipts,
  merchantId: "mcp_search",
  amountUsd: 0.018,
  resourceFromRequest: (req) => new URL(req.url, "http://localhost").pathname,
  metadataFromRequest: (req) => req.headers["x-allow-metadata"] || "",
  handler: (req, res) => {
    receipts.unshift(req.allow.receipt);
    sendJson(res, 200, {
      ok: true,
      receipt: req.allow.receipt,
      results: [
        "Autonomous payments need allowances before they need larger wallets",
        "A denied receipt is useful evidence, not a failed conversion"
      ]
    });
  }
});

const server = createServer(async (req, res) => {
  if (req.method === "GET" && req.url.startsWith("/paid-search")) {
    await paidSearch(req, res);
    return;
  }

  sendJson(res, 404, {
    error: "Not found",
    try: "/paid-search?q=x402 with header x-allow-metadata: public search"
  });
});

server.listen(port, host, () => {
  console.log(`Example paid API running at http://${host}:${port}`);
});
