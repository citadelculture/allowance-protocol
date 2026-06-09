import assert from "node:assert/strict";
import {
  RATE_LIMIT_EXCEEDED,
  createFixedWindowRateLimiter,
  normalizeRateLimitConfig,
  rateLimitKeyFromRequest,
  rateLimitResponse
} from "../src/rateLimit.mjs";

assert.deepEqual(normalizeRateLimitConfig({ max: 2, windowSeconds: 1 }), {
  max: 2,
  windowMs: 1000,
  scope: "policy_agent_route"
});
assert.equal(normalizeRateLimitConfig({ enabled: false }), null);
assert.throws(() => normalizeRateLimitConfig({ max: 0, windowMs: 1000 }), /positive max/);

let now = 0;
const limiter = createFixedWindowRateLimiter({
  max: 2,
  windowMs: 1000,
  now: () => now
});

const first = limiter.check("agent:route");
const second = limiter.check("agent:route");
const third = limiter.check("agent:route");

assert.equal(first.allowed, true);
assert.equal(first.remaining, 1);
assert.equal(second.allowed, true);
assert.equal(second.remaining, 0);
assert.equal(third.allowed, false);
assert.equal(third.retryAfterSeconds, 1);

const blocked = rateLimitResponse(third);
assert.equal(blocked.status, 429);
assert.equal(blocked.body.error, RATE_LIMIT_EXCEEDED);
assert.equal(blocked.headers["retry-after"], "1");

now = 1001;
const reset = limiter.check("agent:route");
assert.equal(reset.allowed, true);
assert.equal(reset.remaining, 1);

const key = rateLimitKeyFromRequest(
  {
    url: "/paid-search",
    headers: {},
    socket: { remoteAddress: "127.0.0.1" }
  },
  {
    policy: {
      controller: "0xController",
      agentId: "agent-alpha"
    },
    route: {
      pathPrefix: "/paid-search"
    }
  }
);

assert.equal(key, "0xController:agent-alpha:/paid-search:127.0.0.1");

console.log("rateLimit tests passed");
