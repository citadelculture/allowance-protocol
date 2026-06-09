import { encodeAbiParameters, encodeFunctionData, keccak256, stringToHex } from "viem";
import { isCrediblePilotEvidence, normalizeReceiptEvidence } from "./receiptStore.mjs";

export const RECEIPT_REGISTRY_AMOUNT_DECIMALS = 6;

export const ALLOWANCE_REGISTRY_ABI = [
  {
    type: "function",
    name: "recordReceipt",
    stateMutability: "nonpayable",
    inputs: [
      { name: "policyId", type: "bytes32" },
      { name: "merchantId", type: "bytes32" },
      { name: "amount", type: "uint128" },
      { name: "intentHash", type: "bytes32" },
      { name: "intentNonce", type: "bytes32" },
      { name: "metadataHash", type: "bytes32" }
    ],
    outputs: [{ name: "receiptId", type: "bytes32" }]
  }
];

const UINT128_MAX = (1n << 128n) - 1n;
const ZERO_BYTES32 = `0x${"0".repeat(64)}`;

export function buildReceiptRegistryIntent(entry = {}, options = {}) {
  const reasons = [];
  const warnings = [];
  const { record, receipt } = normalizeRegistryIntentInput(entry);
  const generatedAt = new Date().toISOString();

  if (!receipt || Object.keys(receipt).length === 0) reasons.push("Missing receipt record");
  reasons.push(...unsafeInputReasons(record));

  const evidence = normalizeReceiptEvidence(record.evidence || receipt.evidence || {});
  if (options.requireCredibleEvidence === true && !isCrediblePilotEvidence({ evidence })) {
    reasons.push("Receipt registry intent requires merchant-approved testnet or mainnet evidence");
  }
  if (options.requireMerchantApproval === true && !evidence.merchantApproved) {
    reasons.push("Receipt registry intent requires merchant-approved receipt evidence");
  }
  if (evidence.environment === "local") {
    warnings.push("Local demo receipt evidence must not be presented as pilot or production usage");
  }

  const decision = firstText(receipt.decision, record.decision);
  if (!decision) reasons.push("Receipt decision is required");
  if (options.requireAllowedDecision !== false && decision && decision !== "allow") {
    reasons.push("Only allowed payment receipts can be prepared for registry recording");
  }

  const deployment = normalizeDeployment(options.deploymentManifest || options.deployment || {});
  const chainId = positiveInteger(
    firstText(options.chainId, deployment.chainId, receipt.chainId, record.chainId),
    "chainId",
    reasons
  );
  const network = firstText(options.network, deployment.network, evidence.network, receipt.network, record.network);
  const environment = firstText(options.environment, deployment.environment, evidence.environment);
  const contractAddress = normalizeAddress(
    firstText(options.contractAddress, options.registryAddress, deployment.contractAddress, deployment.registryAddress)
  );
  const recorder = normalizeAddress(firstText(options.recorder, options.recorderAddress, record.recorder, receipt.recorder));

  if (options.requireDeployedRegistry === true && !contractAddress) {
    reasons.push("Registry contract address is required before external execution");
  }
  if (contractAddress === false) reasons.push("Registry contract address must be a 20-byte EVM address");
  if (recorder === false) reasons.push("Recorder must be a 20-byte EVM address");

  const registryPolicyId = firstText(
    options.registryPolicyId,
    options.policyId,
    record.registryPolicyId,
    record.onchain?.policyId,
    receipt.registryPolicyId,
    receipt.onchainPolicyId,
    receipt.onchain?.policyId,
    isBytes32(receipt.policyId) ? receipt.policyId : ""
  );
  if (!isBytes32(registryPolicyId)) {
    reasons.push("registryPolicyId must be the bytes32 policy id returned by AllowanceRegistry.createPolicy");
  } else if (registryPolicyId.toLowerCase() === ZERO_BYTES32) {
    reasons.push("registryPolicyId must not be zero");
  }

  const sourceMerchantId = firstText(receipt.merchantId, record.merchantId);
  const merchantId = resolveMerchantBytes32(record, receipt, options, sourceMerchantId, reasons, warnings);
  const { amountUnits, amountDecimals } = resolveAmountUnits(record, receipt, options, reasons, warnings);
  const intentNonce = resolveIntentNonce(record, receipt, options, reasons);
  const intentHash = resolveIntentHash(record, receipt, options);
  const metadataHash = resolveMetadataHash(record, receipt, options);

  const argsReady =
    reasons.length === 0 &&
    isBytes32(registryPolicyId) &&
    isBytes32(merchantId) &&
    amountUnits !== null &&
    isBytes32(intentHash) &&
    isBytes32(intentNonce) &&
    isBytes32(metadataHash);

  const args = argsReady
    ? [registryPolicyId.toLowerCase(), merchantId.toLowerCase(), amountUnits, intentHash, intentNonce, metadataHash]
    : null;
  const calldata = args ? encodeFunctionData({ abi: ALLOWANCE_REGISTRY_ABI, functionName: "recordReceipt", args }) : null;
  const expectedReceiptId =
    args && recorder && chainId
      ? computeRegistryReceiptId({
          policyId: args[0],
          merchantId: args[1],
          amountUnits,
          intentHash: args[3],
          intentNonce: args[4],
          metadataHash: args[5],
          recorder,
          chainId
        })
      : null;

  if (args && !expectedReceiptId) {
    warnings.push("Expected registry receipt id cannot be computed until recorder and chainId are known");
  }

  const registry = {
    functionName: "recordReceipt",
    args: args
      ? {
          policyId: args[0],
          merchantId: args[1],
          amount: amountUnits.toString(),
          intentHash: args[3],
          intentNonce: args[4],
          metadataHash: args[5]
        }
      : null,
    argsArray: args ? [args[0], args[1], amountUnits.toString(), args[3], args[4], args[5]] : null,
    calldata,
    expectedReceiptId,
    amountDecimals,
    merchantIdNamespace: "allow-merchant:v1",
    intentNonceNamespace: "allow-intent-nonce:v1",
    writeIntentHash: args
      ? registryWriteIntentHash({
          chainId,
          contractAddress: contractAddress || null,
          recorder: recorder || null,
          functionName: "recordReceipt",
          args: [args[0], args[1], amountUnits.toString(), args[3], args[4], args[5]],
          sourceReceiptId: receipt.id || null
        })
      : null
  };

  return {
    valid: reasons.length === 0,
    status: reasons.length === 0 ? "ready_for_external_approval" : "needs_input",
    generatedAt,
    mode: "dry_run",
    contract: {
      name: "AllowanceRegistry",
      abi: ALLOWANCE_REGISTRY_ABI,
      address: contractAddress || null,
      chainId,
      network: network || null,
      environment: environment || null,
      recorder: recorder || null
    },
    sourceReceipt: {
      id: receipt.id || null,
      policyId: receipt.policyId || null,
      merchantId: sourceMerchantId || null,
      amountUsd: receipt.amountUsd ?? record.amountUsd ?? null,
      decision: decision || null,
      intentNonce: receipt.intentNonce || null,
      intentHash: receipt.intentHash || null,
      metadataHash: receipt.metadataHash || null,
      evidence
    },
    registry,
    safety: {
      broadcast: false,
      signsTransaction: false,
      includesPrivateKey: false,
      movesFunds: false,
      requiresHumanExecution: true,
      requiresExternalActionApproval: true,
      approvalActionType: "registry_receipt_write",
      note: "This packet is calldata and hash material only; it does not deploy, sign, broadcast, custody, or transfer funds."
    },
    reasons: unique(reasons),
    warnings: unique(warnings)
  };
}

