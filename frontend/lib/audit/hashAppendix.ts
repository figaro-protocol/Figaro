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
 *      `Attestation(orderHash, processId, attester, schemaId, stage,
 *      contentRef)` event on chain.
 *
 * The appendix lists every hash in this chain so a reader can perform
 * each step independently.
 */

import {
    type Agreement,
    type RedactableAgreement,
    computeSectionLeaf,
    isRedactedSection,
} from "@/lib/core/agreementManifest";
import type { Order } from "@/lib/core/store";
import type { AttestationRecord } from "@/lib/mechanisms/useGHGDisclosure";
import type { ExtractedDocument } from "./types";
import { truncateHex } from "@/lib/shared/formatHex";

export type HashAnchorKind =
    | "agreement-root"
    | "agreement-section-leaf"
    | "attestation-content-ref"
    | "transaction-hash"
    | "order-hash"
    | "process-id";

export interface HashAnchor {
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
    agreement: Agreement | RedactableAgreement,
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
        hash: order.id,
        sourceLocation: "FigaroCore.orderStatus[orderHash] / OrderCommitted.orderHash",
    });

    // 2. Agreement root.
    anchors.push({
        kind: "agreement-root",
        label: "Agreement merkle root",
        hash: order.agreementHash ?? "0x",
        sourceLocation: "OrderCommitted.agreementHash (matches keccak256 of canonical agreement JSON, computed as merkle root over section leaves)",
    });

    // 3. Each agreement section's leaf. Redacted sections carry their leaf
    //    directly; cleartext sections compute it on the fly. The hash itself
    //    is identical regardless — only the verifier's reconstruction path
    //    differs (read-and-recompute vs trust-the-leaf).
    for (const section of agreement.sections) {
        const redacted = isRedactedSection(section);
        anchors.push({
            kind: "agreement-section-leaf",
            label: `Section leaf — ${section.schema}${redacted ? " (sealed)" : ""}`,
            hash: redacted ? section.leaf : computeSectionLeaf(section),
            sourceLocation: redacted
                ? `Merkle leaf under agreementHash root. Section is redacted in this distribution; cleartext is held by the original parties and can be revealed selectively. Reader recomputes from revealed cleartext via computeSectionLeaf(...) and checks it matches this leaf.`
                : `Merkle leaf under agreementHash root. Reader recomputes via computeSectionLeaf({schema: "${section.schema}", data}) and verifies inclusion in the agreementHash tree.`,
        });
    }

    // 4. Lifecycle attestation contentRefs (scoped to this order).
    for (const att of attestations) {
        if (att.orderHash !== order.id) continue;
        anchors.push({
            kind: "attestation-content-ref",
            label: `Attestation contentRef — ${att.schemaId} stage ${att.stage}`,
            hash: att.contentRef,
            sourceLocation: `Attestation(orderHash=${shortHex(att.orderHash)}, schemaId=${att.schemaId}, stage=${att.stage}).contentRef = keccak256(content). Original content recoverable from the transaction calldata.`,
            transactionHash: att.transactionHash ?? undefined,
        });
    }

    return {
        title: "Hash appendix — verification anchors",
        orderHash: order.id,
        processId: order.processId,
        agreementHash: order.agreementHash ?? "0x",
        buyer: order.buyer,
        seller: order.seller,
        anchors,
    };
}

function shortHex(hex: string): string {
    return truncateHex(hex, { head: 8 });
}
