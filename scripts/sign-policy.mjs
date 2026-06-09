import { readFile } from "node:fs/promises";
import { DEFAULT_POLICY } from "../src/policyEngine.mjs";
import { signPolicyWithPrivateKey } from "../src/policySigner.mjs";

async function readPolicyTemplate() {
  if (!process.env.ALLOW_POLICY_TEMPLATE) return DEFAULT_POLICY;
  const raw = await readFile(process.env.ALLOW_POLICY_TEMPLATE, "utf8");
  return JSON.parse(raw);
}

const template = await readPolicyTemplate();
const signed = await signPolicyWithPrivateKey(template, process.env.ALLOW_CONTROLLER_PRIVATE_KEY);

console.log(JSON.stringify(signed.policy, null, 2));