export function computeRegistryReceiptId({
  policyId,
  merchantId,
  amountUnits,
  intentHash,
  intentNonce,
  metadataHash,
  recorder,
  chainId
} = {}) {
  if (!isBytes32(policyId) || !isBytes32(merchantId) || !isBytes32(intentHash) || !isBytes32(intentNonce)) {
    throw new Error("computeRegistryReceiptId requires bytes32 policy, merchant, intent hash, and intent nonce");
  }
  if (!isBytes32(metadataHash)) throw new Error("computeRegistryReceiptId requires bytes32 metadataHash");
  if (!isAddress(recorder)) throw new Error("computeRegistryReceiptId requires a recorder address");
  const amount = parseAmountUnits(amountUnits);
  const domainChainId = BigInt(chainId);
  if (amount === null || amount <= 0n || amount > UINT128_MAX) {
    throw new Error("computeRegistryReceiptId amount must fit uint128");
  }
  if (domainChainId <= 0n) throw new Error("computeRegistryReceiptId chainId must be positive");

  return keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32", name: "policyId" },
        { type: "bytes32", name: "merchantId" },
        { type: "uint128", name: "amount" },
        { type: "bytes32", name: "intentHash" },
        { type: "bytes32", name: "intentNonce" },
        { type: "bytes32", name: "metadataHash" },
        { type: "address", name: "recorder" },
        { type: "uint256", name: "chainId" }
      ],
      [
        policyId.toLowerCase(),
        merchantId.toLowerCase(),
        amount,
        intentHash.toLowerCase(),
        intentNonce.toLowerCase(),
        metadataHash.toLowerCase(),
        recorder,
        domainChainId
      ]
    )
  );
}

