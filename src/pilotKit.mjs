import { buildMerchantPolicyPatch, summarizeMerchantReadiness } from "./merchantIntake.mjs";

export function buildPilotKit(intake, options = {}) {
  const readiness = summarizeMerchantReadiness(intake);
  const patch = buildMerchantPolicyPatch(intake);
  const endpoint = parseEndpoint(intake?.integration?.testEndpoint);
  const gatewayPort = Number(options.gatewayPort || 4190);
  const gatewayBaseUrl = options.gatewayBaseUrl || `http://127.0.0.1:${gatewayPort}`;
  const pathPrefix = options.pathPrefix || endpoint.pathname || "/";
  const route = {
    pathPrefix,
    merchantId: intake?.merchantId || "",
    amountUsd: Number(intake?.service?.examplePriceUsd || 0),
    metadataHeader: "x-allow-metadata",
    resourceTemplate: "path_and_query"
  };

  const gatewayConfig = {
    name: `allow-${route.merchantId || "merchant"}-pilot`,
    listen: {
      host: "127.0.0.1",
      port: gatewayPort
    },
    upstream: {
      baseUrl: endpoint.origin || "https://merchant.example",
      timeoutMs: 10000
    },
    evidence: {
      environment: "local",
      merchantApproved: false,
      rail: intake?.agentPaymentFit?.currentX402Support ? "x402" : "demo",
      network: "local",
      label: `local-${route.merchantId || "merchant"}-pilot-kit`
    },
    merchants: patch.merchant?.id ? [patch.merchant] : [],
    forwardHeaders: ["accept", "content-type", "user-agent", "x-allow-nonce", "x-intent-nonce", "x-allow-metadata"],
    routes: [route]
  };

  return {
    merchantId: intake?.merchantId || null,
    readiness,
    gatewayConfig,
    policyPatch: patch.policyPatch,
    merchant: patch.merchant,
    smokeTests: buildSmokeTests({ gatewayBaseUrl, pathPrefix, merchantId: route.merchantId }),
    acceptanceCriteria: [
      "`npm run gateway-smoke -- <gateway-config>` passes locally before merchant test traffic",
      "One allowed request returns 2xx through the gateway",
      "One denied request returns 402 with a receipt and clear reason",
      "Merchant confirms the denial reason is useful",
      "Merchant confirms the configured price and path prefix are correct",
      "Dispute packet path is agreed before any paid test traffic",
      "No private keys or settlement credentials are handled by Allow"
    ],
    nextAction: readiness.readyForTest
      ? "Send pilot kit to merchant and schedule protected endpoint test"
      : readiness.nextAction
  };
}

function buildSmokeTests({ gatewayBaseUrl, pathPrefix, merchantId }) {
  const baseUrl = `${gatewayBaseUrl}${pathPrefix}`;
  const nonceBase = merchantId || "merchant";

  return {
    allowed: `curl -i -s '${baseUrl}?allow_test=public' -H 'x-allow-nonce: ${nonceBase}-allow-001' -H 'x-allow-metadata: public request'`,
    deniedPii: `curl -i -s '${baseUrl}?allow_test=pii' -H 'x-allow-nonce: ${nonceBase}-deny-001' -H 'x-allow-metadata: email alex@example.com'`
  };
}

function parseEndpoint(endpoint) {
  try {
    const url = new URL(endpoint);
    return {
      origin: url.origin,
      pathname: url.pathname || "/"
    };
  } catch {
    return {
      origin: "",
      pathname: "/"
    };
  }
}
