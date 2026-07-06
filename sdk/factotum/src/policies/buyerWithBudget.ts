import type { ProposedAction } from "@figaro/core/agent";
import { makeAutonomousPolicy, type Policy } from "../policy.js";

export interface BuyerWithBudgetConfig {
  // Maximum total value the buyer will commit across all processes.
  totalBudget: bigint;
  // Maximum value for any single commit.
  perCommitLimit: bigint;
  // Tracker for budget consumed. The factory closes over this; caller is
  // responsible for persistence if the budget should survive process restarts.
  // Default: in-memory (resets on restart).
  budgetSpent?: { value: bigint };
}

// buyerWithBudgetPolicy — buyer-side variant of basicSeller. Accepts commits
// up to a per-commit limit and a total-budget ceiling. Auto-resolves processes
// (the buyer-dominance side). Attestations not applicable.
//
// Use for: corporate booking agents, automated procurement, buyer-side
// reference policies where budget discipline is the operational gate.
//
// Note: maintains mutable state via the budgetSpent tracker. For production
// use, persist budgetSpent across restarts. The default in-memory tracker
// resets on every factotum restart.
export function buyerWithBudgetPolicy<TContext = unknown>(
  config: BuyerWithBudgetConfig,
): Policy<ProposedAction, TContext> {
  const tracker = config.budgetSpent ?? { value: 0n };

  return makeAutonomousPolicy<ProposedAction, TContext>((action) => {
    if (action.type === "commit-sub-order") {
      if (action.currentCumulativeValue > config.perCommitLimit) {
        return { execute: false, reason: "above per-commit limit" };
      }
      const newSpent = tracker.value + action.currentCumulativeValue;
      if (newSpent > config.totalBudget) {
        return { execute: false, reason: "total budget exceeded" };
      }
      tracker.value = newSpent;
      return { execute: true };
    }
    if (action.type === "resolve-process") {
      // Buyer dominance: holding the resolution key is the buyer's
      // operational responsibility. Auto-resolve when proposer surfaces it.
      return { execute: true };
    }
    return { execute: false, reason: "unhandled action type" };
  });
}
