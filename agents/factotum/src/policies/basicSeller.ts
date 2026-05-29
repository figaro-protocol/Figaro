import type { ProposedAction } from "@figaro/core/agent";
import { makeAutonomousPolicy, type Policy } from "../policy.js";

export interface BasicSellerConfig {
  /** Reject commits below this value (in commit-currency smallest unit). */
  minValue?: bigint;
  /** Reject commits at or above this value. */
  maxValue: bigint;
  /** Optional: only accept commits where the buyer is in this set. */
  trustedBuyers?: Set<`0x${string}`>;
}

// basicSellerPolicy — a single seller that accepts inbound commits
// if value falls within configured bounds. Routine attestations execute
// autonomously; resolutions stay HITL (handled by a separate factotum or
// escalation channel).
//
// Use for: small sellers offering a fixed catalogue at known prices, where
// inbound commits arrive from a stable customer base.
export function basicSellerPolicy<TContext = unknown>(
  config: BasicSellerConfig,
): Policy<ProposedAction, TContext> {
  return makeAutonomousPolicy<ProposedAction, TContext>((action) => {
    if (action.type === "attest-as-seller") {
      return { execute: true };
    }
    if (action.type === "commit-sub-order") {
      const value = action.currentCumulativeValue;
      if (config.minValue !== undefined && value < config.minValue) {
        return { execute: false, reason: "below min value" };
      }
      if (value > config.maxValue) {
        return { execute: false, reason: "above max value" };
      }
      if (config.trustedBuyers && !config.trustedBuyers.has(action.buyer)) {
        return { execute: false, reason: "buyer not in trusted set" };
      }
      return { execute: true };
    }
    return { execute: false, reason: "unhandled action type — escalate" };
  });
}
