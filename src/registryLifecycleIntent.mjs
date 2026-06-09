import { encodeFunctionData } from "viem";
import { hashCanonical } from "./receiptRegistryIntent.mjs";
import { merchantIdToRegistryBytes32 } from "./registryPolicyIntent.mjs";

export const REGISTRY_LIFECYCLE_ACTIONS = ["set_policy_active", "set_merchant_allowed"];

export const ALLOWANCE_REGISTRY_LIFECYCLE_ABI = [
  {
    type: "function",
    name: "setPolicyActive",
    stateMutability: "nonpayable",
    inputs: [
      { name: "policyId", type: "bytes32" },
      { name: "active", type: "bool" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "setMerchantAllowed",
    stateMutability: "nonpayable",
    inputs: [
      { name: "policyId", type: "bytes32" },
      { name: "merchantId", type: "bytes32" },
      { name: "allowed", type: "bool" }
    ],
    outputs: []
  }
];

const ZERO_BYTES32 = `0x${"0".repeat(64)}`;

export function buildRegistryLifecycleIntent(packet = {}, options = {}) {
  const reasons = [];
  const warnings = [];
  const action = String(options.action || packet.action || "").trim();
  const deployment = normalizeDeployment(options.deploymentManifest || options.deployment || packet.deploymentManifest || packet.deployment || {});

  reasons.push(...unsafeInputReasons({ packet, options }));
  if (!REGISTRY_LIFECYCLE_ACTIONS.includes(action)) reasons.push("Invalid registry lifecycle action");

  const contractAddress = normalizeAddress(
    firstText(options.contractAddress, options.registryAddress, packet.contractAddress, packet.registryAddress, deployment.contractAddress, deployment.registryAddress)
  );
  const controller = normalizeAddress(firstText(options.controller, options.controllerAddress, packet.controller, packet.controllerAddress));
  const chainId = positiveInteger(firstText(options.chainId, packet.chainId, deployment.chainId), "chainId", reasons);
  const network = firstText(options.network, packet.network, deployment.network);
  const environment = firstText(options.environment, packet.environment, deployment.environment);

  if (options.requireDeployedRegistry === true && !contractAddress) {
    reasons.push("Registry contract address is required before external execution");
  }
  if (contractAddress === false) reasons.push("Registry contract address must be a 20-byte EVM address");
  if (controller === false) reasons.push("Controller must be a 20-byte EVM address");

  const policyId = firstText(options.policyId, options.registryPolicyId, packet.policyId, packet.registryPolicyId);
  if (!isBytes32(policyId)) reasons.push("policyId must be bytes32");
  else if (policyId.toLowerCase() === ZERO_BYTES32) reasons.push("policyId must not be zero");

  const lifecycle = resolveLifecycleArgs(action, packet, options, reasons, warnings);
  const argsReady = reasons.length === 0 && isBytes32(policyId) && lifecycle.ready;
  const functionName = lifecycle.functionName;
  const args = argsReady ? [policyId.toLowerCase(), ...lifecycle.args] : null;
  const calldata = args ? encodeFunctionData({ abi: ALLOWANCE_REGISTRY_LIFECYCLE_ABI, functionName, args }) : null;

  const registry = {
    action: action || null,
    functionName: functionName || null,
    args: args ? lifecycle.namedArgs(policyId.toLowerCase()) : null,
    argsArray: args ? lifecycle.argsArray(policyId.toLowerCase()) : null,
    calldata,
    merchantIdNamespace: action === "set_merchant_allowed" ? "allow-merchant:v1" : null,
    writeIntentHash: args
      ? registryLifecycleIntentHash({
          chainId,
          contractAddress: contractAddress || null,
          controller: controller || null,
          action,
          functionName,
          args: lifecycle.argsArray(policyId.toLowerCase())
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
      abi: ALLOWANCE_REGISTRY_LIFECYCLE_ABI,
      address: contractAddress || null,
      chainId,
      network: network || null,
      environment: environment || null,
      controller: controller || null
    },
    registry,
    safety: {
      broadcast: false,
      signsTransaction: false,
      includesPrivateKey: false,
      movesFunds: false,
      requiresHumanExecution: true,
      requiresExternalActionApproval: true,
      approvalActionType: "registry_lifecycle_update",
      note: "This packet is calldata and hash material only; it does not sign, broadcast, custody, or transfer funds."
    },
    reasons: unique(reasons),
    warnings: unique(warnings)
  };
}

export function registryLifecycleIntentHash(intent = {}) {
  return hashCanonical({
    protocol: "allow",
    type: "registry-lifecycle-intent",
    version: 1,
    intent
  });
}

function resolveLifecycleArgs(action, packet, options, reasons, warnings) {
  if (action === "set_policy_active") {
    const active = booleanField(options.active ?? packet.active, "active", reasons);
    return {
      ready: active !== null,
      functionName: "setPolicyActive",
      args: active === null ? [] : [active],
      namedArgs: (policyId) => ({ policyId, active }),
      argsArray: (policyId) => [policyId, active]
    };
  }

  if (action === "set_merchant_allowed") {
    const allowed = booleanField(options.allowed ?? packet.allowed, "allowed", reasons);
    const merchant = resolveMerchantId(packet, options, reasons, warnings);
    return {
      ready: allowed !== null && isBytes32(merchant),
      functionName: "setMerchantAllowed",
      args: allowed === null || !isBytes32(merchant) ? [] : [merchant, allowed],
      namedArgs: (policyId) => ({ policyId, merchantId: merchant, allowed }),
      argsArray: (policyId) => [policyId, merchant, allowed]
    };
  }

  return {
    ready: false,
    functionName: null,
    args: [],
    namedArgs: () => null,
    argsArray: () => null
  };
}

function resolveMerchantId(packet, options, reasons, warnings) {
  const explicit = firstText(options.registryMerchantId, options.merchantIdBytes32, packet.registryMerchantId, packet.merchantIdBytes32);
  if (explicit) {
    if (!isBytes32(explicit)) reasons.push("registryMerchantId must be bytes32");
    return isBytes32(explicit) ? explicit.toLowerCase() : null;
  }

  const merchantId = firstText(options.merchantId, packet.merchantId);
  if (!merchantId) {
    reasons.push("merchantId or registryMerchantId is required");
    return null;
  }
  warnings.push("Derived registry merchantId from offchain merchantId; createPolicy must use the same allow-merchant:v1 namespace");
  return merchantIdToRegistryBytes32(merchantId);
}

function booleanField(value, field, reasons) {
  if (value === true || value === false) return value;
  if (value === "true") return true;
  if (value === "false") return false;
  reasons.push(`${field} must be true or false`);
  return null;
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

function unsafeInputReasons(value, path = []) {
  if (!value || typeof value !== "object") return [];
  const reasons = [];
  for (const [key, child] of Object.entries(value)) {
    const childPath = [...path, key];
    if (/(private.?key|mnemonic|seed.?phrase|recovery.?phrase|password|bearer.?token|api.?key|secret)/i.test(key)) {
      reasons.push(`Registry lifecycle intent input must not include secret field ${childPath.join(".")}`);
    }
    if (/^(signedTransaction|rawTransaction)$/i.test(key) && child) {
      reasons.push("Registry lifecycle intent input must not include signed or raw transaction bytes");
    }
    if (child && typeof child === "object") reasons.push(...unsafeInputReasons(child, childPath));
  }
  return reasons;
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
