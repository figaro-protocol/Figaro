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

/** What keeps a signed claim accurate when the chain cannot check it — one text,
 *  carried by both boundaries whose rows are a party's signed claim. */
const SIGNED_CLAIM_ACCURACY =
    "what keeps it accurate is what a false claim costs its signer: before resolution, a bond locked and a payment the buyer can withhold, with co-sellers whose own payment waits on the same resolution; after it, the data's worth to whoever buys or analyses it, the evidence a forum or court reads, and the signer's resolution history.";

/** The one-line meaning of each truth boundary — render-ready, the same text
 *  for every consumer that explains a projection's guarantee. */
export const TRUTH_BOUNDARY_GLOSS: Record<TruthBoundary, string> = {
    "protocol-enforced":
        "every row is economically backed by FigaroCore — bonds locked at commit, payouts at resolve — tamper-proof by design (the Process and Resolution graphs).",
    "institution-declared":
        "the runtime encodes it, the protocol never validates it (declared agreement-body data — e.g. a geohash field's substance); " + SIGNED_CLAIM_ACCURACY,
    "protocol-derived":
        "the anchoring is on-chain (merkle-bound sections, timestamped attestations) while the content behind the fingerprint lives off-chain — referential integrity, not substantive accuracy (attestation overlays, provenance links); " + SIGNED_CLAIM_ACCURACY,
    "composition-derived":
        "read from a composed venue's own events — a swap pool, a multisender, a forum — true per that contract's rules, outside FigaroCore's guarantees (the fifth-noun trail).",
};
