/**
 * Core order types shared across core-protocol UI components.
 *
 * These mirror the shape used by lib/mechanisms/ hooks so that
 * core components remain independent of mechanism-layer code.
 */

const STATE_MAP = ["Active", "Resolved"] as const;

export interface Order {
    /** bytes32 commitment hash (content-addressed from EIP-712 struct). */
    id: string;
    processId: string;
    buyer: string;
    seller: string;
    currency: string;
    cumulativeValue: bigint;
    payment: bigint;
    state: (typeof STATE_MAP)[number];
    agreementHash: string;
    /** Salt from the commitment (for full reconstruction at resolution). */
    salt: bigint;
    /** Deadline from the commitment (for full reconstruction at resolution). */
    deadline: bigint;
}

export interface OrderWithMetadata extends Order {
    formattedPayment: string;
    formattedCumulativeValue: string;
    shortBuyer: string;
    shortSeller: string;
    shortProcessId: string;
    /** Event-derived: block.timestamp from OrderCommitted (milliseconds). */
    timestamp?: number;
    /** Event-derived: block.timestamp from OrderResolved (seconds). */
    resolvedAt?: number;
}
