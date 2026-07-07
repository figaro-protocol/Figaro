import * as readline from "node:readline";

export interface PolicyEntry<TAction, TContext> {
  action: TAction;
  approvalContext?: TContext;
}

export interface PolicyDecision<TAction, TContext> {
  entry: PolicyEntry<TAction, TContext>;
  action: "approve" | "reject";
  reason?: string;
}

export interface Policy<TAction, TContext = unknown> {
  name: string;
  decide(
    entries: PolicyEntry<TAction, TContext>[],
  ): Promise<PolicyDecision<TAction, TContext>[]>;
}

export function makeHitlPolicy<TAction, TContext = unknown>(): Policy<TAction, TContext> {
  return {
    name: "hitl",
    async decide(entries) {
      const decisions: PolicyDecision<TAction, TContext>[] = [];
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const ask = (q: string) => new Promise<string>((res) => rl.question(q, res));

      try {
        for (const entry of entries) {
          console.log("\n[transactor/hitl] proposed action:");
          console.log(JSON.stringify(entry.action, null, 2));
          if (entry.approvalContext !== undefined) {
            console.log("[transactor/hitl] context:", entry.approvalContext);
          }
          const ans = (await ask("[transactor/hitl] approve? (y/N) ")).trim().toLowerCase();
          const approved = ans === "y" || ans === "yes";
          decisions.push({
            entry,
            action: approved ? "approve" : "reject",
            reason: approved ? undefined : "operator declined",
          });
        }
      } finally {
        rl.close();
      }
      return decisions;
    },
  };
}

export function makeAutonomousPolicy<TAction, TContext = unknown>(
  shouldExecute: (action: TAction, context?: TContext) => { execute: boolean; reason?: string },
): Policy<TAction, TContext> {
  return {
    name: "autonomous",
    async decide(entries) {
      return entries.map((entry) => {
        const verdict = shouldExecute(entry.action, entry.approvalContext);
        return {
          entry,
          action: verdict.execute ? "approve" : "reject",
          reason: verdict.reason,
        };
      });
    },
  };
}

// The shipped autonomous policy refuses every action.
// This is the security floor: a fresh clone of the transactor running in autonomous
// mode without code changes does nothing on chain. Replace this function with your
// own rules — bond thresholds, geohash radius, current-vs-floor price, etc.
//
// Reminder: autonomous mode skips human review. The cost of a wrong rule here is
// real money. Test on a fork before pointing this at mainnet.
export function defaultRefuseAll<TAction>(_action: TAction): {
  execute: boolean;
  reason: string;
} {
  return {
    execute: false,
    reason: "default policy refuses every action; replace shouldExecute() in src/policy.ts before enabling autonomous mode",
  };
}
