/**
 * Sovereign process-log extractor — pure projection of an order's
 * `figaro-merchant-process-v1` and `figaro-courier-process-v1`
 * attestations into a per-role event timeline.
 *
 * Per CLAUDE.md "When to add a per-role process schema": these two
 * schemas exist because off-chain operators (merchants, couriers) need
 * a sovereign event log to make their physical-world state changes
 * tamper-proof evidence. The kernel records the buyer's actions
 * directly (commit / resolveProcess); the off-chain operators record
 * theirs via these per-role process schemas.
 *
 * Both schemas have the same content shape: `(uint8 eventType,
 * string evidenceUri)`. The eventType is an index into a role-specific
 * enum (merchant: 0-5; courier: 0-7 or whatever the validator
 * declares). The audit document records the receipt; recovering the
 * eventType label and evidenceUri requires decoding the transaction
 * calldata.
 */

import type { Order } from "@/lib/core/store";
import type { AttestationRecord } from "@/lib/mechanisms/useGHGDisclosure";
import type { ExtractedDocument } from "./types";

const MERCHANT_PROCESS_SCHEMA_KEY = "figaro-merchant-process-v1";
const COURIER_PROCESS_SCHEMA_KEY = "figaro-courier-process-v1";

export interface ProcessLogEntry {
    role: "merchant" | "courier";
    schemaKey: string;
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
        if (att.schemaId === MERCHANT_PROCESS_SCHEMA_KEY) {
            merchantEvents.push({
                role: "merchant",
                schemaKey: MERCHANT_PROCESS_SCHEMA_KEY,
                attester: att.attester,
                stage: att.stage,
                contentRef: att.contentRef,
                blockNumber: att.blockNumber,
                transactionHash: att.transactionHash ?? undefined,
            });
        } else if (att.schemaId === COURIER_PROCESS_SCHEMA_KEY) {
            courierEvents.push({
                role: "courier",
                schemaKey: COURIER_PROCESS_SCHEMA_KEY,
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
        merchantEvents,
        courierEvents,
    };
}
