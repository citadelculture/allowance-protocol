import {
  DEFAULT_POLICY,
  MERCHANTS,
  evaluatePaymentIntent,
  formatUsd
} from "./src/policyEngine.mjs";
import { buildDemoIntegrationPacket } from "./src/demoIntegrationPacket.mjs";
import { buildBuilderQuickstartReport } from "./src/builderQuickstart.mjs";

const state = {
  policy: { ...DEFAULT_POLICY },
  receipts: [
    {
      id: "allow_demo_01",
      createdAt: new Date(Date.now() - 1000 * 60 * 48).toISOString(),
      agentId: "agent-alpha",
      policyId: "allow_policy_demo_alpha",
      merchantId: "mcp_search",
      merchantName: "MCP Search Index",
      amountUsd: 0.018,
      decision: "allow",
      riskScore: 8,
      intentNonce: "demo-search-001",
      intentHash: "b9db1aac",
      metadataHash: "8109d99a",
      resource: "/v1/search?q=base"
    },
    {
      id: "allow_demo_02",
      createdAt: new Date(Date.now() - 1000 * 60 * 33).toISOString(),
      agentId: "agent-alpha",
      policyId: "allow_policy_demo_alpha",
      merchantId: "wallet_swapper",
      merchantName: "Wallet Swapper",
      amountUsd: 2.4,
      decision: "deny",
      riskScore: 94,
      intentNonce: "demo-trade-000",
      intentHash: "a8ed340c",
      metadataHash: "a10f3430",
      resource: "/swap"
    }
  ],
  lastResult: null,
  integrationPacket: null,
  builderQuickstart: null
};

const el = {
  merchant: document.querySelector("#merchant"),
  amount: document.querySelector("#amount"),
  resource: document.querySelector("#resource"),
  metadata: document.querySelector("#metadata"),
  nonce: document.querySelector("#nonce"),
  dailyCap: document.querySelector("#dailyCap"),
  perTxCap: document.querySelector("#perTxCap"),
  riskLimit: document.querySelector("#riskLimit"),
  blockPii: document.querySelector("#blockPii"),
  blockTrading: document.querySelector("#blockTrading"),
  dailyCapValue: document.querySelector("#dailyCapValue"),
  perTxValue: document.querySelector("#perTxValue"),
  riskLimitValue: document.querySelector("#riskLimitValue"),
  decision: document.querySelector("#decision"),
  riskScore: document.querySelector("#riskScore"),
  riskBar: document.querySelector("#riskBar"),
  reasons: document.querySelector("#reasons"),
  warnings: document.querySelector("#warnings"),
  remaining: document.querySelector("#remaining"),
  projected: document.querySelector("#projected"),
  receiptId: document.querySelector("#receiptId"),
  ledger: document.querySelector("#ledger"),
  statReceipts: document.querySelector("#statReceipts"),
  statApproved: document.querySelector("#statApproved"),
  statDenied: document.querySelector("#statDenied"),
  statBlocked: document.querySelector("#statBlocked"),
  policyPreview: document.querySelector("#policyPreview"),
  quickstartStatus: document.querySelector("#quickstartStatus"),
  quickstartChecks: document.querySelector("#quickstartChecks"),
  quickstartCommands: document.querySelector("#quickstartCommands"),
  integrationPacket: document.querySelector("#integrationPacket"),
  scenario: document.querySelector("#scenario"),
  recordReceipt: document.querySelector("#recordReceipt"),
  reset: document.querySelector("#reset"),
  copyQuickstart: document.querySelector("#copyQuickstart"),
  copyPacket: document.querySelector("#copyPacket")
};

let copyPacketResetTimer = null;
let copyQuickstartResetTimer = null;

const scenarios = [
  {
    label: "Search request",
    merchantId: "mcp_search",
    amountUsd: 0.018,
    resource: "/v1/search?q=agent+payments",
    nonce: "demo-search-003",
    metadata: "agent-alpha requesting public search context for launch analysis"
  },
  {
    label: "Inference burst",
    merchantId: "vector_cloud",
    amountUsd: 0.82,
    resource: "/v1/embed/batch",
    nonce: "demo-inference-001",
    metadata: "embed project documentation for retrieval"
  },
  {
    label: "Personal-data leak",
    merchantId: "lead_graph",
    amountUsd: 0.35,
    resource: "/v1/leads/export",
    nonce: "demo-pii-001",
    metadata: "export leads for dom@example.com with phone +41 44 555 0101"
  },
  {
    label: "Trading attempt",
    merchantId: "wallet_swapper",
    amountUsd: 2.4,
    resource: "/swap/quote",
    nonce: "demo-trade-001",
    metadata: "agent wants to rebalance into a volatile asset"
  }
];

