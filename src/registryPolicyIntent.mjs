import { encodeAbiParameters, encodeFunctionData, keccak256, stringToHex } from "viem";
import { DEFAULT_POLICY, policyFingerprint } from "./policyEngine.mjs";
import { hashCanonical } from "./receiptRegistryIntent.mjs";

export const REGISTRY_POLICY_AMOUNT_DECIMALS = 6;
export const REGISTRY_POLICY_DEFAULT_EPOCH_SECONDS = 86_400;

export const ALLOWANCE_REGISTRY_POLICY_ABI = [
  {
    type: "function",
    name: "createPolicy",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agent", type: "address" },
      { name: "settlementToken", type: "address" },
      { name: "epochCap", type: "uint128" },
      { name: "perTxCap", type: "uint128" },
      { name: "epochSeconds", type: "uint64" },
      { name: "controllerNonce", type: "bytes32" },
      { name: "merchantIds", type: "bytes32[]" }
    ],
    outputs: [{ name: "policyId", type: "bytes32" }]
  }
];

const UINT128_MAX = (1n << 128n) - 1n;
const UINT64_MAX = (1n << 64n) - 1n;
const ZERO_ADDRESS = `0x${"0".repeat(40)}`;
const ZERO_BYTES32 = `0x${"0".repeat(64)}`;

export function buildRegistryPolicyIntent(policyInput = DEFAULT_POLICY, options = {}) {
  const reasons = [];
  const warnings = [];
  const policy = normalizePolicyInput(policyInput);
  const deployment = normalizeDeployment(options.deploymentManifest || options.deployment || {});

  reasons.push(...unsafeInputReasons({ policy, options }));

  const controller = normalizeAddress(firstText(options.controller, options.controllerAddress, policy.controller));
  const agent = normalizeAddress(firstText(options.agentAddress, policy.agentAddress, policy.agent, policy.agentWallet));
  const settlementToken = normalizeAddress(
    firstText(options.settlementToken, options.settlementTokenAddress, policy.settlementTokenAddress, policy.assetAddress)
  );
  const contractAddress = normalizeAddress(
    firstText(options.contractAddress, options.registryAddress, deployment.contractAddress, deployment.registryAddress)
  );
  const chainId = positiveInteger(firstText(options.chainId, deployment.chainId, policy.chainId), "chainId", reasons);
  const network = firstText(options.network, deployment.network, policy.chain);
  const environment = firstText(options.environment, deployment.environment);

  if (!controller) reasons.push("Controller must be a 20-byte EVM address");
  else if (controller === false) reasons.push("Controller must be a 20-byte EVM address");
  else if (controller === ZERO_ADDRESS) reasons.push("Controller must not be the zero address");

  if (!agent) reasons.push("Agent must be a 20-byte EVM address");
  else if (agent === false) reasons.push("Agent must be a 20-byte EVM address");
  else if (agent === ZERO_ADDRESS) reasons.push("Agent must not be the zero address");

  if (!settlementToken) reasons.push("Settlement token must be a 20-byte EVM address");
  else if (settlementToken === false) reasons.push("Settlement token must be a 20-byte EVM address");
  else if (settlementToken === ZERO_ADDRESS && options.allowZeroSettlementToken !== true) {
    reasons.push("Settlement token must not be zero unless allowZeroSettlementToken is true");
  }

  if (options.requireDeployedRegistry === true && !contractAddress) {
    reasons.push("Registry contract address is required before external execution");
  }
  if (contractAddress === false) reasons.push("Registry contract address must be a 20-byte EVM address");

  const amountDecimals = normalizeDecimals(firstText(options.amountDecimals, policy.amountDecimals), reasons);
  const epochCap = resolveCapUnits(
    firstText(options.epochCap, options.epochCapUnits, policy.epochCap, policy.dailyCapUnits),
    firstText(options.epochCapUsd, policy.epochCapUsd, policy.dailyCapUsd),
    amountDecimals,
    "epochCap",
    reasons,
    warnings
  );
  const perTxCap = resolveCapUnits(
    firstText(options.perTxCap, options.perTxCapUnits, policy.perTxCap, policy.perTxCapUnits),
    firstText(options.perTxCapUsd, policy.perTxCapUsd),
    amountDecimals,
    "perTxCap",
    reasons,
    warnings
  );
  const epochSeconds = resolveUint64(
    firstText(options.epochSeconds, policy.epochSeconds, policy.dailyEpochSeconds, REGISTRY_POLICY_DEFAULT_EPOCH_SECONDS),
    "epochSeconds",
    reasons
  );
  const controllerNonce = resolveControllerNonce(options, policy, reasons);
  const merchantIds = resolveMerchantIds(policy, options, reasons, warnings);

  if (epochCap !== null && perTxCap !== null && perTxCap > epochCap) {
    reasons.push("perTxCap must not exceed epochCap");
  }

  const argsReady =
    reasons.length === 0 &&
    controller &&
    controller !== false &&
    agent &&
    agent !== false &&
    settlementToken &&
    settlementToken !== false &&
    chainId &&
    epochCap !== null &&
    perTxCap !== null &&
    epochSeconds !== null &&
    isBytes32(controllerNonce) &&
    merchantIds.length > 0;

  const args = argsReady
    ? [agent, settlementToken, epochCap, perTxCap, epochSeconds, controllerNonce, merchantIds]
    : null;
  const calldata = args ? encodeFunctionData({ abi: ALLOWANCE_REGISTRY_POLICY_ABI, functionName: "createPolicy", args }) : null;
  const expectedPolicyId =
    args && controller && chainId
      ? computeRegistryPolicyId({
          controller,
          agent,
          settlementToken,
          epochCap,
          perTxCap,
          epochSeconds,
          chainId,
          controllerNonce
        })
      : null;

  const registry = {
    functionName: "createPolicy",
    args: args
      ? {
          agent,
          settlementToken,
          epochCap: epochCap.toString(),
          perTxCap: perTxCap.toString(),
          epochSeconds: epochSeconds.toString(),
          controllerNonce,
          merchantIds
        }
      : null,
    argsArray: args
      ? [agent, settlementToken, epochCap.toString(), perTxCap.toString(), epochSeconds.toString(), controllerNonce, merchantIds]
      : null,
    calldata,
    expectedPolicyId,
    amountDecimals,
    merchantIdNamespace: "allow-merchant:v1",
    writeIntentHash: args
      ? registryPolicyIntentHash({
          chainId,
          contractAddress: contractAddress || null,
          controller,
          functionName: "createPolicy",
          args: [agent, settlementToken, epochCap.toString(), perTxCap.toString(), epochSeconds.toString(), controllerNonce, merchantIds],
          sourcePolicyId: policy.policyId || null
        })
      : null
  };

  return {
    valid: reasons.length === 0,
    status: reasons.length === 0 ? "ready_for_external_approval" : "needs_input",
    generatedAt: new Date().toISOString(),
    mode: "dry_run",
    contract: {
      name: "AllowanceRegistry",
      abi: ALLOWANCE_REGISTRY_POLICY_ABI,
      address: contractAddress || null,
      chainId,
      network: network || null,
      environment: environment || null,
      controller: controller && controller !== false ? controller : null
    },
    sourcePolicy: {
      policyId: policy.policyId || null,
      agentId: policy.agentId || null,
      controller: policy.controller || null,
      fingerprint: policyFingerprint(policy),
      allowedMerchants: Array.isArray(policy.allowedMerchants) ? policy.allowedMerchants : []
    },
    registry,
    safety: {
      broadcast: false,
      signsTransaction: false,
      includesPrivateKey: false,
      movesFunds: false,
      requiresHumanExecution: true,
      requiresExternalActionApproval: true,
      approvalActionType: "registry_policy_create",
      note: "This packet is calldata and hash material only; it does not deploy, sign, broadcast, custody, or transfer funds."
    },
    reasons: unique(reasons),
    warnings: unique(warnings)
  };
}

