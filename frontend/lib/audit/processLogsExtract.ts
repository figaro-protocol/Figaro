/**
 * Sovereign process-log extractor — pure projection of an order's
 * PROCESS-LOG attestations into per-clause event timelines.
 *
 * A process-log clause is any registered runtime enum-ladder clause
 * (per its spec — `clauseIsProcessLog`; never named in code). Such clauses
 * exist because off-chain sellers need a sovereign event log to make their
 * physical-world state changes tamper-proof evidence. The kernel records
 * the buyer's actions directly (commit / resolveProcess); the off-chain
 * sellers record theirs via whatever process clause their order carries —
 * including clauses this codebase has never seen.
 *
 * The content shape is `(uint8 eventType, string evidenceUri)`; eventType
 * indexes the clause's spec-declared enum ladder. The audit document
 * records the receipt; recovering the eventType label and evidenceUri
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
    /** keccak256 of the (uint8 eventType, string evidenceUri) content.
     *  The original eventType + evidenceUri sit in the transaction
     *  calldata. */
    contentRef: string;
    blockNumber: number;
    transactionHash?: string;
}

/** One process clause's event timeline — the per-clause group the PDF
 *  renders as its own section. */
interface ProcessLogGroup {
    /** Readable clauseId of the process clause. */
    clauseId: string;
    /** Display title — the registered spec's title (the network-defined
     *  label), falling back to the clauseId when the spec isn't cached. */
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
        if (att.orderHash !== order.id) continue;
        // Attestation events carry the clauseId HASH; the spec reads key on the
        // readable id, so resolve it first (falls back to the raw value when already
        // readable or the spec isn't cached). Without this, every attestation is
        // skipped and the process-log section renders empty.
        const clauseId = clauseIdForHash(att.clauseId) ?? att.clauseId;
        // Two runtime-evidence shapes share this timeline: process-log LADDERS
        // (attestations article) and declared WITNESS stages (spec.stages[N] —
        // a temperature record, measured grams, a detected band). Both are
        // spec-declared; neither is named here.
        const isWitness = clauseWitnessStages(clauseId).some((w) => w.stage === att.stage);
        if (!clauseIsProcessLog(clauseId) && !isWitness) continue;
        let group = groups.get(clauseId);
        if (!group) {
            group = {
                clauseId,
                title: getClauseSpec(clauseId)?.title ?? clauseId,
                events: [],
            };
            groups.set(clauseId, group);
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
        orderHash: order.id,
        processId: order.processId,
        agreementHash: order.agreementHash ?? "0x",
        buyer: order.buyer,
        seller: order.seller,
        logs: Array.from(groups.values()),
    };
}
