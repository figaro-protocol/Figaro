import type { ProposedAction } from "@figaro/core/agent";
import { makeAutonomousPolicy, type Policy } from "../policy.js";

// auditorPolicy — passive observer that submits attestations only. Never
// commits, never resolves. Common for compliance auditors, third-party
// verification services, or jurisdictional authorities participating as
// Figaro counterparties (rather than as sovereign attestation sources).
//
// Use for: jurisdiction-v1 attestations, GHG audit firms, compliance bots.
export function auditorPolicy<TContext = unknown>(): Policy<ProposedAction, TContext> {
  return makeAutonomousPolicy<ProposedAction, TContext>((action) => {
    if (action.type === "attest-as-seller" || action.type === "attest-as-buyer") {
      return { execute: true };
    }
    return { execute: false, reason: "auditor does not commit or resolve" };
  });
}
