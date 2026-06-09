export const RATE_LIMIT_EXCEEDED = "ALLOW_RATE_LIMIT_EXCEEDED";

export function normalizeRateLimitConfig(config = null) {
  if (!config) return null;
  if (config.enabled === false) return null;

  const max = Number(config.max ?? config.limit ?? 0);
  const windowMs = Number(config.windowMs ?? (config.windowSeconds !== undefined ? config.windowSeconds * 1000 : 0));

  if (!Number.isFinite(max) || max <= 0) {
    throw new Error("Rate limit requires positive max");
  }
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new Error("Rate limit requires positive windowMs");
  }

  return {
    max: Math.floor(max),
    windowMs: Math.floor(windowMs),
    scope: config.scope || "policy_agent_route"
  };
}

export function createFixedWindowRateLimiter(config = {}) {
  const normalized = normalizeRateLimitConfig(config);
  if (!normalized) return null;

  const buckets = new Map();
  const now = typeof config.now === "function" ? config.now : () => Date.now();

  return {
    config: normalized,
    check(key, cost = 1) {
      const safeKey = String(key || "unknown");
      const timestamp = Number(now());
      const windowStartedAt = Math.floor(timestamp / normalized.windowMs) * normalized.windowMs;
      const bucket = buckets.get(safeKey);
      const count = bucket?.windowStartedAt === windowStartedAt ? bucket.count : 0;
      const nextCount = count + Number(cost || 1);
      const resetAt = windowStartedAt + normalized.windowMs;
      const allowed = nextCount <= normalized.max;

      if (allowed) {
        buckets.set(safeKey, {
          windowStartedAt,
          count: nextCount
        });
      }

      return {
        allowed,
        key: safeKey,
        limit: normalized.max,
        remaining: Math.max(0, normalized.max - (allowed ? nextCount : count)),
        resetAt,
        retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil((resetAt - timestamp) / 1000)),
        windowMs: normalized.windowMs,
        count: allowed ? nextCount : count
      };
    },
    reset() {
      buckets.clear();
    },
    snapshot() {
      return [...buckets.entries()].map(([key, bucket]) => ({ key, ...bucket }));
    }
  };
}

export function rateLimitKeyFromRequest(req = {}, context = {}) {
  const policy = context.policy || {};
  const route = context.route || {};
  const controller = policy.controller || headerValue(req.headers, "x-allow-controller") || "unknown-controller";
  const agent = policy.agentId || headerValue(req.headers, "x-allow-agent") || "unknown-agent";
  const routeId = route.pathPrefix || route.resource || context.resource || new URL(req.url || "/", "http://allow.local").pathname;
  const remote = req.socket?.remoteAddress || req.connection?.remoteAddress || "local";

  return [controller, agent, routeId, remote].map((value) => String(value || "unknown")).join(":");
}

export function rateLimitResponse(decision) {
  return {
    status: 429,
    headers: rateLimitHeaders(decision),
    body: {
      protocol: "allow",
      error: RATE_LIMIT_EXCEEDED,
      message: "Request blocked by Allow rate limit",
      rateLimit: {
        key: decision.key,
        limit: decision.limit,
        remaining: decision.remaining,
        resetAt: new Date(decision.resetAt).toISOString(),
        retryAfterSeconds: decision.retryAfterSeconds,
        windowMs: decision.windowMs
      }
    }
  };
}

export function rateLimitHeaders(decision) {
  return {
    "x-allow-rate-limit": String(decision.limit),
    "x-allow-rate-limit-remaining": String(decision.remaining),
    "x-allow-rate-limit-reset": new Date(decision.resetAt).toISOString(),
    "retry-after": String(decision.retryAfterSeconds)
  };
}

function headerValue(headers = {}, name) {
  const value = headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()];
  if (Array.isArray(value)) return value[0];
  return value == null ? "" : String(value);
}
