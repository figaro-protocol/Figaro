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
// resets on every transactor restart.
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
      // operational responsibility. Auto-resolve when proposer surfaces it —
      // the one action this policy completes end-to-end with no further input.
      return { execute: true };
    }
    if (action.type === "initiate-process") {
      // Origination is a discovered opportunity, not an autonomously executable
      // action: starting a process needs the seller's counter-signature, which
      // this reference policy has no channel to gather. Decline cleanly; a real
      // buyer policy wires a coordination channel and supplies signed inputs.
      return { execute: false, reason: "origination needs a coordination channel (not wired in this reference policy)" };
    }
    return { execute: false, reason: "unhandled action type" };
  });
}