export function computeRegistryPolicyId({
  controller,
  agent,
  settlementToken,
  epochCap,
  perTxCap,
  epochSeconds,
  chainId,
  controllerNonce
} = {}) {
  if (!isAddress(controller)) throw new Error("computeRegistryPolicyId requires a controller address");
  if (!isAddress(agent)) throw new Error("computeRegistryPolicyId requires an agent address");
  if (!isAddress(settlementToken)) throw new Error("computeRegistryPolicyId requires a settlement token address");
  const epochCapUnits = parseUnitsInteger(epochCap);
  const perTxCapUnits = parseUnitsInteger(perTxCap);
  const epochSecondsValue = parseUnitsInteger(epochSeconds);
  const domainChainId = BigInt(chainId);

  if (controller.toLowerCase() === ZERO_ADDRESS) throw new Error("computeRegistryPolicyId controller must not be zero");
  if (agent.toLowerCase() === ZERO_ADDRESS) throw new Error("computeRegistryPolicyId agent must not be zero");
  if (epochCapUnits === null || epochCapUnits <= 0n || epochCapUnits > UINT128_MAX) {
    throw new Error("computeRegistryPolicyId epochCap must fit uint128");
  }
  if (perTxCapUnits === null || perTxCapUnits <= 0n || perTxCapUnits > UINT128_MAX) {
    throw new Error("computeRegistryPolicyId perTxCap must fit uint128");
  }
  if (epochSecondsValue === null || epochSecondsValue <= 0n || epochSecondsValue > UINT64_MAX) {
    throw new Error("computeRegistryPolicyId epochSeconds must fit uint64");
  }
  if (domainChainId <= 0n) throw new Error("computeRegistryPolicyId chainId must be positive");
  if (!isBytes32(controllerNonce) || controllerNonce.toLowerCase() === ZERO_BYTES32) {
    throw new Error("computeRegistryPolicyId requires a nonzero bytes32 controllerNonce");
  }

  return keccak256(
    encodeAbiParameters(
      [
        { type: "address", name: "controller" },
        { type: "address", name: "agent" },
        { type: "address", name: "settlementToken" },
        { type: "uint128", name: "epochCap" },
        { type: "uint128", name: "perTxCap" },
        { type: "uint64", name: "epochSeconds" },
        { type: "uint256", name: "chainId" },
        { type: "bytes32", name: "controllerNonce" }
      ],
      [
        controller.toLowerCase(),
        agent.toLowerCase(),
        settlementToken.toLowerCase(),
        epochCapUnits,
        perTxCapUnits,
        epochSecondsValue,
        domainChainId,
        controllerNonce.toLowerCase()
      ]
    )
  );
}

