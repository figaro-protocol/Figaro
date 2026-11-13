/**
 * The words that name the path an `Attestation` row was emitted on. The
 * coordinator (direct path) and the batch verifier (batch path) emit one topic,
 * so the emitting address is what tells the rows apart; every surface that
 * shows or exports an attestation names it in these words, so a reader knows
 * where to look the row up (the coordinator's transaction, or the batch's).
 * The label says where the row was emitted, nothing about how strong it is:
 * the signer and the content reference are bound the same way on both paths.
 */
import type { ResolutionUniverse } from "@figaro-protocol/sdk";

export function attestationPathLabel(universe: ResolutionUniverse): string {
    return universe === "batch"
        ? "Batch path — emitted by the batch verifier"
        : "Direct path — emitted by the attestation coordinator";
}
