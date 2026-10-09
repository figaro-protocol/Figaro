/**
 * Sovereign process-log extractor — pure projection of an order's
 * PROCESS-LOG attestations into per-clause event timelines.
 *
 * A process-log clause is any registered runtime enum-ladder clause
 * (per its spec — `clauseIsProcessLog`; never named in code). Such clauses
 * exist because off-chain sellers need a sovereign event log that fixes
 * what they signed about their physical-world state changes, against which
 * order, and when; each entry's content is the seller's attestation
 * (docs/DATA_LAYER.md § "Truth boundaries"). FigaroCore logs
 * the buyer's actions directly (commit / resolveProcess); the off-chain
 * sellers attest theirs via whatever process clause their order carries —
 * including clauses this codebase has never seen.
 *
 * The content shape is `(uint8 eventType, string evidenceUri)`; eventType
 * indexes the clause's spec-declared enum ladder. The audit document
 * carries the receipt; recovering the eventType label and evidenceUri
 * requires decoding the transaction calldata.
 */

import type { Order } from "@/lib/kernel/store";
import type { AttestationRecord } from "@/lib/composition/indexer";
import type { ExtractedDocument } from "./types";
import { clauseIsProcessLog, clauseWitnessStages, getClauseSpec, clauseIdForHash } from "@/lib/shared/clauseSpecSource";

interface ProcessLogEntry {
    clauseKey: string;
    /** Order whose buyer/seller emitted the event. */
    attester: string;
    /** Lifecycle stage the event was attested at (uint8). */
    stage: number;
    /** The attestation's `contentRef` — a keccak256 FINGERPRINT of what was
     *  attested. The preimage is NOT recoverable from chain data: the
     *  coordinator takes bytes32 and the plaintext never enters calldata, so a
     *  reader shows the fingerprint and a holder of the preimage proves the
     *  match off-chain. */
    contentRef: string;
    blockNumber: number;
    transactionHash?: string;
}

/** One process clause's event timeline — the per-clause group the PDF
 *  renders as its own section. One group per registration: two versions of
 *  one name are two clauses. */
interface ProcessLogGroup {
    /** The on-chain clause hash the attestations carry —
     *  keccak256(abi.encode(clauseId, version)). */
    clauseHash: string;
    /** Readable clauseId of the process clause. */
    clauseId: string;
    /** The registered version the clause hash names. */
    version: number;
    /** Display title — the registered spec's title (the network-defined
     *  label). */
    title: string;
    /** The clause's events for this order, in input order (typically
     *  block order). */
    events: ProcessLogEntry[];
}

export interface ProcessLogsDocument extends ExtractedDocument {
    /** Per-clause event timelines, one group per process clause that
     *  attested on this order, in first-seen order. */
    logs: ProcessLogGroup[];
}

export function extractProcessLogs(
    order: Order,
    attestations: readonly AttestationRecord[],
): ProcessLogsDocument {
    const groups = new Map<string, ProcessLogGroup>();

    for (const att of attestations) {
        if (att.orderHash !== order.orderHash) continue;
        // Attestation events carry the clause HASH, which names one
        // registration (clauseId, version); the spec reads key on that
        // identity. A hash whose spec is not loaded resolves to nothing and
        // is skipped until the cache warms.
        const identity = clauseIdForHash(att.clauseId);
        if (!identity) continue;
        const { clauseId, version } = identity;
        // Two runtime-evidence shapes share this timeline: process-log LADDERS
        // (attestations article) and declared WITNESS stages (spec.stages[N] —
        // a temperature reading, measured grams, a detected band). Both are
        // spec-declared; neither is named here.
        const isWitness = clauseWitnessStages(clauseId, version).some((w) => w.stage === att.stage);
        if (!clauseIsProcessLog(clauseId, version) && !isWitness) continue;
        const clauseHash = att.clauseId.toLowerCase();
        let group = groups.get(clauseHash);
        if (!group) {
            group = {
                clauseHash,
                clauseId,
                version,
                title: getClauseSpec(clauseId, version)?.title ?? clauseId,
                events: [],
            };
            groups.set(clauseHash, group);
        }
        group.events.push({
            clauseKey: clauseId,
            attester: att.attester,
            stage: att.stage,
            contentRef: att.contentRef,
            blockNumber: att.blockNumber,
            transactionHash: att.transactionHash ?? undefined,
        });
    }

    return {
        title: "Sovereign process logs",
        orderHash: order.orderHash,
        processId: order.processId,
        agreementHash: order.agreementHash ?? "0x",
        buyer: order.buyer,
        seller: order.seller,
        logs: Array.from(groups.values()),
    };
}
