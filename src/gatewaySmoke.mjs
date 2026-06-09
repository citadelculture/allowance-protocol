import { Readable } from "node:stream";
import { createAllowGatewayHandler, normalizeGatewayConfig } from "./gateway.mjs";
import { DEFAULT_POLICY } from "./policyEngine.mjs";

export async function runLocalGatewaySmoke(configInput = {}, options = {}) {
  const config = normalizeGatewayConfig(configInput);
  const route = config.routes[0];
  const receipts = [];
  const recorded = [];
  const fetchCalls = [];
  const policy = options.policy || { ...DEFAULT_POLICY, spentTodayUsd: 0 };
  const upstreamStatus = Number(options.upstreamStatus || 200);
  const handler = createAllowGatewayHandler({
    config,
    policy,
    merchants: options.merchants || config.merchants,
    receipts,
    receiptStore: {
      async record(entry) {
        recorded.push(entry);
      }
    },
    fetchImpl: async (url, init) => {
      fetchCalls.push({ url, init });
      return new Response(
        JSON.stringify({
          ok: true,
          upstream: "local-gateway-smoke",
          allowReceipt: init.headers["x-allow-receipt"] || null
        }),
        {
          status: upstreamStatus,
          headers: {
            "content-type": "application/json; charset=utf-8"
          }
        }
      );
    }
  });

  const health = await invokeGateway(handler, { url: "/health" });
  const allowed = await invokeGateway(handler, {
    url: `${route.pathPrefix}?allow_test=public`,
    headers: {
      "x-allow-nonce": `${route.merchantId}-local-allow-001`,
      "x-allow-metadata": "public request",
      "content-type": "application/json"
    }
  });
  const denied = await invokeGateway(handler, {
    url: `${route.pathPrefix}?allow_test=pii`,
    headers: {
      "x-allow-nonce": `${route.merchantId}-local-deny-001`,
      "x-allow-metadata": "email alex@example.com"
    }
  });

  const checks = [
    smokeCheck("health.ok", health.status === 200 && health.body?.ok === true, "Gateway health endpoint returned ok"),
    smokeCheck("allow.upstream", allowed.status >= 200 && allowed.status < 300, "Allowed request reached upstream"),
    smokeCheck("allow.decision", allowed.headers["x-allow-decision"] === "allow", "Allowed request returned Allow decision headers"),
    smokeCheck("deny.guard", denied.status === 402, "Denied request returned 402 guard response"),
    smokeCheck("deny.reason", denied.body?.evaluation?.reasons?.some((reason) => reason.includes("restricted data")), "Denied request explains metadata restriction"),
    smokeCheck("fetch.once", fetchCalls.length === 1, "Only the allowed request reached upstream"),
    smokeCheck("receipts.recorded", recorded.length === 2, "Allowed and denied receipts were recorded"),
    smokeCheck("evidence.local", recorded.every((entry) => entry.evidence?.environment === "local"), "Smoke receipts are marked local-only evidence")
  ];

  return {
    valid: checks.every((check) => check.status === "pass"),
    generatedAt: new Date().toISOString(),
    gateway: config.name,
    route: {
      pathPrefix: route.pathPrefix,
      merchantId: route.merchantId,
      amountUsd: route.amountUsd
    },
    checks,
    results: {
      health,
      allowed,
      denied
    },
    upstreamCalls: fetchCalls.map((call) => ({
      url: call.url,
      method: call.init?.method || "GET",
      receipt: call.init?.headers?.["x-allow-receipt"] || null
    })),
    receipts: recorded.map((entry) => ({
      merchantId: entry.merchantId,
      decision: entry.decision,
      upstreamStatus: entry.upstreamStatus,
      evidence: entry.evidence,
      receiptId: entry.receipt?.id || null
    })),
    warnings: [
      "Local gateway smoke proves integration behavior only; it is not merchant-approved pilot evidence."
    ]
  };
}

export async function invokeGateway(handler, request = {}) {
  const req = mockReq(request);
  const res = mockRes();
  await handler(req, res);
  return {
    status: res.state.status,
    headers: res.state.headers,
    body: parseJsonBody(res.state.body)
  };
}

function mockReq({ headers = {}, method = "GET", url = "/", body = "" } = {}) {
  const req = Readable.from(body ? [body] : []);
  req.headers = headers;
  req.method = method;
  req.url = url;
  return req;
}

function mockRes() {
  const state = {
    status: null,
    headers: {},
    body: Buffer.alloc(0)
  };

  return {
    state,
    setHeader(key, value) {
      state.headers[String(key).toLowerCase()] = String(value);
    },
    writeHead(status, headers = {}) {
      state.status = status;
      for (const [key, value] of Object.entries(headers)) {
        state.headers[String(key).toLowerCase()] = String(value);
      }
    },
    end(chunk = "") {
      const next = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
      state.body = Buffer.concat([state.body, next]);
    }
  };
}

function smokeCheck(id, condition, message) {
  return {
    id,
    status: condition ? "pass" : "fail",
    message
  };
}

function parseJsonBody(body) {
  try {
    return JSON.parse(body.toString());
  } catch {
    return null;
  }
}
