/**
 * Sovereign process-log extractor — pure projection of an order's
 * `figaro-merchant-process-v1` and `figaro-courier-process-v1`
 * attestations into a per-role event timeline.
 *
 * Per CLAUDE.md "When to add a per-role process clause": these two
 * clauses exist because off-chain sellers (merchants, couriers) need
 * a sovereign event log to make their physical-world state changes
 * tamper-proof evidence. The kernel records the buyer's actions
 * directly (commit / resolveProcess); the off-chain sellers record
 * theirs via these per-role process clauses.
 *
 * Both clauses have the same content shape: `(uint8 eventType,
 * string evidenceUri)`. The eventType is an index into a role-specific
 * enum (merchant: 0-5; courier: 0-7 or whatever the validator
 * declares). The audit document records the receipt; recovering the
 * eventType label and evidenceUri requires decoding the transaction
 * calldata.
 */

import type { Order } from "@/lib/core/store";
import type { AttestationRecord } from "@/lib/mechanisms/useGHGDisclosure";
import type { ExtractedDocument } from "./types";
import {
    COURIER_PROCESS_CLAUSE_KEY,
    MERCHANT_PROCESS_CLAUSE_KEY,
} from "@/lib/core/agreement";

export interface ProcessLogEntry {
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

export interface ProcessLogsDocument extends ExtractedDocument {
    /** Merchant-role events for this order, in input order (typically
     *  block order). */
    merchantEvents: ProcessLogEntry[];
    /** Courier-role events for this order, in input order. */
    courierEvents: ProcessLogEntry[];
}

export function extractProcessLogs(
    order: Order,
    attestations: readonly AttestationRecord[],
): ProcessLogsDocument {
    const merchantEvents: ProcessLogEntry[] = [];
    const courierEvents: ProcessLogEntry[] = [];

    for (const att of attestations) {
        if (att.orderHash !== order.id) continue;
        if (att.clauseId === MERCHANT_PROCESS_CLAUSE_KEY) {
            merchantEvents.push({
                clauseKey: MERCHANT_PROCESS_CLAUSE_KEY,
                attester: att.attester,
                stage: att.stage,
                contentRef: att.contentRef,
                blockNumber: att.blockNumber,
                transactionHash: att.transactionHash ?? undefined,
            });
        } else if (att.clauseId === COURIER_PROCESS_CLAUSE_KEY) {
            courierEvents.push({
                clauseKey: COURIER_PROCESS_CLAUSE_KEY,
                attester: att.attester,
                stage: att.stage,
                contentRef: att.contentRef,
                blockNumber: att.blockNumber,
                transactionHash: att.transactionHash ?? undefined,
            });
        }
    }

    return {
        title: "Sovereign process logs",
        orderHash: order.id,
        processId: order.processId,
        agreementHash: order.agreementHash ?? "0x",
        buyer: order.buyer,
        seller: order.seller,
        merchantEvents,
        courierEvents,
    };
}