export function registryWriteIntentHash(intent = {}) {
  return hashCanonical({
    protocol: "allow",
    type: "registry-receipt-write-intent",
    version: 1,
    intent
  });
}

export function hashCanonical(value) {
  return keccak256(stringToHex(canonicalJson(value)));
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function normalizeRegistryIntentInput(entry = {}) {
  if (entry.receiptRecord) return { record: entry.receiptRecord, receipt: entry.receiptRecord.receipt || {} };
  if (entry.record) return { record: entry.record, receipt: entry.record.receipt || entry.record };
  if (entry.receipt) return { record: entry, receipt: entry.receipt };
  if (entry.decision || entry.policyId || entry.intentNonce || entry.intentHash) {
    return { record: { receipt: entry, evidence: entry.evidence || {} }, receipt: entry };
  }
  return { record: entry || {}, receipt: {} };
}

function normalizeDeployment(deployment = {}) {
  const target = deployment.target || {};
  const contract = deployment.contract || {};
  return {
    chainId: deployment.chainId || target.chainId,
    network: deployment.network || target.network,
    environment: deployment.environment || target.environment,
    contractAddress: deployment.contractAddress || deployment.registryAddress || contract.address || target.contractAddress,
    registryAddress: deployment.registryAddress
  };
}

function resolveMerchantBytes32(record, receipt, options, sourceMerchantId, reasons, warnings) {
  const explicit = firstText(
    options.registryMerchantId,
    options.merchantIdBytes32,
    record.registryMerchantId,
    record.onchain?.merchantId,
    receipt.registryMerchantId,
    receipt.merchantIdBytes32,
    receipt.onchain?.merchantId
  );
  if (explicit) {
    if (!isBytes32(explicit)) reasons.push("registryMerchantId must be bytes32");
    return isBytes32(explicit) ? explicit.toLowerCase() : null;
  }
  if (!sourceMerchantId) {
    reasons.push("Receipt merchantId is required");
    return null;
  }
  warnings.push("Derived registry merchantId from offchain merchantId; createPolicy must use the same allow-merchant:v1 namespace");
  return hashDomain("allow-merchant:v1", sourceMerchantId);
}

function resolveAmountUnits(record, receipt, options, reasons, warnings) {
  const amountDecimals = normalizeDecimals(firstText(options.amountDecimals, receipt.amountDecimals, record.amountDecimals), reasons);
  const explicit = firstText(options.amountUnits, options.registryAmount, receipt.amountUnits, receipt.registryAmount);
  const amountUnits = explicit
    ? parseAmountUnits(explicit)
    : amountUsdToUnits(firstText(options.amountUsd, receipt.amountUsd, record.amountUsd), amountDecimals, reasons);

  if (explicit && amountUnits === null) reasons.push("Registry amount must be a positive integer");
  if (!explicit && amountUnits !== null) {
    warnings.push(`Amount units inferred from amountUsd with ${amountDecimals} decimals; verify registry policy caps use the same unit`);
  }
  if (amountUnits !== null && (amountUnits <= 0n || amountUnits > UINT128_MAX)) {
    reasons.push("Registry amount must be greater than zero and fit uint128");
  }

  return { amountUnits, amountDecimals };
}

function resolveIntentNonce(record, receipt, options, reasons) {
  const explicit = firstText(
    options.intentNonceBytes32,
    options.registryIntentNonce,
    record.registryIntentNonce,
    receipt.registryIntentNonce,
    receipt.intentNonceBytes32
  );
  if (explicit) {
    if (!isBytes32(explicit)) reasons.push("registryIntentNonce must be bytes32");
    if (String(explicit).toLowerCase() === ZERO_BYTES32) reasons.push("registryIntentNonce must not be zero");
    return isBytes32(explicit) ? explicit.toLowerCase() : null;
  }

  const sourceNonce = firstText(receipt.intentNonce, record.intentNonce);
  if (!sourceNonce || sourceNonce === "missing") {
    reasons.push("Receipt intentNonce is required for registry replay protection");
    return null;
  }
  return hashDomain("allow-intent-nonce:v1", sourceNonce);
}

function resolveIntentHash(record, receipt, options) {
  const explicit = firstText(options.intentHashBytes32, options.registryIntentHash, record.registryIntentHash, receipt.registryIntentHash);
  if (isBytes32(explicit)) return explicit.toLowerCase();
  return hashCanonical({
    namespace: "allow-intent:v1",
    policyId: receipt.policyId || null,
    agentId: receipt.agentId || null,
    merchantId: receipt.merchantId || record.merchantId || null,
    amountUsd: receipt.amountUsd ?? record.amountUsd ?? null,
    resource: receipt.resource || null,
    intentNonce: receipt.intentNonce || null,
    offchainIntentHash: receipt.intentHash || null
  });
}

function resolveMetadataHash(record, receipt, options) {
  const explicit = firstText(options.metadataHashBytes32, options.registryMetadataHash, record.registryMetadataHash, receipt.registryMetadataHash);
  if (isBytes32(explicit)) return explicit.toLowerCase();
  return hashCanonical({
    namespace: "allow-metadata:v1",
    sourceMetadataHash: receipt.metadataHash || null,
    resource: receipt.resource || null,
    receiptId: receipt.id || null,
    evidence: normalizeReceiptEvidence(record.evidence || receipt.evidence || {})
  });
}

function amountUsdToUnits(value, decimals, reasons) {
  const text = firstText(value);
  if (!text) {
    reasons.push("Receipt amountUsd or explicit amountUnits is required");
    return null;
  }
  return decimalToUnits(text, decimals, reasons, "amountUsd");
}

function decimalToUnits(value, decimals, reasons, field) {
  const text = String(value).trim();
  if (!/^\d+(\.\d+)?$/.test(text)) {
    reasons.push(`${field} must be a positive decimal`);
    return null;
  }
  const [whole, fraction = ""] = text.split(".");
  if (fraction.length > decimals && /[1-9]/.test(fraction.slice(decimals))) {
    reasons.push(`${field} has more than ${decimals} decimal places`);
    return null;
  }
  const padded = `${fraction}${"0".repeat(decimals)}`.slice(0, decimals);
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(padded || "0");
}

function parseAmountUnits(value) {
  if (typeof value === "bigint") return value;
  const text = String(value ?? "").trim();
  if (!/^\d+$/.test(text)) return null;
  return BigInt(text);
}

function normalizeDecimals(value, reasons) {
  const raw = firstText(value);
  if (!raw) return RECEIPT_REGISTRY_AMOUNT_DECIMALS;
  const decimals = Number(raw);
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
    reasons.push("amountDecimals must be an integer between 0 and 18");
    return RECEIPT_REGISTRY_AMOUNT_DECIMALS;
  }
  return decimals;
}

