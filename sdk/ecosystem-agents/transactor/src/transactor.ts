import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
// The exact named exports below match @figaro/core/agent v0.1.x. If the SDK
// version drifts, adjust the imports — the architecture (sync → propose →
// policy → execute) is stable; type names may evolve.
import {
  FigaroContext,
  proposeActions,
  proposeInitiations,
  executeAction,
  type ProposedAction,
} from "@figaro/core/agent";
import type { Policy, PolicyEntry } from "./policy.js";

export interface TransactorAddresses {
  core: `0x${string}`;
  clauseRegistry: `0x${string}`;
  attestationCoordinator: `0x${string}`;
  sellerRegistry: `0x${string}`;
  assemblyRegistry: `0x${string}`;
}

export interface TransactorConfig {
  rpcUrl: string;
  privateKey: `0x${string}`;
  addresses: TransactorAddresses;
  pollIntervalMs: number;
  policy: Policy<ProposedAction, ApprovalContext>;
}

export interface ApprovalContext {
  processId: string;
}

export async function runTransactor(config: TransactorConfig): Promise<void> {
  const account = privateKeyToAccount(config.privateKey);
  const publicClient = createPublicClient({ transport: http(config.rpcUrl) });
  const walletClient = createWalletClient({ account, transport: http(config.rpcUrl) });

  const ctx = new FigaroContext(publicClient, config.addresses);

  console.log(`[transactor] address ${account.address}`);
  console.log(`[transactor] policy ${config.policy.name}`);
  console.log(`[transactor] polling every ${config.pollIntervalMs}ms`);

  // Main loop: sync → propose → policy → execute.
  // Replace polling with a websocket subscription for production use.
  let stop = false;
  process.on("SIGINT", () => {
    console.log("\n[transactor] shutting down");
    stop = true;
  });

  while (!stop) {
    try {
      await tick(ctx, walletClient, account.address, config);
    } catch (err) {
      console.error("[transactor] tick error:", err);
    }
    await sleep(config.pollIntervalMs);
  }
}

async function tick(
  ctx: FigaroContext,
  walletClient: ReturnType<typeof createWalletClient>,
  myAddress: `0x${string}`,
  config: TransactorConfig,
): Promise<void> {
  await ctx.sync();

  const entries: PolicyEntry<ProposedAction, ApprovalContext>[] = [];

  // Process-scoped actions. The proposer infers role from process state + my
  // address — same transactor, different role per process (buyer in one, seller in
  // another). The role is read from state, never hard-coded; this is what
  // actor-neutrality looks like in code.
  const myProcesses = ctx.getMyProcesses(myAddress);
  for (const process of myProcesses) {
    for (const action of proposeActions(process, myAddress)) {
      entries.push({ action, approvalContext: { processId: process.processId } });
    }
  }

  // Cold-start origination. A fresh-key agent is in NO process, but the
  // discovered assembly catalogue lets it propose starting one — so it is no
  // longer inert. Executing an approved initiation still needs the counterparty
  // signature (a coordination-channel concern), which the reference loop does
  // not gather; the default refuse-all policy declines these, and a real buyer
  // policy filters to the assemblies it cares about.
  for (const action of proposeInitiations(ctx.getAssemblies(), myAddress)) {
    entries.push({ action, approvalContext: { processId: action.processId } });
  }

  if (entries.length === 0) return;

  console.log(
    `[transactor] ${entries.length} proposed action(s): ` +
    `${myProcesses.length} process(es), ${ctx.getAssemblies().length} assembly(ies) discoverable`,
  );

  const decisions = await config.policy.decide(entries);

  // Execute approved actions sequentially. Do NOT parallelize:
  // some actions modify protocol state others depend on (e.g., commit before resolve).
  for (const decision of decisions) {
    if (decision.action === "approve") {
      try {
        // resolve-process is self-contained; commit/attest/initiate need signed
        // inputs a coordination channel supplies — those throw here until wired.
        const result = await executeAction(walletClient, ctx.client, config.addresses, decision.entry.action);
        console.log(
          `[transactor] executed: ${decision.entry.action.type} → ${result.hash}`,
        );
      } catch (err) {
        console.error(`[transactor] execution failed for ${decision.entry.action.type}:`, err);
      }
    } else {
      console.log(
        `[transactor] rejected: ${decision.entry.action.type} — ${decision.reason ?? "no reason"}`,
      );
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
