import assert from "node:assert/strict";
import { DEFAULT_POLICY } from "../src/policyEngine.mjs";
import {
  WALLET_PAYMENT_BLOCKED,
  WalletPaymentBlockedError,
  assertWalletPaymentAllowed,
  createAgentKitPolicyHook,
  createWalletClientPolicyAdapter,
  createWalletPolicyHook,
  evaluateWalletPayment,
  walletPaymentIntent,
  walletTransactionRequest
} from "../src/walletHook.mjs";

const route = {
  merchantId: "mcp_search",
  amountUsd: 0.018,
  resourceFromRequest: (request) => `wallet://${request.chain}/${request.operation}/${request.to}`,
  metadataFromRequest: (request) => request.memo || ""
};

const request = {
  id: "wallet-001",
  operation: "pay_api",
  chain: "Base",
  asset: "USDC",
  to: "search.allow.dev",
  memo: "public search request"
};

assert.deepEqual(walletPaymentIntent(request, route), {
  merchantId: "mcp_search",
  amountUsd: 0.018,
  resource: "wallet://Base/pay_api/search.allow.dev",
  metadata: "public search request",
  intentNonce: "wallet-001"
});

assert.deepEqual(
  walletTransactionRequest(
    {
      id: "tx-001",
      operation: "send_transaction",
      chain: { name: "Base" },
      to: "0x0000000000000000000000000000000000000002",
      amountUsd: 0.018,
      merchantId: "mcp_search",
      memo: "public transaction"
    },
    {}
  ),
  {
    id: "tx-001",
    operation: "send_transaction",
    chain: "Base",
    asset: "native",
    to: "0x0000000000000000000000000000000000000002",
    merchantId: "mcp_search",
    amountUsd: 0.018,
    resource: "wallet://Base/send_transaction/0x0000000000000000000000000000000000000002",
    metadata: "public transaction"
  }
);

const receipts = [];
const hook = createWalletPolicyHook({
  policy: { ...DEFAULT_POLICY, spentTodayUsd: 0 },
  receipts,
  route
});

let executorCalled = false;
const allowed = await hook(request, async (walletRequest, context) => {
  executorCalled = true;
  return {
    signed: true,
    to: walletRequest.to,
    receiptId: context.allow.receipt.id
  };
});

assert.equal(allowed.ok, true);
assert.equal(allowed.blocked, false);
assert.equal(allowed.status, 200);
assert.equal(executorCalled, true);
assert.equal(allowed.result.signed, true);
assert.equal(allowed.execution.signed, true);
assert.equal(allowed.allow.receipt.intentNonce, "wallet-001");
assert.equal(receipts.length, 1);

const replay = await hook(request, async () => {
  throw new Error("executor should not run for replay");
});

assert.equal(replay.ok, false);
assert.equal(replay.blocked, true);
assert.equal(replay.status, 402);
assert.equal(replay.error.code, WALLET_PAYMENT_BLOCKED);
assert.equal(replay.allow.reasons[0], "Intent nonce already used for this policy");

const pii = await evaluateWalletPayment(
  {
    id: "wallet-pii-001",
    operation: "pay_api",
    chain: "Base",
    asset: "USDC",
    to: "search.allow.dev",
    memo: "email alex@example.com"
  },
  {
    policy: { ...DEFAULT_POLICY, spentTodayUsd: 0 },
    route
  }
);

assert.equal(pii.allowed, false);
assert.equal(pii.allow.reasons[0], "Payment metadata contains restricted data: email");

const expensive = await createWalletPolicyHook({
  policy: { ...DEFAULT_POLICY, spentTodayUsd: 0 },
  route: {
    merchantId: "mcp_search",
    amountUsd: 10,
    resource: "wallet://Base/pay_api/search.allow.dev"
  }
})(
  {
    id: "wallet-expensive-001",
    operation: "pay_api"
  },
  async () => {
    throw new Error("executor should not run for over-cap");
  }
);

assert.equal(expensive.ok, false);
assert.ok(expensive.allow.reasons[0].startsWith("Above per-transaction cap"));
assert.equal(expensive.error.code, WALLET_PAYMENT_BLOCKED);

