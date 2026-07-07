#!/usr/bin/env node
import "dotenv/config";
import type { ProposedAction } from "@figaro/core/agent";
import { runTransactor, type ApprovalContext } from "./transactor.js";
import {
  makeHitlPolicy,
  makeAutonomousPolicy,
  defaultRefuseAll,
  type Policy,
} from "./policy.js";

const policyName = (process.env.POLICY ?? "hitl").trim().toLowerCase();
const policy: Policy<ProposedAction, ApprovalContext> =
  policyName === "autonomous"
    ? makeAutonomousPolicy<ProposedAction, ApprovalContext>(defaultRefuseAll)
    : makeHitlPolicy<ProposedAction, ApprovalContext>();

const config = {
  rpcUrl: requireEnv("RPC_URL"),
  privateKey: requireEnv("PRIVATE_KEY") as `0x${string}`,
  addresses: {
    core: requireEnv("FIGARO_CORE_ADDRESS") as `0x${string}`,
    clauseRegistry: requireEnv("CLAUSE_REGISTRY_ADDRESS") as `0x${string}`,
    attestationCoordinator: requireEnv("ATTESTATION_COORDINATOR_ADDRESS") as `0x${string}`,
    sellerRegistry: requireEnv("SELLER_REGISTRY_ADDRESS") as `0x${string}`,
    assemblyRegistry: requireEnv("ASSEMBLY_REGISTRY_ADDRESS") as `0x${string}`,
  },
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? 15_000),
  policy,
};

runTransactor(config).catch((err) => {
  console.error("[transactor] fatal:", err);
  process.exit(1);
});

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v === "0x") {
    console.error(`[transactor] missing or unset env var: ${name}`);
    console.error(`[transactor] copy .env.example to .env and fill in real values.`);
    process.exit(1);
  }
  return v;
}
