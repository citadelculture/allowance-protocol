import {
  buildBuilderQuickstartReport,
  publicBuilderQuickstartReport
} from "./builderQuickstart.mjs";

export const BUILDER_QUICKSTART_API_STATUSES = [
  "ready",
  "needs_fixes",
  "unsafe_live_execution"
];

export function buildBuilderQuickstartApiResponse(input = {}, options = {}) {
  const body = input.body && typeof input.body === "object" && !Array.isArray(input.body) ? input.body : {};
  const server = body.server || serverFromRequest(input.req, options.server || {});
  const report = buildBuilderQuickstartReport(
    {
      server,
      intent: body.intent,
      receipts: body.receipts,
      policy: input.policy,
      liveExecutionRequested: body.liveExecutionRequested,
      postToX: body.postToX,
      sendOutreach: body.sendOutreach,
      deployContracts: body.deployContracts,
      transferFunds: body.transferFunds,
      signWalletPayloads: body.signWalletPayloads
    },
    {
      generatedAt: options.generatedAt,
      policyVerifier: options.policyVerifier,
      agentIntentVerifier: options.agentIntentVerifier,
      merchantCatalog: options.merchantCatalog,
      merchants: options.merchants,
      liveExecutionRequested: options.liveExecutionRequested
    }
  );
  const status = report.valid ? 200 : report.status === "unsafe_live_execution" ? 400 : 422;

  return {
    status,
    headers: {
      "cache-control": "no-store",
      "x-allow-project": "allow-protocol",
      "x-allow-builder-quickstart": report.status,
      "x-allow-report-hash": report.reportHash
    },
    body: {
      protocol: "allow",
      message: report.valid
        ? "Builder quickstart smoke checks are ready"
        : "Builder quickstart smoke checks need attention",
      report: publicBuilderQuickstartReport(report),
      evidenceBoundary: boundary()
    }
  };
}

export function serverFromRequest(req = {}, fallback = {}) {
  const headers = req?.headers || {};
  const forwardedHost = firstHeader(headers["x-forwarded-host"]);
  const hostHeader = forwardedHost || firstHeader(headers.host) || `${fallback.host || "127.0.0.1"}:${fallback.port || 4174}`;
  const protocol = firstHeader(headers["x-forwarded-proto"]) || fallback.protocol || "http";
  const parsed = splitHostPort(hostHeader);
  const port = Number(parsed.port || fallback.port || defaultPortFor(protocol));

  return {
    protocol,
    host: parsed.host || fallback.host || "127.0.0.1",
    port
  };
}

function firstHeader(value) {
  if (Array.isArray(value)) return String(value[0] || "").split(",")[0].trim();
  return String(value || "").split(",")[0].trim();
}

function splitHostPort(value) {
  const text = String(value || "").trim();
  if (!text) return { host: "", port: null };

  const bracketMatch = text.match(/^\[([^\]]+)\](?::(\d+))?$/);
  if (bracketMatch) {
    return {
      host: bracketMatch[1],
      port: bracketMatch[2] ? Number(bracketMatch[2]) : null
    };
  }

  const parts = text.split(":");
  if (parts.length > 1 && /^\d+$/.test(parts[parts.length - 1])) {
    return {
      host: parts.slice(0, -1).join(":"),
      port: Number(parts[parts.length - 1])
    };
  }

  return {
    host: text,
    port: null
  };
}

function defaultPortFor(protocol) {
  if (protocol === "https") return 443;
  return 80;
}

function boundary() {
  return {
    evaluatesLocalPolicy: true,
    sendsNetworkRequests: false,
    writesFiles: false,
    postsContent: false,
    sendsOutreach: false,
    signsWalletPayloads: false,
    deploysContracts: false,
    startsPilotTraffic: false,
    movesFunds: false,
    storesSecrets: false,
    usesPrivateKeys: false,
    usesApiTokens: false,
    publishesWebsite: false,
    enablesToken: false
  };
}
