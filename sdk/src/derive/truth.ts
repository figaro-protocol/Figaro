/**
 * @figaro-protocol/sdk/derive — Truth boundaries
 *
 * The trust labels a graph projection carries, verbatim from
 * docs/PUBLIC_GRAPH_MODEL.md ("Graph Separation in the UI" + the composed-venue
 * trail): every projection in this layer names which guarantee stands behind
 * its rows, so a consumer never conflates protocol guarantees with
 * institution-level claims. The label set is the doc's own vocabulary — a
 * projection picks from it, never coins a new one. What each label means is
 * `TRUTH_BOUNDARY_GLOSS` below — the one home for the gloss text.
 */

export type TruthBoundary =
    | "protocol-enforced"
    | "institution-declared"
    | "protocol-derived"
    | "composition-derived";

/** The one-line meaning of each truth boundary — render-ready, the same text
 *  for every consumer that explains a projection's guarantee. */
export const TRUTH_BOUNDARY_GLOSS: Record<TruthBoundary, string> = {
    "protocol-enforced":
        "every row is economically backed by the kernel — bonds locked at commit, payouts at resolve — tamper-proof by design (the Process and Settlement graphs).",
    "institution-declared":
        "the runtime encodes it, the protocol never validates it; bonding pressure incentivizes accuracy (declared agreement-body data — e.g. a geohash field's substance).",
    "protocol-derived":
        "the anchoring is on-chain (merkle-bound sections, timestamped attestations) while the content behind the fingerprint lives off-chain — referential integrity, not substantive accuracy (attestation overlays, provenance links).",
    "composition-derived":
        "read from a composed venue's own events — a swap pool, a multisender, a forum — true per that contract's rules, outside the kernel's guarantees (the fifth-noun trail).",
};