function init() {
  for (const merchant of MERCHANTS) {
    const option = document.createElement("option");
    option.value = merchant.id;
    option.textContent = `${merchant.name} - ${merchant.category}`;
    el.merchant.append(option);
  }

  for (const scenario of scenarios) {
    const option = document.createElement("option");
    option.value = scenario.label;
    option.textContent = scenario.label;
    el.scenario.append(option);
  }

  el.merchant.value = scenarios[0].merchantId;
  el.amount.value = scenarios[0].amountUsd;
  el.resource.value = scenarios[0].resource;
  el.nonce.value = scenarios[0].nonce;
  el.metadata.value = scenarios[0].metadata;
  el.dailyCap.value = state.policy.dailyCapUsd;
  el.perTxCap.value = state.policy.perTxCapUsd;
  el.riskLimit.value = state.policy.maxRiskScore;
  el.blockPii.checked = state.policy.blockPii;
  el.blockTrading.checked = true;

  document.querySelectorAll("input, select, textarea").forEach((node) => {
    node.addEventListener("input", syncAndRender);
  });

  el.scenario.addEventListener("change", loadScenario);
  el.recordReceipt.addEventListener("click", recordReceipt);
  el.reset.addEventListener("click", resetDay);
  el.copyQuickstart.addEventListener("click", copyQuickstartCommands);
  el.copyPacket.addEventListener("click", copyIntegrationPacket);

  syncAndRender();
}

function loadScenario() {
  const scenario = scenarios.find((item) => item.label === el.scenario.value);
  if (!scenario) return;

  el.merchant.value = scenario.merchantId;
  el.amount.value = scenario.amountUsd;
  el.resource.value = scenario.resource;
  el.nonce.value = scenario.nonce;
  el.metadata.value = scenario.metadata;
  syncAndRender();
}

function syncPolicy() {
  state.policy.dailyCapUsd = Number(el.dailyCap.value);
  state.policy.perTxCapUsd = Number(el.perTxCap.value);
  state.policy.maxRiskScore = Number(el.riskLimit.value);
  state.policy.blockPii = el.blockPii.checked;
  state.policy.blockedCategories = el.blockTrading.checked ? ["trading"] : [];
}

function currentIntent() {
  return {
    merchantId: el.merchant.value,
    amountUsd: Number(el.amount.value),
    resource: el.resource.value.trim(),
    intentNonce: el.nonce.value.trim(),
    metadata: el.metadata.value.trim()
  };
}

function syncAndRender() {
  syncPolicy();
  state.lastResult = evaluatePaymentIntent(currentIntent(), state.policy, state.receipts);
  render();
}

function recordReceipt() {
  if (!state.lastResult || state.lastResult.decision !== "allow") return;
  state.receipts = [state.lastResult.receipt, ...state.receipts].slice(0, 9);
  state.policy.spentTodayUsd = Number((state.policy.spentTodayUsd + state.lastResult.receipt.amountUsd).toFixed(3));
  el.nonce.value = nextNonce();
  syncAndRender();
}

function resetDay() {
  state.policy.spentTodayUsd = 0;
  state.receipts = [];
  syncAndRender();
}

function render() {
  const result = state.lastResult;
  const decisionLabel = result.decision.toUpperCase();
  const decisionClass = result.decision;

  el.dailyCapValue.textContent = formatUsd(state.policy.dailyCapUsd);
  el.perTxValue.textContent = formatUsd(state.policy.perTxCapUsd);
  el.riskLimitValue.textContent = state.policy.maxRiskScore;
  el.decision.textContent = decisionLabel;
  el.decision.className = `decision ${decisionClass}`;
  el.riskScore.textContent = result.riskScore;
  el.riskBar.style.width = `${result.riskScore}%`;
  el.riskBar.dataset.level = result.riskScore > 72 ? "high" : result.riskScore > 42 ? "mid" : "low";
  el.remaining.textContent = formatUsd(result.remainingBudgetUsd);
  el.projected.textContent = formatUsd(result.projectedRemainingUsd);
  el.receiptId.textContent = result.receipt.id;
  el.recordReceipt.disabled = result.decision !== "allow";

  el.reasons.innerHTML = "";
  result.reasons.forEach((reason) => el.reasons.append(renderListItem(reason)));

  el.warnings.innerHTML = "";
  const warnings = result.warnings.length ? result.warnings : ["No advisory flags"];
  warnings.forEach((warning) => el.warnings.append(renderListItem(warning)));

  const stats = summarizeLedger();
  el.statReceipts.textContent = stats.receipts;
  el.statApproved.textContent = stats.approved;
  el.statDenied.textContent = stats.denied;
  el.statBlocked.textContent = formatUsd(stats.blockedUsd);

  renderLedger();
  renderPolicyPreview();
  renderBuilderQuickstart();
  renderIntegrationPacket();
}

function renderListItem(text) {
  const item = document.createElement("li");
  item.textContent = text;
  return item;
}

