/**
 * @figaro-protocol/sdk/derive — Overlay extraction (the open graph class)
 *
 * Groups attestation records into per-clause-family overlay streams — one
 * overlay graph per attestable clause family a market composes. The class is
 * OPEN: the grouping key is the attestation's on-chain clause key, held
 * OPAQUE (no clause names in any code path), and content decodes through the
 * caller-supplied `SpecSource` with the generic `decodeContentFromSpec` — a
 * never-seen clause family flows through unchanged. A spec the source cannot
 * resolve — or content the caller could not recover, or bytes that do not
 * decode against the spec — degrades that entry to fingerprint-only: absence
 * posture, never fabrication.
 *
 * Truth boundary: "protocol-derived" — the anchoring is on-chain (timestamped
 * attestations bound to merkle-committed agreements) while the content behind
 * the fingerprint lives off-chain. The SUBSTANCE of a decoded field is the
 * attester's declaration; the projection guarantees referential integrity,
 * not accuracy.
 *
 * Geo is just the worked instance of this class: a consumer finds the
 * geohash-bearing fields of an overlay's resolved spec by their DECLARED
 * string `format` (never by clause or field name) and composes the decoded
 * values with the `derive/geo.js` helpers. Any other family — emissions,
 * telemetry, one registered yesterday — reads the same way from its own spec.
 *
 * Pure fold, no I/O: the caller fetches attestations (`fetchAttestationRecords`
 * folds BOTH settlement universes), recovers the content bytes OFF-CHAIN, and
 * warms the SpecSource from ClauseRegistry → IPFS. The preimage is never in
 * calldata — `AttestationCoordinator` records only `contentRef =
 * keccak256(content)` — so recovery means resolving that fingerprint's own
 * content address (the bytes are pinned as a raw block multihashed with
 * keccak-256, making the fingerprint the lookup) or holding the bytes already,
 * as a party or as a data-market buyer.
 */

import type { Hex, Address } from "../types.js";
import type { SettlementUniverse, UniverseAttestationEvent } from "../events.js";
import type { SpecSource, ProjectionSpecView } from "../projection.js";
import { decodeContentFromSpec } from "../clauses/index.js";
import { computeClauseKey } from "../discovery.js";

// ── Input: an attestation with caller-recovered content ─────────────────────

/** An attestation event paired with its recovered canonical content bytes —
 *  `null` when the caller could not (or chose not to) recover them. The
 *  event's `contentRef` fingerprint is always present either way. */
export interface RecoveredAttestation {
    event: UniverseAttestationEvent;
    content: Hex | null;
}

// ── Output: one overlay graph per clause family ─────────────────────────────

/** One attestation projected into an overlay: the on-chain anchor always,
 *  the decoded content only when spec + bytes both resolved. */
export interface OverlayEntry {
    orderHash: Hex;
    processId: Hex;
    attester: Address;
    /** Opaque per-clause stage index — its meaning lives in the clause spec. */
    stage: number;
    /** Which settlement universe emitted the anchor (direct = re-verifiable
     *  from calldata, batch = proved once inside a batch). */
    universe: SettlementUniverse;
    blockNumber: number;
    /** The on-chain content fingerprint — present on every entry. */
    contentRef: Hex;
    /** Spec-decoded content, or `null` for a fingerprint-only entry (spec
     *  unresolvable, content unrecovered, or bytes that do not decode). */
    decoded: Record<string, unknown> | null;
}

/** One clause family's overlay stream. */
export interface OverlayGraph {
    boundary: "protocol-derived";
    /** The attestation's on-chain clause key — the opaque grouping key. */
    clauseKey: Hex;
    /** The resolved spec view, when the SpecSource holds a spec whose
     *  `computeClauseKey(clauseId, version)` matches — the consumer's window
     *  for routing by declared field and format. `null` = unresolved family:
     *  entries stay fingerprint-only. */
    spec: ProjectionSpecView | null;
    /** Entries in block order. */
    entries: OverlayEntry[];
}

// ── Extraction ──────────────────────────────────────────────────────────────

/**
 * Group recovered attestations into per-clause-family overlay graphs. One
 * graph per distinct on-chain clause key, entries in block order, graphs in
 * first-seen order. Decoding selects the spec's `stages[stage]` field set
 * when declared (the same selection the encoder applies), else the default
 * fields.
 */
export function extractOverlays(
    records: readonly RecoveredAttestation[],
    specs: SpecSource,
): OverlayGraph[] {
    // The one place spec identity meets the opaque key: every loaded spec's
    // on-chain key, computed — never a name comparison on the event side.
    const specByKey = new Map<Hex, ProjectionSpecView>();
    for (const view of specs.list()) {
        specByKey.set(computeClauseKey(view.clauseId, view.version), view);
    }

    const graphs = new Map<Hex, OverlayGraph>();
    for (const { event, content } of records) {
        let graph = graphs.get(event.clauseId);
        if (!graph) {
            graph = {
                boundary: "protocol-derived",
                clauseKey: event.clauseId,
                spec: specByKey.get(event.clauseId) ?? null,
                entries: [],
            };
            graphs.set(event.clauseId, graph);
        }

        let decoded: Record<string, unknown> | null = null;
        if (graph.spec && content !== null) {
            try {
                decoded = decodeContentFromSpec(graph.spec, content, { stage: event.stage });
            } catch {
                // Bytes that do not decode against the spec are garbage
                // content — the entry degrades to fingerprint-only.
                decoded = null;
            }
        }

        graph.entries.push({
            orderHash: event.orderHash,
            processId: event.processId,
            attester: event.attester,
            stage: event.stage,
            universe: event.universe,
            blockNumber: event.blockNumber,
            contentRef: event.contentRef,
            decoded,
        });
    }

    for (const graph of graphs.values()) {
        graph.entries.sort((a, b) => a.blockNumber - b.blockNumber);
    }
    return [...graphs.values()];
}
