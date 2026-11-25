/**
 * @figaro-protocol/sdk/derive — Which process design each process instantiated
 *
 * Every agreement a process signs carries the format's reserved provenance
 * leaf: the registered agreement and the process design it instantiated
 * (`Agreement.provenance`), merkle-bound into the order's `checkoutHash`,
 * which the buyer and the seller of the order both signed. Two sources on
 * the chain name that pair for a process:
 *
 *   1. `UsageCounter.UsageRecorded` of the process-design kind. The counter
 *      records it only after proving the provenance leaf under the order's
 *      signed `checkoutHash` and the agreement's membership in the design
 *      (`recordProcessDesignUsage`, on either path). Anyone may send the
 *      record; the proof is the counter's.
 *   2. An `Attestation` of the provenance leaf. The coordinator admits it
 *      from the order's buyer or its seller only, and proves the leaf under
 *      the signed `checkoutHash` from the clause data hash in the call. It
 *      never ties the event's `contentRef` to that hash
 *      (`AttestationCoordinator._verifyInclusion`), so the pair the
 *      `contentRef` names is the attester's statement. Either party's
 *      statement is admitted: both signed the leaf, and a seller's
 *      attestation is the one a buyer can still refuse to resolve over.
 *
 * The counter's record wins over an attestation. Two attestations of one
 * process that name two designs leave the process contested and
 * unattributed: neither is taken over the other, and no later one replaces
 * an earlier one. A process neither source names is unattributed.
 */

import { isBytes32Hex, type Hex } from "../types.js";
import { provenanceContentRef } from "../agreement.js";
import { USAGE_KIND_PROCESS } from "../rpgf/index.js";
import type { OverlayGraph } from "./overlay.js";

/** A process's process design, and the source that names it. */
export interface ProcessDesignAttribution {
    processDesignHash: Hex;
    /** `usage-counter`: the counter proved the provenance leaf under the
     *  order's signed `checkoutHash`. `attestation`: a party to the order
     *  attested the leaf, and its `contentRef` names the pair. */
    source: "usage-counter" | "attestation";
}

export interface ProcessDesignAttributions {
    /** processId (lowercased) → its design. */
    byProcess: Map<string, ProcessDesignAttribution>;
    /** processIds (lowercased) two attestations name two designs for, and
     *  the counter names none: unattributed. */
    contested: Set<string>;
}

export interface AttributionInput {
    /** The attestation overlays (`extractOverlays`); only the provenance
     *  leaf's graph is read. */
    overlays: readonly OverlayGraph[];
    /** Process designs the reader loaded, each with its agreements: an
     *  attestation whose content was not recovered attributes when its
     *  `contentRef` is `provenanceContentRef` of one of these pairs. */
    designs?: readonly { processDesignHash: Hex; agreementHashes: readonly Hex[] }[];
    /** The counter's `UsageRecorded` records (`fetchUsageRecords`). */
    usageRecords?: readonly { kind: number; clauseOrProcess: Hex; processId: Hex }[];
}

/** Each process's process design, from the counter's records and the
 *  provenance leaf's attestations. Pure. */
export function attributeProcessDesigns(input: AttributionInput): ProcessDesignAttributions {
    const byContentRef = new Map<string, Hex>();
    for (const { processDesignHash, agreementHashes } of input.designs ?? []) {
        if (!isBytes32Hex(processDesignHash)) continue;
        for (const agreementHash of agreementHashes) {
            if (!isBytes32Hex(agreementHash)) continue;
            byContentRef.set(provenanceContentRef(agreementHash, processDesignHash).toLowerCase(), processDesignHash);
        }
    }

    const byProcess = new Map<string, ProcessDesignAttribution>();
    for (const record of input.usageRecords ?? []) {
        if (record.kind !== USAGE_KIND_PROCESS || !isBytes32Hex(record.clauseOrProcess)) continue;
        byProcess.set(record.processId.toLowerCase(), { processDesignHash: record.clauseOrProcess, source: "usage-counter" });
    }

    const attested = new Map<string, Set<string>>();
    const named = new Map<string, Hex>();
    for (const graph of input.overlays) {
        if (!graph.provenanceLeaf) continue;
        for (const entry of graph.entries) {
            const contentRef = entry.contentRef.toLowerCase();
            const pair = entry.decoded;
            let design: Hex | undefined;
            // Decoded bytes count only when they are the bytes the
            // fingerprint names.
            if (pair && isBytes32Hex(pair.agreementHash) && isBytes32Hex(pair.processDesignHash)
                && provenanceContentRef(pair.agreementHash, pair.processDesignHash).toLowerCase() === contentRef) {
                design = pair.processDesignHash;
            } else {
                design = byContentRef.get(contentRef);
            }
            if (design === undefined) continue;
            const processId = entry.processId.toLowerCase();
            const set = attested.get(processId) ?? new Set<string>();
            set.add(design.toLowerCase());
            attested.set(processId, set);
            named.set(`${processId}|${design.toLowerCase()}`, design);
        }
    }

    const contested = new Set<string>();
    for (const [processId, designs] of attested) {
        if (byProcess.has(processId)) continue;
        if (designs.size > 1) {
            contested.add(processId);
            continue;
        }
        const [only] = designs;
        byProcess.set(processId, { processDesignHash: named.get(`${processId}|${only}`)!, source: "attestation" });
    }
    return { byProcess, contested };
}
