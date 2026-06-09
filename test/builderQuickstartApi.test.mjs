import assert from "node:assert/strict";
import { DEFAULT_POLICY } from "../src/policyEngine.mjs";
import {
  buildBuilderQuickstartApiResponse,
  serverFromRequest
} from "../src/builderQuickstartApi.mjs";

const server = serverFromRequest({
  headers: {
    host: "127.0.0.1:4174"
  }
});

assert.deepEqual(server, {
  protocol: "http",
  host: "127.0.0.1",
  port: 4174
});

const forwarded = serverFromRequest({
  headers: {
    "x-forwarded-proto": "https",
    "x-forwarded-host": "allow.example"
  }
});

assert.deepEqual(forwarded, {
  protocol: "https",
  host: "allow.example",
  port: 443
});

const forwardedResponse = buildBuilderQuickstartApiResponse(
  {
    req: {
      headers: {
        "x-forwarded-proto": "https",
        "x-forwarded-host": "allow.example"
      }
    },
    policy: DEFAULT_POLICY
  },
  {
    generatedAt: "2026-06-09T15:50:30.000Z"
  }
);

assert.equal(forwardedResponse.status, 200);
assert.equal(forwardedResponse.body.report.server.origin, "https://allow.example");
assert.equal(forwardedResponse.body.report.curlCommands.quickstartReport, "curl -s 'https://allow.example/api/builder/quickstart'");

const response = buildBuilderQuickstartApiResponse(
  {
    req: {
      headers: {
        host: "127.0.0.1:4174"
      }
    },
    policy: DEFAULT_POLICY
  },
  {
    generatedAt: "2026-06-09T15:50:00.000Z"
  }
);

assert.equal(response.status, 200);
assert.equal(response.headers["x-allow-project"], "allow-protocol");
assert.equal(response.headers["x-allow-builder-quickstart"], "ready");
assert.equal(response.body.protocol, "allow");
assert.equal(response.body.report.valid, true);
assert.equal(response.body.report.server.origin, "http://127.0.0.1:4174");
assert.equal(response.body.report.scenarios.length, 4);
assert.equal(response.body.report.curlCommands.quickstartReport, "curl -s 'http://127.0.0.1:4174/api/builder/quickstart'");
assert.equal(response.body.evidenceBoundary.usesPrivateKeys, false);
assert.equal(response.body.evidenceBoundary.usesApiTokens, false);
assert.equal(response.body.evidenceBoundary.movesFunds, false);

const customIntent = buildBuilderQuickstartApiResponse(
  {
    req: {
      headers: {
        host: "localhost:4174"
      }
    },
    policy: DEFAULT_POLICY,
    body: {
      intent: {
        merchantId: "mcp_search",
        amountUsd: 0.018,
        resource: "/v1/search?q=custom",
        intentNonce: "api-custom-001",
        metadata: "public custom quickstart"
      }
    }
  },
  {
    generatedAt: "2026-06-09T15:51:00.000Z"
  }
);

assert.equal(customIntent.status, 200);
assert.equal(customIntent.body.report.scenarios[0].intentNonce, "api-custom-001");
assert.ok(customIntent.body.report.curlCommands.allowedPreflight.includes("api-custom-001"));

const unsafe = buildBuilderQuickstartApiResponse({
  req: {
    headers: {
      host: "127.0.0.1:4174"
    }
  },
  policy: DEFAULT_POLICY,
  body: {
    liveExecutionRequested: true
  }
});

assert.equal(unsafe.status, 400);
assert.equal(unsafe.body.report.status, "unsafe_live_execution");
assert.equal(unsafe.body.report.valid, false);

console.log("builderQuickstartApi tests passed");
