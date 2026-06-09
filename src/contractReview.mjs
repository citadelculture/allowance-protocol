import { readFile } from "node:fs/promises";

export function evaluateAllowanceRegistryReview(source = "") {
  const compact = stripComments(source);
  const gates = [
    gate("contract.identity", hasAll(compact, ["contract AllowanceRegistry", "struct Policy"]), {
      pass: "AllowanceRegistry contract and Policy struct are present",
      fail: "AllowanceRegistry contract or Policy struct is missing"
    }),
    gate("contract.no_custody", noCustodyPatterns(compact), {
      pass: "No payable entrypoint or transfer primitive detected",
      fail: "Potential fund custody or transfer primitive detected",
      details: custodyFindings(compact)
    }),
    gate("contract.policy_identity", hasAll(compact, ["controllerNonce", "block.chainid", "keccak256", "PolicyCreated"]), {
      pass: "Policy ids include controller nonce and chain domain",
      fail: "Policy identity is missing nonce or chain-domain binding"
    }),
    gate("contract.authorization", hasAll(compact, ["NotController", "NotAuthorizedRecorder", "msg.sender != policy.controller && msg.sender != policy.agent"]), {
      pass: "Controller and authorized recorder checks are present",
      fail: "Authorization checks are incomplete"
    }),
    gate("contract.merchant_allowlist", hasAll(compact, ["allowedMerchant", "MerchantNotAllowed", "setMerchantAllowed"]), {
      pass: "Merchant allowlist enforcement is present",
      fail: "Merchant allowlist enforcement is incomplete"
    }),
    gate("contract.spend_caps", hasAll(compact, ["epochCap", "perTxCap", "spentInEpoch", "PerTransactionCapExceeded", "EpochCapExceeded"]), {
      pass: "Per-transaction and epoch cap controls are present",
      fail: "Spend cap controls are incomplete"
    }),
    gate("contract.replay_protection", hasAll(compact, ["mapping(bytes32 => mapping(bytes32 => bool)) public usedIntentNonce", "InvalidReceiptNonce", "ReceiptReplay", "usedIntentNonce[policyId][intentNonce] = true"]), {
      pass: "Intent nonce replay protection is present",
      fail: "Intent nonce replay protection is incomplete"
    }),
    gate("contract.receipt_hashes_only", receiptHashesOnly(compact), {
      pass: "Receipt event stores hashes and ids rather than raw metadata",
      fail: "Receipt event may expose raw metadata or omit required hashes"
    }),
    gate("contract.lifecycle", hasAll(compact, ["PolicyActiveSet", "setPolicyActive", "InactivePolicy"]), {
      pass: "Policy activation lifecycle is present",
      fail: "Policy activation lifecycle is incomplete"
    })
  ];

  return {
    valid: gates.every((item) => item.status === "pass"),
    gates,
    blockers: gates.filter((item) => item.status !== "pass").map((item) => item.message),
    warnings: [
      "Automated source review is not an independent smart contract audit",
      "Run compiler tests, static analysis, and external review before deployment"
    ]
  };
}

export async function reviewAllowanceRegistry(path) {
  return evaluateAllowanceRegistryReview(await readFile(path, "utf8"));
}

function gate(id, condition, options) {
  return {
    id,
    status: condition ? "pass" : "fail",
    message: condition ? options.pass : options.fail,
    details: options.details || null
  };
}

function stripComments(source) {
  return String(source)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

function hasAll(source, needles) {
  return needles.every((needle) => source.includes(needle));
}

function noCustodyPatterns(source) {
  return custodyFindings(source).length === 0;
}

function custodyFindings(source) {
  const patterns = [
    { label: "payable", pattern: /\bpayable\b/ },
    { label: "receive", pattern: /\breceive\s*\(/ },
    { label: "fallback", pattern: /\bfallback\s*\(/ },
    { label: "eth_transfer", pattern: /\.transfer\s*\(/ },
    { label: "eth_send", pattern: /\.send\s*\(/ },
    { label: "value_call", pattern: /\.call\s*\{\s*value\s*:/ },
    { label: "delegatecall", pattern: /\.delegatecall\s*\(/ },
    { label: "selfdestruct", pattern: /\bselfdestruct\s*\(/ },
    { label: "erc20_transfer", pattern: /\btransferFrom\s*\(|\btransfer\s*\(/ }
  ];

  return patterns.filter((item) => item.pattern.test(source)).map((item) => item.label);
}

function receiptHashesOnly(source) {
  const eventMatch = source.match(/event\s+ReceiptRecorded\s*\(([\s\S]*?)\)\s*;/);
  if (!eventMatch) return false;
  const eventBody = eventMatch[1];
  const requiredFields = ["policyId", "receiptId", "merchantId", "amount", "intentHash", "intentNonce", "metadataHash"];
  const hasRequiredFields = requiredFields.every((field) => eventBody.includes(field));
  const rawMetadataField = /\bstring\s+\w*metadata\w*\b|\bbytes\s+\w*metadata\w*\b/i.test(eventBody);
  const rawResourceField = /\bstring\s+\w*resource\w*\b|\bbytes\s+\w*resource\w*\b/i.test(eventBody);

  return hasRequiredFields && !rawMetadataField && !rawResourceField;
}