export function registryPolicyIntentHash(intent = {}) {
  return hashCanonical({
    protocol: "allow",
    type: "registry-policy-create-intent",
    version: 1,
    intent
  });
}

export function merchantIdToRegistryBytes32(merchantId) {
  return keccak256(stringToHex(`allow-merchant:v1:${String(merchantId)}`));
}

function normalizePolicyInput(input = DEFAULT_POLICY) {
  if (input.policy) return { ...DEFAULT_POLICY, ...input.policy };
  return { ...DEFAULT_POLICY, ...input };
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

function resolveControllerNonce(options, policy, reasons) {
  const explicit = firstText(options.controllerNonce, options.controllerNonceBytes32, policy.controllerNonce);
  if (explicit) {
    if (!isBytes32(explicit)) reasons.push("controllerNonce must be bytes32");
    if (String(explicit).toLowerCase() === ZERO_BYTES32) reasons.push("controllerNonce must not be zero");
    return isBytes32(explicit) ? explicit.toLowerCase() : null;
  }

  const label = firstText(options.controllerNonceLabel, policy.controllerNonceLabel);
  if (!label) {
    reasons.push("controllerNonce or controllerNonceLabel is required");
    return null;
  }
  return keccak256(stringToHex(`allow-controller-nonce:v1:${label}`));
}

function resolveMerchantIds(policy, options, reasons, warnings) {
  const explicit = arrayFrom(options.registryMerchantIds || options.merchantIdsBytes32);
  if (explicit.length > 0) {
    const invalid = explicit.filter((item) => !isBytes32(item));
    if (invalid.length > 0) reasons.push("registryMerchantIds must all be bytes32");
    return invalid.length === 0 ? explicit.map((item) => item.toLowerCase()) : [];
  }

  const merchantIds = arrayFrom(options.allowedMerchants || policy.allowedMerchants);
  if (merchantIds.length === 0 && options.allowEmptyMerchantList !== true) {
    reasons.push("At least one allowed merchant is required for registry policy creation");
    return [];
  }
  if (merchantIds.length === 0) return [];

  warnings.push("Derived registry merchantIds from offchain merchant ids; receipt writers must use the same allow-merchant:v1 namespace");
  return merchantIds.map((merchantId) => merchantIdToRegistryBytes32(merchantId));
}

function resolveCapUnits(explicitUnits, usdValue, decimals, field, reasons, warnings) {
  if (explicitUnits) {
    const parsed = parseUnitsInteger(explicitUnits);
    if (parsed === null) reasons.push(`${field} must be a positive integer unit amount`);
    else if (parsed <= 0n || parsed > UINT128_MAX) reasons.push(`${field} must be greater than zero and fit uint128`);
    return parsed;
  }

  const text = firstText(usdValue);
  if (!text) {
    reasons.push(`${field} or ${field}Usd is required`);
    return null;
  }
  const parsed = decimalToUnits(text, decimals, reasons, `${field}Usd`);
  if (parsed !== null) {
    warnings.push(`${field} inferred from USD value with ${decimals} decimals; verify registry caps use the same settlement-token unit`);
    if (parsed <= 0n || parsed > UINT128_MAX) reasons.push(`${field} must be greater than zero and fit uint128`);
  }
  return parsed;
}

function resolveUint64(value, field, reasons) {
  const parsed = parseUnitsInteger(value);
  if (parsed === null || parsed <= 0n || parsed > UINT64_MAX) {
    reasons.push(`${field} must be a positive integer that fits uint64`);
    return null;
  }
  return parsed;
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

function parseUnitsInteger(value) {
  if (typeof value === "bigint") return value;
  const text = String(value ?? "").trim();
  if (!/^\d+$/.test(text)) return null;
  return BigInt(text);
}

function normalizeDecimals(value, reasons) {
  const raw = firstText(value);
  if (!raw) return REGISTRY_POLICY_AMOUNT_DECIMALS;
  const decimals = Number(raw);
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
    reasons.push("amountDecimals must be an integer between 0 and 18");
    return REGISTRY_POLICY_AMOUNT_DECIMALS;
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
      reasons.push(`Registry policy intent input must not include secret field ${childPath.join(".")}`);
    }
    if (/^(signedTransaction|rawTransaction)$/i.test(key) && child) {
      reasons.push("Registry policy intent input must not include signed or raw transaction bytes");
    }
    if (child && typeof child === "object") reasons.push(...unsafeInputReasons(child, childPath));
  }
  return reasons;
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

function arrayFrom(values) {
  if (!Array.isArray(values)) return [];
  return values.map((item) => String(item || "").trim()).filter(Boolean);
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
