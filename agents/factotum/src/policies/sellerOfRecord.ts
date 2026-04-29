import type { ProposedAction } from "@figaro/core/agent";
import { makeAutonomousPolicy, type Policy } from "../policy.js";

export interface SellerOfRecordConfig {
  /** Routine sub-procurement commits below this value execute autonomously. */
  routineProcurementLimit: bigint;
}

// sellerOfRecordPolicy — fan-out actor that's both seller-to-buyer and buyer
// of sub-services. Handles the airline / ocean-carrier pattern: one parent
// commitment, N sub-procurement commitments. Routine attestations and
// sub-procurement under threshold execute autonomously; resolutions and large
// commitments escalate.
//
// Use for: airlines, ocean carriers, primary-contractor patterns where a
// single party orchestrates multiple sub-suppliers.
export function sellerOfRecordPolicy<TContext = unknown>(
  config: SellerOfRecordConfig,
): Policy<ProposedAction, TContext> {
  return makeAutonomousPolicy<ProposedAction, TContext>((action) => {
    if (action.type === "attest-as-seller" || action.type === "attest-as-buyer") {
      return { execute: true };
    }
    if (action.type === "commit-sub-order") {
      if (action.currentCumulativeValue > config.routineProcurementLimit) {
        return { execute: false, reason: "above routine threshold; escalate" };
      }
      return { execute: true };
    }
    // Resolutions: HITL — settlement decisions require human review
    return { execute: false, reason: "escalate: resolution requires human review" };
  });
}