function positiveInteger(value, field, reasons) {
  const raw = firstText(value);
  const number = Number(raw);
  if (!Number.isInteger(number) || number <= 0) {
    reasons.push(`${field} must be a positive integer`);
    return null;
  }
  return number;
}

function unsafeInputReasons(value, path = []) {
  if (!value || typeof value !== "object") return [];
  const reasons = [];
  for (const [key, child] of Object.entries(value)) {
    const childPath = [...path, key];
    if (/(private.?key|mnemonic|seed.?phrase|recovery.?phrase|password|bearer.?token|api.?key|secret)/i.test(key)) {
      reasons.push(`Receipt registry intent input must not include secret field ${childPath.join(".")}`);
    }
    if (/^(metadata|rawMetadata|paymentMetadata)$/i.test(key) && typeof child === "string" && child.trim()) {
      reasons.push("Receipt registry intent input must include metadataHash, not raw metadata");
    }
    if (/^(signedTransaction|rawTransaction)$/i.test(key) && child) {
      reasons.push("Receipt registry intent input must not include signed or raw transaction bytes");
    }
    if (child && typeof child === "object") reasons.push(...unsafeInputReasons(child, childPath));
  }
  return reasons;
}

function hashDomain(domain, value) {
  return keccak256(stringToHex(`${domain}:${String(value)}`));
}

function canonicalize(value) {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  if (!value || typeof value !== "object") return value;

  return Object.keys(value)
    .sort()
    .reduce((acc, key) => {
      acc[key] = canonicalize(value[key]);
      return acc;
    }, {});
}

function normalizeAddress(value) {
  const text = firstText(value);
  if (!text) return null;
  return isAddress(text) ? text.toLowerCase() : false;
}

function isAddress(value) {
  return /^0x[0-9a-fA-F]{40}$/.test(String(value || ""));
}

function isBytes32(value) {
  return /^0x[0-9a-fA-F]{64}$/.test(String(value || ""));
}

function firstText(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

function unique(values) {
  return [...new Set(values)];
}
