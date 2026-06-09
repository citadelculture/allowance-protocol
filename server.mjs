import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluatePaymentIntentAsync } from "./src/policyEngine.mjs";
import { preflightPaymentAsync } from "./src/httpPreflight.mjs";
import { createPaidRoute } from "./src/httpMiddleware.mjs";
import { buildBuilderQuickstartApiResponse } from "./src/builderQuickstartApi.mjs";
import {
  agentIntentVerifierFromEnv,
  assertProductionRuntimeReady,
  loadPolicyFromEnv,
  policyVerifierFromEnv,
  runtimeMode
} from "./src/runtimeConfig.mjs";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "127.0.0.1";
const policyVerifier = policyVerifierFromEnv(process.env);
const agentIntentVerifier = agentIntentVerifierFromEnv(process.env);
const mode = runtimeMode(process.env);
const runtimePolicy = await loadPolicyFromEnv(process.env);
const runtimeReadiness = assertProductionRuntimeReady(process.env, runtimePolicy);

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8"
};

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function sendJson(res, status, body) {
  const json = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(json);
}

function sendApiResponse(res, response) {
  const json = JSON.stringify(response.body, null, 2);
  res.writeHead(response.status, {
    "content-type": "application/json; charset=utf-8",
    ...response.headers
  });
  res.end(json);
}

const paidSearchReceipts = [];

const paidSearchRoute = createPaidRoute({
  policy: runtimePolicy,
  receipts: paidSearchReceipts,
  policyVerifier,
  agentIntentVerifier,
  merchantId: "mcp_search",
  amountUsd: 0.018,
  resourceFromRequest: (req) => new URL(req.url, "http://localhost").pathname,
  handler: (req, res) => {
    paidSearchReceipts.unshift(req.allow.receipt);
    sendJson(res, 200, {
      ok: true,
      protocol: "allow",
      merchant: "mcp_search",
      query: new URL(req.url, "http://localhost").searchParams.get("q") || "agent payments",
      receipt: req.allow.receipt,
      results: [
        {
          title: "Agent allowances are becoming payment infrastructure",
          score: 0.94
        },
        {
          title: "Receipt-first APIs can expose machine-readable spend controls",
          score: 0.88
        }
      ]
    });
  }
});

async function serveStatic(req, res) {
  const url = new URL(req.url, "http://localhost");
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const safePath = normalize(requested).replace(/^(\.\.[/\\])+/, "");
  const absolutePath = join(root, safePath);

  if (!absolutePath.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const bytes = await readFile(absolutePath);
    res.writeHead(200, {
      "content-type": mime[extname(absolutePath)] || "application/octet-stream",
      "cache-control": "no-store"
    });
    res.end(req.method === "HEAD" ? undefined : bytes);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

// Live registry snapshot, cached so dashboard refreshes don't hammer the RPC.
// Read-only; degrades gracefully when the runtime has no network access.
let liveRegistryCache = { at: 0, body: null };
async function liveRegistrySnapshot() {
  if (Date.now() - liveRegistryCache.at < 60_000 && liveRegistryCache.body) return liveRegistryCache.body;
  const { allowanceRegistryDeployment } = await import("./src/deployments.mjs");
  const deployment = allowanceRegistryDeployment("base");
  try {
    const { createPublicClient, http } = await import("viem");
    const { base } = await import("viem/chains");
    const { createRegistryEvents } = await import("./src/registryEvents.mjs");
    const client = createPublicClient({ chain: base, transport: http("https://mainnet.base.org") });
    const events = createRegistryEvents({ client, maxBlockRange: 1400 });
    const [policies, receipts] = await Promise.all([
      events.getPolicyCreatedEvents(),
      events.getReceiptRecordedEvents()
    ]);
    liveRegistryCache = {
      at: Date.now(),
      body: {
        live: true,
        address: deployment.address,
        chain: deployment.chain,
        explorer: deployment.explorer,
        policiesCreated: policies.length,
        receiptsRecorded: receipts.length,
        lastActivityBlock: Number([...policies, ...receipts].map((e) => e.blockNumber).sort((a, b) => (a < b ? -1 : 1)).at(-1) ?? 0) || null,
        checkedAt: new Date().toISOString()
      }
    };
  } catch (error) {
    liveRegistryCache = {
      at: Date.now(),
      body: { live: false, address: deployment.address, chain: deployment.chain, explorer: deployment.explorer, error: "registry unreachable from this runtime" }
    };
  }
  return liveRegistryCache.body;
}

const server = createServer(async (req, res) => {
  const requestUrl = new URL(req.url, "http://localhost");

  if (req.method === "GET" && requestUrl.pathname === "/api/registry/live") {
    sendApiResponse(res, { status: 200, body: await liveRegistrySnapshot() });
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/api/builder/quickstart") {
    const result = buildBuilderQuickstartApiResponse(
      {
        req,
        policy: runtimePolicy
      },
      {
        policyVerifier,
        agentIntentVerifier
      }
    );
    sendApiResponse(res, result);
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/api/builder/quickstart") {
    try {
      const body = await readBody(req);
      const result = buildBuilderQuickstartApiResponse(
        {
          req,
          body,
          policy: runtimePolicy
        },
        {
          policyVerifier,
          agentIntentVerifier
        }
      );
      sendApiResponse(res, result);
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/api/policy/evaluate") {
    try {
      const body = await readBody(req);
      const result = await evaluatePaymentIntentAsync(
        body.intent,
        { ...runtimePolicy, ...body.policy },
        body.receipts || [],
        {
          policyVerifier: { ...policyVerifier, ...(body.policyVerifier || {}) },
          agentIntentVerifier: { ...agentIntentVerifier, ...(body.agentIntentVerifier || {}) }
        }
      );
      sendJson(res, 200, result);
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/api/x402/preflight") {
    try {
      const body = await readBody(req);
      const result = await preflightPaymentAsync({
        ...body,
        headers: { ...req.headers, ...(body.headers || {}) },
        policyVerifier: { ...policyVerifier, ...(body.policyVerifier || {}) },
        agentIntentVerifier: { ...agentIntentVerifier, ...(body.agentIntentVerifier || {}) }
      });

      res.writeHead(result.status, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        ...result.headers
      });
      res.end(JSON.stringify(result.body, null, 2));
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  if (req.method === "GET" && requestUrl.pathname.startsWith("/api/demo/paid-search")) {
    try {
      await paidSearchRoute(req, res);
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return;
  }

  if (req.method === "GET" || req.method === "HEAD") {
    await serveStatic(req, res);
    return;
  }

  res.writeHead(405, { "content-type": "text/plain; charset=utf-8" });
  res.end("Method not allowed");
});

server.listen(port, host, () => {
  console.log(`Allow Protocol running at http://${host}:${port} (${mode})`);
  if (runtimeReadiness.mode === "production") console.log("Production runtime guard: signed agent intents required");
});
