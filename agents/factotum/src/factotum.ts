import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
// The exact named exports below match @figaro/core/agent v0.1.x. If the SDK
// version drifts, adjust the imports — the architecture (sync → propose →
// policy → execute) is stable; type names may evolve.
import {
  FigaroContext,
  proposeActions,
  executeAction,
  type ProposedAction,
} from "@figaro/core/agent";
import type { Policy, PolicyEntry } from "./policy.js";

export interface FactotumAddresses {
  core: `0x${string}`;
  schemaRegistry: `0x${string}`;
  attestationCoordinator: `0x${string}`;
  operatorRegistry: `0x${string}`;
}

export interface FactotumConfig {
  rpcUrl: string;
  privateKey: `0x${string}`;
  addresses: FactotumAddresses;
  pollIntervalMs: number;
  policy: Policy<ProposedAction, ApprovalContext>;
}

export interface ApprovalContext {
  processId: string;
}

export async function runFactotum(config: FactotumConfig): Promise<void> {
  const account = privateKeyToAccount(config.privateKey);
  const publicClient = createPublicClient({ transport: http(config.rpcUrl) });
  const walletClient = createWalletClient({ account, transport: http(config.rpcUrl) });

  const ctx = new FigaroContext(publicClient, config.addresses);

  console.log(`[factotum] address ${account.address}`);
  console.log(`[factotum] policy ${config.policy.name}`);
  console.log(`[factotum] polling every ${config.pollIntervalMs}ms`);

  // Main loop: sync → propose → policy → execute.
  // Replace polling with a websocket subscription for production use.
  let stop = false;
  process.on("SIGINT", () => {
    console.log("\n[factotum] shutting down");
    stop = true;
  });

  while (!stop) {
    try {
      await tick(ctx, walletClient, account.address, config);
    } catch (err) {
      console.error("[factotum] tick error:", err);
    }
    await sleep(config.pollIntervalMs);
  }
}

async function tick(
  ctx: FigaroContext,
  walletClient: ReturnType<typeof createWalletClient>,
  myAddress: `0x${string}`,
  config: FactotumConfig,
): Promise<void> {
  await ctx.sync();

  // The proposer infers role from process state + my address.
  // Same factotum, different role per process — buyer in one, seller in another.
  // The role is read from state, never hard-coded; this is what actor-neutrality
  // looks like in code.
  const myProcesses = ctx.getMyProcesses(myAddress);
  if (myProcesses.length === 0) return;

  const entries: PolicyEntry<ProposedAction, ApprovalContext>[] = [];
  for (const process of myProcesses) {
    const actions = proposeActions(process, myAddress);
    for (const action of actions) {
      entries.push({ action, approvalContext: { processId: process.processId } });
    }
  }
  if (entries.length === 0) return;

  console.log(
    `[factotum] ${entries.length} proposed action(s) across ${myProcesses.length} process(es)`,
  );

  const decisions = await config.policy.decide(entries);

  // Execute approved actions sequentially. Do NOT parallelize:
  // some actions modify protocol state others depend on (e.g., commit before resolve).
  for (const decision of decisions) {
    if (decision.action === "approve") {
      try {
        const result = await executeAction(walletClient, config.addresses, decision.entry.action);
        console.log(
          `[factotum] executed: ${decision.entry.action.type} → ${result.hash}`,
        );
      } catch (err) {
        console.error(`[factotum] execution failed for ${decision.entry.action.type}:`, err);
      }
    } else {
      console.log(
        `[factotum] rejected: ${decision.entry.action.type} — ${decision.reason ?? "no reason"}`,
      );
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
