/**
 * @figaro-protocol/sdk/derive — Truth boundaries
 *
 * The trust labels a graph projection carries. This module is their one home;
 * docs/DATA_LAYER.md § "Truth boundaries" states the concept and points here.
 * Every projection in this layer names which guarantee stands behind
 * its rows, so a consumer never conflates protocol guarantees with
 * institution-level claims. The label set is closed — a
 * projection picks from it, never coins a new one. What each label means is
 * `TRUTH_BOUNDARY_GLOSS` below — the one home for the gloss text.
 */

export type TruthBoundary =
    | "protocol-enforced"
    | "institution-declared"
    | "protocol-derived"
    | "composition-derived";

/** What stands behind a declaration or an attestation when the chain cannot check
 *  it: the tail of the two glosses whose rows are a party's declaration or attestation. */
const DECLARATION_BACKING =
    "what stands behind it is that both parties signed it into the agreement at commit; after resolution it stays in the public data and in their resolution histories.";
const ATTESTATION_BACKING =
    "what stands behind a seller's attestation is the buyer's decision: a buyer who finds it false before resolving can withhold resolution, which keeps the seller's bond locked, and its own, and pays nobody, until it is put right; a buyer's own attestation meets no such pressure; after resolution the attestation stays in the public data and in its signer's resolution history.";

/** The one-line meaning of each truth boundary — render-ready, the same text
 *  for every consumer that explains a projection's guarantee. */
export const TRUTH_BOUNDARY_GLOSS: Record<TruthBoundary, string> = {
    "protocol-enforced":
        "every row is economically backed by FigaroCore — bonds locked at commit, payouts at resolve — tamper-proof by design (the Process and Resolution graphs).",
    "institution-declared":
        "the runtime encodes it, the protocol never validates it (declared agreement-body data — e.g. a geohash field's substance); " + DECLARATION_BACKING,
    "protocol-derived":
        "the anchoring is on-chain (merkle-bound sections, timestamped attestations) while the content behind the fingerprint lives off-chain — referential integrity, not substantive accuracy (attestation overlays, provenance links); " + ATTESTATION_BACKING,
    "composition-derived":
        "read from a composed venue's own events — a swap pool, a multisender, a forum — true per that contract's rules, outside FigaroCore's guarantees (the fifth-noun trail).",
};
