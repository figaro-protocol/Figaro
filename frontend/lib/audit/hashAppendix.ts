/**
 * Hash appendix — every cryptographic anchor in the audit bundle, listed
 * alongside its on-chain source. The reader / auditor can verify the
 * entire document set against chain by recomputing each hash from its
 * cited content and comparing to this table.
 *
 * Verification path:
 *
 *   1. Each agreement section's `body` (in the contract document) hashes
 *      to its `leafHash` via `computeSectionLeaf(section)`.
 *   2. The leaves combine into the merkle root = `agreementHash`.
 *   3. The `agreementHash` matches the `agreementHash` field on the
 *      `OrderCommitted` event emitted at `transactionHash` for the order.
 *   4. Each lifecycle attestation's content hashes to its `contentRef`
 *      via `keccak256(content)`. The contentRef is logged by the
 *      `Attestation(orderHash, processId, attester, clauseId, stage,
 *      contentRef)` event on chain.
 *
 * The appendix lists every hash in this chain so a reader can perform
 * each step independently.
 */

import { type Agreement, computeSectionLeaf } from "@figaro-protocol/sdk";
import type { Order } from "@/lib/kernel/store";
import type { AttestationRecord } from "@/lib/composition/indexer";
import type { ExtractedDocument } from "./types";
import { truncateHex } from "@/lib/shared/formatHex";

type HashAnchorKind =
    | "agreement-root"
    | "agreement-section-leaf"
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
     *  reader: e.g. "OrderCommitted.agreementHash" or
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
        hash: order.agreementHash ?? "0x",
        sourceLocation: "OrderCommitted.agreementHash (matches keccak256 of canonical agreement JSON, computed as merkle root over section leaves)",
    });

    // 3. Each agreement section's leaf — every section is cleartext (the IPFS
    //    body carries them in full), so the leaf is recomputed on the fly.
    for (const section of agreement.sections) {
        anchors.push({
            kind: "agreement-section-leaf",
            label: `Section leaf — ${section.clause}`,
            hash: computeSectionLeaf(section),
            sourceLocation: `Merkle leaf under agreementHash root. Reader recomputes via computeSectionLeaf({clause: "${section.clause}", data}) and verifies inclusion in the agreementHash tree.`,
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
        agreementHash: order.agreementHash ?? "0x",
        buyer: order.buyer,
        seller: order.seller,
        anchors,
    };
}

