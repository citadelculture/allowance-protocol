import { DEFAULT_POLICY, stableHash } from "./policyEngine.mjs";
import { preflightPayment } from "./httpPreflight.mjs";
import { DEFAULT_DEMO_INTEGRATION_INTENT, buildDemoIntegrationPacket } from "./demoIntegrationPacket.mjs";

export const BUILDER_QUICKSTART_STATUSES = [
  "ready",
  "needs_fixes",
  "unsafe_live_execution"
];

export function buildBuilderQuickstartReport(input = {}, options = {}) {
  const payload = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const generatedAt = options.generatedAt || new Date().toISOString();
  const sourceErrors = unique(options.sourceErrors || payload.sourceErrors || []);
  const liveExecutionRequested = Boolean(
    options.liveExecutionRequested ||
      payload.liveExecutionRequested ||
      payload.postToX ||
      payload.sendOutreach ||
      payload.deployContracts ||
      payload.transferFunds ||
      payload.signWalletPayloads
  );
  const server = normalizeServer(payload.server || {});
  const policy = normalizePolicy(payload.policy);
  const intent = normalizeIntent(payload.intent);
  const basePacket = buildDemoIntegrationPacket({
    intent,
    policy,
    receipts: payload.receipts || []
  }, {
    generatedAt,
    policyVerifier: options.policyVerifier,
    agentIntentVerifier: options.agentIntentVerifier,
    merchantCatalog: options.merchantCatalog,
    merchants: options.merchants
  });
  const scenarios = buildScenarios({
    policy,
    intent,
    policyVerifier: options.policyVerifier,
    agentIntentVerifier: options.agentIntentVerifier,
    merchantCatalog: options.merchantCatalog,
    merchants: options.merchants
  });
  const scenarioReasons = scenarios.flatMap((scenario) =>
    scenario.pass ? [] : [`${scenario.id}: expected ${scenario.expectedDecision}/${scenario.expectedStatus}, got ${scenario.decision}/${scenario.status}`]
  );
  const reasons = [
    ...sourceErrors,
    ...scenarioReasons,
    basePacket.valid ? null : `Demo integration packet is not ready: ${basePacket.reasons.join("; ")}`,
    liveExecutionRequested ? "Builder quickstart cannot request live posting, outreach, signing, deployment, or fund movement" : null
  ].filter(Boolean);
  const status = liveExecutionRequested ? "unsafe_live_execution" : reasons.length ? "needs_fixes" : "ready";
  const curlCommands = curlCommandsFor({ server, intent });
  const report = {
    generatedAt,
    valid: status === "ready",
    status,
    quickstartId: `builder_quickstart_${stableHash({ generatedAt, intent, server })}`,
    server,
    demoPacket: {
      valid: basePacket.valid,
      packetHash: basePacket.packetHash,
      decision: basePacket.decision,
      receiptId: basePacket.receiptId,
      preflightStatus: basePacket.preflightStatus
    },
    scenarios,
    curlCommands,
    acceptanceCriteria: [
      "Allowed preflight returns HTTP 200 and x-allow-decision=allow.",
      "PII metadata returns HTTP 402 and a denied receipt.",
      "Blocked trading category returns HTTP 402 and a denied receipt.",
      "Reusing an intent nonce returns HTTP 402 and proves replay protection.",
      "No local quickstart step requires private keys, API tokens, wallet signing, posting, outreach, deployment, or fund movement."
    ],
    nextAction: nextActionFor(status),
    reasons: unique(reasons),
    warnings: unique([
      ...scenarios.flatMap((scenario) => scenario.warnings),
      basePacket.valid ? null : "Fix the demo integration packet before using this quickstart"
    ]),
    evidenceBoundary: boundary()
  };

  return {
    ...report,
    reportHash: stableHash(report)
  };
}

export function publicBuilderQuickstartReport(report = {}) {
  return {
    ...report
  };
}

function buildScenarios(options) {
  const allow = scenarioFromPreflight({
    id: "allowed_preflight",
    title: "Allowed metered search preflight",
    intent: options.intent,
    expectedDecision: "allow",
    expectedStatus: 200,
    options
  });
  const replay = scenarioFromPreflight({
    id: "replay_denied",
    title: "Replay protection denies reused nonce",
    intent: options.intent,
    receipts: allow.evaluation?.receipt ? [allow.evaluation.receipt] : [],
    expectedDecision: "deny",
    expectedStatus: 402,
    expectedReasonIncludes: "already used",
    options
  });
  const pii = scenarioFromPreflight({
    id: "pii_metadata_denied",
    title: "PII-like metadata is blocked",
    intent: {
      ...options.intent,
      merchantId: "lead_graph",
      amountUsd: 0.35,
      resource: "/v1/leads/export",
      intentNonce: "quickstart-pii-001",
      metadata: "export leads for alex@example.com with phone +41 44 555 0101"
    },
    expectedDecision: "deny",
    expectedStatus: 402,
    expectedReasonIncludes: "restricted data",
    options
  });
  const category = scenarioFromPreflight({
    id: "blocked_category_denied",
    title: "Trading route is blocked",
    intent: {
      ...options.intent,
      merchantId: "wallet_swapper",
      amountUsd: 0.5,
      resource: "/swap/quote",
      intentNonce: "quickstart-trade-001",
      metadata: "agent asks to quote a volatile asset swap"
    },
    expectedDecision: "deny",
    expectedStatus: 402,
    expectedReasonIncludes: "Blocked merchant category",
    options
  });

  return [allow, replay, pii, category].map(stripEvaluation);
}

