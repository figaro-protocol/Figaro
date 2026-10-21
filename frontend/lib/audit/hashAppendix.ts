/**
 * Hash appendix — every cryptographic anchor in the audit bundle, listed
 * alongside its on-chain source. The reader / auditor can verify the
 * entire document set against chain by recomputing each hash from its
 * cited content and comparing to this table.
 *
 * Verification path:
 *
 *   1. Each agreement clause's `body` (in the contract document) hashes
 *      to its `leafHash` via `computeClauseLeaf(clause)`; the agreement's
 *      `provenance`, when it names its assembly, hashes to the format's
 *      reserved leaf via `computeProvenanceLeaf(provenance)`.
 *   2. The leaves combine into the merkle root = `checkoutHash`.
 *   3. The `checkoutHash` matches the `checkoutHash` field on the
 *      `OrderCommitted` event emitted at `transactionHash` for the order.
 *   4. Each lifecycle attestation's content hashes to its `contentRef`
 *      via `keccak256(content)`. The contentRef is logged by the
 *      `Attestation(orderHash, processId, attester, clauseId, stage,
 *      contentRef)` event on chain.
 *
 * The appendix lists every hash in this chain so a reader can perform
 * each step independently.
 */

import { type Agreement, computeProvenanceLeaf, computeClauseLeaf } from "@figaro-protocol/sdk";
import type { Order } from "@/lib/kernel/store";
import type { AttestationRecord } from "@/lib/composition/indexer";
import type { ExtractedDocument } from "./types";
import { truncateHex } from "@/lib/shared/formatHex";

type HashAnchorKind =
    | "agreement-root"
    | "agreement-clause-leaf"
    | "agreement-provenance-leaf"
    | "attestation-content-ref"
    | "transaction-hash"
    | "order-hash"
    | "process-id";

interface HashAnchor {
    kind: HashAnchorKind;
    /** Display label for the appendix table row. */
    label: string;
    /** The hex hash itself. */
    hash: string;
    /** Where on chain this hash appears. Free-form description for the
     *  reader: e.g. "OrderCommitted.checkoutHash" or
     *  "Attestation.contentRef (stage 3)". */
    sourceLocation: string;
    /** Optional — the transaction hash where this anchor was logged, if
     *  known. Lets the auditor jump straight to the source receipt. */
    transactionHash?: string;
}

export interface HashAppendixDocument extends ExtractedDocument {
    anchors: HashAnchor[];
}

export function buildHashAppendix(
    order: Order,
    agreement: Agreement,
    attestations: readonly AttestationRecord[],
): HashAppendixDocument {
    const anchors: HashAnchor[] = [];

    // 1. Top-level identifiers.
    anchors.push({
        kind: "process-id",
        label: "Process id",
        hash: order.processId,
        sourceLocation: "FigaroCore.processes[processId] / OrderCommitted.processId",
    });
    anchors.push({
        kind: "order-hash",
        label: "Order hash",
        hash: order.orderHash,
        sourceLocation: "FigaroCore.orderStatus[orderHash] / OrderCommitted.orderHash",
    });

    // 2. Agreement root.
    anchors.push({
        kind: "agreement-root",
        label: "Agreement merkle root",
        hash: order.checkoutHash ?? "0x",
        sourceLocation: "OrderCommitted.checkoutHash (matches keccak256 of canonical agreement JSON, computed as merkle root over clause leaves and the provenance leaf)",
    });

    // 3. Each agreement clause's leaf — every clause is cleartext (the IPFS
    //    body carries them in full), so the leaf is recomputed on the fly.
    for (const clauseEntry of agreement.clauses) {
        anchors.push({
            kind: "agreement-clause-leaf",
            label: `Clause leaf — ${clauseEntry.clause}`,
            hash: computeClauseLeaf(clauseEntry),
            sourceLocation: `Merkle leaf under checkoutHash root. Reader recomputes via computeClauseLeaf({clause: "${clauseEntry.clause}", data}) and verifies inclusion in the checkoutHash tree.`,
        });
    }

    // 3b. The agreement FORMAT's provenance leaf — the registered agreement
    //     the order instantiated and the composition root of its assembly,
    //     under the reserved key. A leaf of the same tree: without it the
    //     listed leaves do not rebuild the root.
    if (agreement.provenance !== undefined) {
        const { agreementHash, compositionHash } = agreement.provenance;
        anchors.push({
            kind: "agreement-provenance-leaf",
            label: "Provenance leaf — the registered agreement and the assembly this order instantiated",
            hash: computeProvenanceLeaf(agreementHash, compositionHash),
            sourceLocation: `Merkle leaf under checkoutHash root. Reader recomputes via computeProvenanceLeaf("${agreementHash}", "${compositionHash}") and verifies inclusion in the checkoutHash tree.`,
        });
    }

    // 4. Lifecycle attestation contentRefs (scoped to this order).
    for (const att of attestations) {
        if (att.orderHash !== order.orderHash) continue;
        anchors.push({
            kind: "attestation-content-ref",
            label: `Attestation contentRef — ${att.clauseId} stage ${att.stage}`,
            hash: att.contentRef,
            sourceLocation: `Attestation(orderHash=${truncateHex(att.orderHash, { head: 8 })}, clauseId=${att.clauseId}, stage=${att.stage}).contentRef = keccak256(content). Original content recoverable from the transaction calldata.`,
            transactionHash: att.transactionHash ?? undefined,
        });
    }

    return {
        title: "Hash appendix — verification anchors",
        orderHash: order.orderHash,
        processId: order.processId,
        checkoutHash: order.checkoutHash ?? "0x",
        buyer: order.buyer,
        seller: order.seller,
        anchors,
    };
}

