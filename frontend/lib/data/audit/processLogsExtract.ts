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
 * requires the content itself, which the chain never holds (the coordinator
 * takes only its hash, `contentRef`).
 */

import type { ResolutionUniverse } from "@figaro-protocol/sdk";
import type { Order } from "@/lib/core/store";
import type { HeldWitnessReader } from "@/lib/core/witnessContent";
import type { AttestationRecord } from "@/lib/core/attestationIndexer";
import type { ExtractedDocument, MissingPart } from "./types";
import { attestationContentFields, attestationIsWitness, clauseIsProcessLog, getClauseSpec } from "@/lib/shared/clauseSpecSource";

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
    /** The path that emitted the attestation, when the reader knows it. */
    universe?: ResolutionUniverse;
    /** A private attestation's content, as its holder kept it: the bytes
     *  whose keccak256 is `contentRef`, and the values decoded from those
     *  bytes, the blinding value included. Present only where the file's
     *  builder holds them. */
    heldContent?: `0x${string}`;
    heldValues?: Record<string, unknown>;
    /** How the held copy came to the browser profile the file is built in:
     *  false where it was kept there when the attestation was filed from it,
     *  true where it was received from the attester, the counterparty of the
     *  party that asked. */
    heldReceived?: boolean;
}

/** One process clause's event timeline — the per-clause group the PDF
 *  renders as its own section. One group per clause key: two specs that
 *  share a name are two clauses. */
interface ProcessLogGroup {
    /** The clause key the attestations carry (lower-cased). */
    clauseKey: string;
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
    /** Attestations of this order the section could not place in a clause's
     *  timeline, each named with its fingerprint. */
    missing: MissingPart[];
}

/** The held witnesses of a file pinned in public: none is read, and each
 *  private attestation is named withheld by its fingerprint, whether or not
 *  the file's builder holds its content. */
export const WITHHELD_FROM_PUBLIC_FILE = "withheld-from-public-file";

export function extractProcessLogs(
    order: Order,
    attestations: readonly AttestationRecord[],
    heldWitness?: HeldWitnessReader | typeof WITHHELD_FROM_PUBLIC_FILE,
): ProcessLogsDocument {
    const groups = new Map<string, ProcessLogGroup>();
    const missing: MissingPart[] = [];

    for (const att of attestations) {
        if (att.orderHash !== order.orderHash) continue;
        // Attestation events carry the clause KEY; the spec reads key on it.
        // A key whose spec is not loaded cannot be placed in a clause's
        // timeline: the evidence file names the attestation as missing from it.
        const clauseKey = att.clauseId.toLowerCase();
        const spec = getClauseSpec(clauseKey);
        if (!spec) {
            missing.push({
                part: `Attestation of clause ${clauseKey}, stage ${att.stage}, contentRef ${att.contentRef}${att.transactionHash ? `, transaction ${att.transactionHash}` : ""}`,
                orderHash: order.orderHash,
                reason: "the spec of this clause was not loaded, so the attestation is not placed in a clause's timeline (the hash appendix lists its contentRef)",
            });
            continue;
        }
        // Two runtime-evidence shapes share this timeline: process-log LADDERS
        // (attestations article) and declared WITNESS stages (spec.stages[N] —
        // a temperature reading, measured grams, a detected band). Both are
        // spec-declared; neither is named here.
        if (!clauseIsProcessLog(clauseKey) && !attestationIsWitness(clauseKey, att.stage)) continue;
        let group = groups.get(clauseKey);
        if (!group) {
            group = { clauseKey, title: spec.title, events: [] };
            groups.set(clauseKey, group);
        }
        // A private set's content is never published: the file holds it
        // where its builder kept it, and names it missing otherwise. The set
        // is the one the content was encoded from: `stages[stage]` where the
        // spec declares it, else the top-level set, a ladder event's alike.
        const isPrivate = (attestationContentFields(clauseKey, att.stage) ?? []).some((f) => f.disposition === "private");
        const withheld = heldWitness === WITHHELD_FROM_PUBLIC_FILE;
        const held = isPrivate && !withheld ? heldWitness?.(att) ?? null : null;
        if (isPrivate && !held) {
            missing.push({
                part: `Content of the private attestation of clause ${clauseKey}, stage ${att.stage}, contentRef ${att.contentRef}`,
                orderHash: order.orderHash,
                reason: withheld
                    ? `the content of a private attestation is withheld from a file pinned in public; the file names it by its fingerprint, contentRef ${att.contentRef}, and its holder hands the content to a forum, which checks it against that fingerprint`
                    : "the content of a private attestation is never published, and the builder of this file does not hold it; its attester keeps it",
            });
        }
        group.events.push({
            clauseKey,
            attester: att.attester,
            stage: att.stage,
            contentRef: att.contentRef,
            blockNumber: att.blockNumber,
            transactionHash: att.transactionHash ?? undefined,
            universe: att.universe,
            ...(held ? { heldContent: held.content, ...(held.values ? { heldValues: held.values } : {}), heldReceived: held.received === true } : {}),
        });
    }

    return {
        title: "Sovereign process logs",
        orderHash: order.orderHash,
        processId: order.processId,
        checkoutHash: order.checkoutHash ?? "0x",
        buyer: order.buyer,
        seller: order.seller,
        logs: Array.from(groups.values()),
        missing,
    };
}