function scenarioFromPreflight({
  id,
  title,
  intent,
  receipts = [],
  expectedDecision,
  expectedStatus,
  expectedReasonIncludes = "",
  options
}) {
  try {
    const preflight = preflightPayment({
      intent,
      policy: options.policy,
      receipts,
      policyVerifier: options.policyVerifier,
      agentIntentVerifier: options.agentIntentVerifier,
      merchantCatalog: options.merchantCatalog,
      merchants: options.merchants
    });
    const evaluation = preflight.body.evaluation;
    const reasonMatched = expectedReasonIncludes
      ? evaluation.reasons.some((reason) => reason.includes(expectedReasonIncludes))
      : true;
    const pass = preflight.status === expectedStatus && evaluation.decision === expectedDecision && reasonMatched;

    return {
      id,
      title,
      pass,
      status: preflight.status,
      decision: evaluation.decision,
      expectedStatus,
      expectedDecision,
      receiptId: evaluation.receipt.id,
      intentNonce: evaluation.receipt.intentNonce,
      intentHash: evaluation.receipt.intentHash,
      riskScore: evaluation.riskScore,
      reasons: evaluation.reasons,
      warnings: evaluation.warnings,
      headers: preflight.headers,
      evaluation
    };
  } catch (error) {
    return {
      id,
      title,
      pass: false,
      status: null,
      decision: null,
      expectedStatus,
      expectedDecision,
      receiptId: null,
      intentNonce: intent.intentNonce || intent.nonce || "",
      intentHash: null,
      riskScore: null,
      reasons: [`Scenario failed: ${error.message}`],
      warnings: [],
      headers: {},
      evaluation: null
    };
  }
}

function stripEvaluation(scenario) {
  const { evaluation, ...publicScenario } = scenario;
  return publicScenario;
}

function curlCommandsFor({ server, intent }) {
  const url = `${server.origin}/api/x402/preflight`;
  return {
    quickstartReport: [
      "curl -s",
      shellQuote(`${server.origin}/api/builder/quickstart`)
    ].join(" "),
    allowedPreflight: [
      "curl -i -s -X POST",
      shellQuote(url),
      "-H 'content-type: application/json'",
      "-d",
      shellQuote(JSON.stringify({
        headers: {
          "x-allow-merchant": intent.merchantId,
          "x-allow-amount-usd": String(Number(intent.amountUsd)),
          "x-allow-resource": intent.resource,
          "x-allow-nonce": intent.intentNonce || intent.nonce || "",
          "x-allow-metadata": intent.metadata || ""
        }
      }))
    ].join(" "),
    piiDeniedPreflight: [
      "curl -i -s -X POST",
      shellQuote(url),
      "-H 'content-type: application/json'",
      "-d",
      shellQuote(JSON.stringify({
        headers: {
          "x-allow-merchant": "lead_graph",
          "x-allow-amount-usd": "0.35",
          "x-allow-resource": "/v1/leads/export",
          "x-allow-nonce": "quickstart-pii-001",
          "x-allow-metadata": "email alex@example.com"
        }
      }))
    ].join(" "),
    localPaidRouteAllowed: [
      "curl -i -s",
      shellQuote(`${server.origin}/api/demo/paid-search?q=x402`),
      "-H 'x-allow-nonce: quickstart-paid-001'",
      "-H 'x-allow-metadata: public search request'"
    ].join(" "),
    localPaidRouteDenied: [
      "curl -i -s",
      shellQuote(`${server.origin}/api/demo/paid-search?q=leads`),
      "-H 'x-allow-nonce: quickstart-paid-002'",
      "-H 'x-allow-metadata: email alex@example.com'"
    ].join(" ")
  };
}

function normalizeServer(server) {
  const host = String(server.host || "127.0.0.1").trim() || "127.0.0.1";
  const port = Number(server.port || 4174);
  const protocol = String(server.protocol || "http").trim() || "http";
  const originPort = port === defaultPortFor(protocol) ? "" : `:${port}`;
  return {
    protocol,
    host,
    port,
    origin: `${protocol}://${host}${originPort}`
  };
}

function defaultPortFor(protocol) {
  if (protocol === "https") return 443;
  return 80;
}

function normalizePolicy(policy) {
  return {
    ...DEFAULT_POLICY,
    ...(policy && typeof policy === "object" && !Array.isArray(policy) ? policy : {})
  };
}

function normalizeIntent(intent) {
  return {
    ...DEFAULT_DEMO_INTEGRATION_INTENT,
    ...(intent && typeof intent === "object" && !Array.isArray(intent) ? intent : {})
  };
}

function nextActionFor(status) {
  if (status === "ready") {
    return "Start the local server with PORT=4174 npm start, run the curl commands, and compare each response to the scenario expectations.";
  }
  if (status === "unsafe_live_execution") {
    return "Remove all live execution requests; builder quickstart reports must remain local and descriptive.";
  }
  return "Fix failing quickstart scenarios before sharing the builder onboarding path.";
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
    enablesToken: false,
    requiresHumanApprovalForLiveUse: true
  };
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