const directRequest = await createWalletPolicyHook({
  policy: { ...DEFAULT_POLICY, spentTodayUsd: 0 },
  merchantIdFromRequest: (payment) => payment.counterparty,
  amountUsdFromRequest: (payment) => payment.quote.usd,
  resourceFromRequest: (payment) => `wallet://${payment.chain}/${payment.operation}`,
  metadataFromRequest: (payment) => payment.note,
  intentNonceFromRequest: (payment) => payment.clientRequestId
})(
  {
    clientRequestId: "wallet-direct-001",
    operation: "pay_api",
    chain: "Base",
    counterparty: "mcp_search",
    quote: { usd: 0.018 },
    note: "public wallet request"
  },
  async () => ({ signed: false, simulated: true })
);

assert.equal(directRequest.ok, true);
assert.equal(directRequest.allow.receipt.intentNonce, "wallet-direct-001");

const agentKitHook = createAgentKitPolicyHook({
  policy: { ...DEFAULT_POLICY, spentTodayUsd: 0 },
  route
});

const agentKitResult = await agentKitHook.beforeAction(
  {
    id: "wallet-agentkit-001",
    operation: "pay_api",
    chain: "Base",
    asset: "USDC",
    to: "search.allow.dev",
    memo: "public search request"
  },
  async () => ({ tx: "0xexample" })
);

assert.equal(agentKitResult.ok, true);
assert.equal(agentKitResult.execution.tx, "0xexample");

const walletClientCalls = [];
const walletAdapter = createWalletClientPolicyAdapter({
  walletClient: {
    async sendTransaction(transaction) {
      walletClientCalls.push(transaction);
      return "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
    }
  },
  policy: { ...DEFAULT_POLICY, spentTodayUsd: 0 },
  route: {
    merchantId: "mcp_search",
    amountUsd: 0.018,
    resourceFromRequest: (walletRequest) => walletRequest.resource,
    metadataFromRequest: (walletRequest) => walletRequest.metadata
  }
});

const walletClientAllowed = await walletAdapter.sendTransaction(
  {
    chain: { name: "Base" },
    to: "0x0000000000000000000000000000000000000002"
  },
  {
    intentNonce: "wallet-client-001",
    metadata: "public client request"
  }
);

assert.equal(walletClientAllowed.ok, true);
assert.equal(walletClientAllowed.result.hash, "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef");
assert.equal(walletClientCalls.length, 1);

const walletClientDenied = await walletAdapter.sendTransaction(
  {
    chain: { name: "Base" },
    to: "0x0000000000000000000000000000000000000002"
  },
  {
    intentNonce: "wallet-client-pii-001",
    metadata: "email alex@example.com"
  }
);

assert.equal(walletClientDenied.ok, false);
assert.equal(walletClientDenied.error.code, WALLET_PAYMENT_BLOCKED);
assert.equal(walletClientCalls.length, 1);

const allowedContext = await assertWalletPaymentAllowed(
  {
    id: "wallet-assert-001",
    operation: "pay_api",
    chain: "Base",
    asset: "USDC",
    to: "search.allow.dev",
    memo: "public search request"
  },
  {
    policy: { ...DEFAULT_POLICY, spentTodayUsd: 0 },
    route
  }
);

assert.equal(allowedContext.receipt.intentNonce, "wallet-assert-001");

await assert.rejects(
  () =>
    assertWalletPaymentAllowed(
      {
        id: "wallet-assert-pii-001",
        operation: "pay_api",
        chain: "Base",
        asset: "USDC",
        to: "search.allow.dev",
        memo: "call alex@example.com"
      },
      {
        policy: { ...DEFAULT_POLICY, spentTodayUsd: 0 },
        route
      }
    ),
  (error) => {
    assert.equal(error instanceof WalletPaymentBlockedError, true);
    assert.equal(error.code, WALLET_PAYMENT_BLOCKED);
    assert.equal(error.response.status, 402);
    return true;
  }
);

console.log("walletHook tests passed");
