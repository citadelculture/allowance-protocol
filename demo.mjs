#!/usr/bin/env node
// Allow Protocol — 30-second demo.
//
// Runs the real policy engine against an autonomous agent's payment attempts.
// No setup, no network, no keys. Just:  node demo.mjs
//
// The point: an AI agent with a wallet should not be trusted with an unbounded
// "approve everything" signer. Allow Protocol is the allowance layer that sits
// between the agent and its payments and turns every attempt into a signed,
// policy-bounded receipt — allow, review, or deny — before any value moves.

import { evaluatePaymentIntent, DEFAULT_POLICY, formatUsd } from "./src/index.mjs";

const BOLD = "[1m";
const DIM = "[2m";
const GREEN = "[32m";
const YELLOW = "[33m";
const RED = "[31m";
const RESET = "[0m";

function badge(decision) {
  if (decision === "allow") return `${GREEN}${BOLD} ALLOW ${RESET}`;
  if (decision === "review") return `${YELLOW}${BOLD} REVIEW ${RESET}`;
  return `${RED}${BOLD} DENY  ${RESET}`;
}

const policy = { ...DEFAULT_POLICY };
const receipts = [];

console.log(`\n${BOLD}Allow Protocol — agent allowance, live${RESET}`);
console.log(
  `${DIM}policy ${policy.policyId} · agent ${policy.agentId} · ${policy.settlementAsset} on ${policy.chain}${RESET}`
);
console.log(
  `${DIM}daily cap ${formatUsd(policy.dailyCapUsd)} (spent ${formatUsd(policy.spentTodayUsd)}) · ` +
    `per-tx cap ${formatUsd(policy.perTxCapUsd)} · blocked: ${policy.blockedCategories.join(", ")} · PII blocked${RESET}\n`
);

// Each scenario is something an autonomous agent might actually try to pay for.
const scenarios = [
  {
    title: "Agent buys a metered search query",
    intent: {
      merchantId: "mcp_search",
      amountUsd: 0.018,
      resource: "/search?q=base+x402",
      metadata: "public search request",
      intentNonce: "intent-001"
    }
  },
  {
    title: "Agent pays for a vector inference call",
    intent: {
      merchantId: "vector_cloud",
      amountUsd: 0.11,
      resource: "/embeddings",
      metadata: "embed product catalog",
      intentNonce: "intent-002"
    }
  },
  {
    title: "Agent tries to swap on an unapproved trading venue",
    intent: {
      merchantId: "wallet_swapper",
      amountUsd: 2.4,
      resource: "/swap",
      metadata: "rotate treasury into a memecoin",
      intentNonce: "intent-003"
    }
  },
  {
    title: "Agent leaks a customer email into payment metadata",
    intent: {
      merchantId: "lead_graph",
      amountUsd: 0.35,
      resource: "/enrich",
      metadata: "enrich lead jane.doe@example.com before paying",
      intentNonce: "intent-004"
    }
  },
  {
    title: "A replayed receipt (reused intent nonce) tries to double-spend",
    intent: {
      merchantId: "mcp_search",
      amountUsd: 0.018,
      resource: "/search?q=base+x402",
      metadata: "public search request",
      intentNonce: "intent-001"
    }
  }
];

let allowed = 0;
let blocked = 0;
let blockedValue = 0;

for (const [i, scenario] of scenarios.entries()) {
  const result = evaluatePaymentIntent(scenario.intent, policy, receipts);
  const { decision, riskScore, reasons, receipt } = result;

  console.log(`${BOLD}${i + 1}. ${scenario.title}${RESET}`);
  console.log(
    `   ${badge(decision)}  ${formatUsd(scenario.intent.amountUsd)} → ${receipt.merchantName}` +
      `   ${DIM}risk ${riskScore}/100${RESET}`
  );
  console.log(`   ${DIM}${reasons[0]}${RESET}`);

  if (decision === "allow") {
    allowed += 1;
    // Only allowed intents produce a recorded, replay-protected receipt.
    receipts.push(receipt);
    console.log(`   ${DIM}receipt ${receipt.id} · nonce ${receipt.intentNonce} recorded${RESET}`);
  } else {
    blocked += 1;
    blockedValue += Number(scenario.intent.amountUsd) || 0;
  }
  console.log("");
}

console.log(`${BOLD}Summary${RESET}`);
console.log(`  ${GREEN}${allowed} allowed${RESET}   ${RED}${blocked} blocked${RESET}   ` +
  `${DIM}${formatUsd(blockedValue)} of unsafe spend stopped${RESET}`);
console.log(
  `\n${DIM}Every decision above came from src/policyEngine.mjs — the same engine that backs the${RESET}`
);
console.log(
  `${DIM}HTTP gateway, the x402 facilitator, and the no-custody AllowanceRegistry on Base.${RESET}`
);
console.log(`${DIM}Wrap your agent's wallet in ~10 lines: see README "Builder Quickstart".${RESET}\n`);
