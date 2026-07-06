import type { ProposedAction, CommitSubOrderAction } from "@figaro/core/agent";
import { makeAutonomousPolicy, type Policy } from "../policy.js";

export interface AuctionBidderConfig<TContext = unknown> {
  // Estimate the seller's cost of fulfilling this commit. Seller-specific.
  estimateMyCost: (action: CommitSubOrderAction, context?: TContext) => bigint;
  // Minimum margin in basis points (10000 = 100%). E.g., 500 = 5% margin.
  minMarginBps: bigint;
}

// auctionBidderPolicy — Dutch auction bidder with a margin gate. Accepts
// commit-sub-order if the offered price provides at least minMarginBps over
// the seller's estimated cost. Attestations execute autonomously.
//
// Use for: any seller whose income comes from claiming Dutch auctions where
// margin discipline is the gate.
export function auctionBidderPolicy<TContext = unknown>(
  config: AuctionBidderConfig<TContext>,
): Policy<ProposedAction, TContext> {
  return makeAutonomousPolicy<ProposedAction, TContext>((action, context) => {
    if (action.type === "attest-as-seller") {
      return { execute: true };
    }
    if (action.type === "commit-sub-order") {
      const myCost = config.estimateMyCost(action, context);
      if (myCost === 0n) {
        return { execute: false, reason: "cost estimator returned zero — refusing to bid blind" };
      }
      const offered = action.currentCumulativeValue;
      const marginBps = ((offered - myCost) * 10000n) / myCost;
      if (marginBps >= config.minMarginBps) {
        return { execute: true };
      }
      return {
        execute: false,
        reason: `margin ${marginBps}bps below ${config.minMarginBps}bps threshold`,
      };
    }
    return { execute: false, reason: "unhandled action type" };
  });
}