function renderLedger() {
  el.ledger.innerHTML = "";
  if (!state.receipts.length) {
    const empty = document.createElement("tr");
    empty.innerHTML = "<td colspan=\"5\">No receipts recorded for this epoch.</td>";
    el.ledger.append(empty);
    return;
  }

  for (const receipt of state.receipts) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${new Date(receipt.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</td>
      <td>${receipt.merchantName}</td>
      <td>${formatUsd(receipt.amountUsd)}</td>
      <td><span class="mini ${receipt.decision}">${receipt.decision}</span></td>
      <td>${receipt.id}</td>
    `;
    el.ledger.append(row);
  }
}

function renderPolicyPreview() {
  el.policyPreview.textContent = JSON.stringify(
    {
      agent: state.policy.agentId,
      policyId: state.policy.policyId,
      chain: state.policy.chain,
      asset: state.policy.settlementAsset,
      dailyCapUsd: state.policy.dailyCapUsd,
      perTxCapUsd: state.policy.perTxCapUsd,
      maxRiskScore: state.policy.maxRiskScore,
      allowedMerchants: state.policy.allowedMerchants,
      blockedCategories: state.policy.blockedCategories,
      requireReceipt: state.policy.requireReceipt,
      requireIntentNonce: state.policy.requireIntentNonce,
      blockPii: state.policy.blockPii
    },
    null,
    2
  );
}

function renderBuilderQuickstart() {
  state.builderQuickstart = buildBuilderQuickstartReport({
    server: currentServer(),
    intent: currentIntent(),
    policy: state.policy,
    receipts: state.receipts
  });
  const report = state.builderQuickstart;
  const statusClass = report.valid ? "allow" : "deny";

  el.quickstartStatus.textContent = report.status.replaceAll("_", " ");
  el.quickstartStatus.className = `mini ${statusClass}`;
  el.quickstartChecks.innerHTML = "";

  for (const scenario of report.scenarios) {
    const item = document.createElement("div");
    item.className = "quickstart-check";
    item.innerHTML = `
      <span class="mini ${scenario.pass ? "allow" : "deny"}">${scenario.pass ? "pass" : "fix"}</span>
      <div>
        <strong>${scenario.title}</strong>
        <span>${scenario.status || "n/a"} / ${scenario.decision || "n/a"} / risk ${scenario.riskScore ?? "n/a"}</span>
      </div>
    `;
    el.quickstartChecks.append(item);
  }

  el.quickstartCommands.textContent = Object.entries(report.curlCommands)
    .map(([label, command]) => `# ${label}\n${command}`)
    .join("\n\n");
}

function renderIntegrationPacket() {
  state.integrationPacket = buildDemoIntegrationPacket({
    intent: currentIntent(),
    policy: state.policy,
    receipts: state.receipts
  });
  el.integrationPacket.textContent = JSON.stringify(state.integrationPacket.packet || state.integrationPacket, null, 2);
}

async function copyIntegrationPacket() {
  const text = el.integrationPacket.textContent;
  if (!text) return;

  try {
    await navigator.clipboard.writeText(text);
    setCopyButton(el.copyPacket, "Copied", "Copy packet", "packet");
  } catch {
    setCopyButton(el.copyPacket, "Select text", "Copy packet", "packet");
  }
}

async function copyQuickstartCommands() {
  const text = el.quickstartCommands.textContent;
  if (!text) return;

  try {
    await navigator.clipboard.writeText(text);
    setCopyButton(el.copyQuickstart, "Copied", "Copy commands", "quickstart");
  } catch {
    setCopyButton(el.copyQuickstart, "Select text", "Copy commands", "quickstart");
  }
}

function setCopyButton(button, label, defaultLabel, slot) {
  const timer = slot === "quickstart" ? copyQuickstartResetTimer : copyPacketResetTimer;
  window.clearTimeout(timer);
  button.textContent = label;
  const nextTimer = window.setTimeout(() => {
    button.textContent = defaultLabel;
  }, 1400);
  if (slot === "quickstart") {
    copyQuickstartResetTimer = nextTimer;
  } else {
    copyPacketResetTimer = nextTimer;
  }
}

function currentServer() {
  return {
    protocol: window.location.protocol.replace(":", "") || "http",
    host: window.location.hostname || "127.0.0.1",
    port: Number(window.location.port || 4174)
  };
}

function nextNonce() {
  return `demo-${Date.now().toString(36)}-${state.receipts.length + 1}`;
}

function summarizeLedger() {
  return state.receipts.reduce(
    (acc, receipt) => {
      acc.receipts += 1;
      if (receipt.decision === "allow") acc.approved += 1;
      if (receipt.decision === "deny") {
        acc.denied += 1;
        acc.blockedUsd += Number(receipt.amountUsd);
      }
      return acc;
    },
    { receipts: 0, approved: 0, denied: 0, blockedUsd: 0 }
  );
}

init();
