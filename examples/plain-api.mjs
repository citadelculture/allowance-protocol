import { createServer } from "node:http";

const port = Number(process.env.PORT || 4181);
const host = process.env.HOST || "127.0.0.1";

function sendJson(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(JSON.stringify(body, null, 2));
}

const server = createServer(async (req, res) => {
  if (req.method === "GET" && req.url.startsWith("/paid-search")) {
    const url = new URL(req.url, "http://localhost");
    sendJson(res, 200, {
      ok: true,
      upstream: "plain-api",
      query: url.searchParams.get("q") || url.searchParams.get("allow_test") || "agent payments",
      allowReceipt: req.headers["x-allow-receipt"] || null,
      results: [
        "Plain API response protected by the Allow gateway",
        "The upstream service does not need Allow-specific middleware"
      ]
    });
    return;
  }

  sendJson(res, 404, {
    error: "Not found",
    try: "/paid-search?q=x402"
  });
});

server.listen(port, host, () => {
  console.log(`Plain upstream API running at http://${host}:${port}`);
});
