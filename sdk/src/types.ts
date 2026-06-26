/**
 * @figaro/core — Types
 *
 * Domain types for the Figaro protocol. No runtime dependencies — pure type definitions.
 */

// ── Hex-branded type (matches viem's convention) ────────────────────────────

export type Hex = `0x${string}`;
export type Address = `0x${string}`;

// ── Order state ─────────────────────────────────────────────────────────────

export enum OrderState {
    Active = 0,
    Resolved = 1,
}

// ── On-chain order (reconstructed from events) ──────────────────────────────

export interface Order {
    /** bytes32 commitment hash (content-addressed from EIP-712 struct). */
    orderHash: Hex;
    /** bytes32 process identifier. */
    processId: Hex;
    buyer: Address;
    seller: Address;
    currency: Address;
    payment: bigint;
    cumulativeValue: bigint;
    agreementHash: Hex;
    /** Salt from the commitment (for full reconstruction at resolution). */
    salt: bigint;
    /** Deadline from the commitment (for full reconstruction at resolution). */
    deadline: bigint;
    state: OrderState;
    /** Block number when committed. */
    blockNumber: number;
    /** Set when resolved. */
    sellerPayout?: bigint;
    /** Set when resolved. */
    buyerPayout?: bigint;
}

// ── Process (aggregated from orders) ────────────────────────────────────────

export interface Process {
    processId: Hex;
    rootBuyer: Address;
    currency: Address;
    cumulativeValue: bigint;
    orders: Map<Hex, Order>;
    resolved: boolean;
}

// ── Parsed event types ──────────────────────────────────────────────────────

export interface OrderCommittedEvent {
    orderHash: Hex;
    processId: Hex;
    buyer: Address;
    seller: Address;
    currency: Address;
    payment: bigint;
    cumulativeValue: bigint;
    agreementHash: Hex;
    salt: bigint;
    deadline: bigint;
    blockNumber: number;
}

export interface OrderResolvedEvent {
    orderHash: Hex;
    processId: Hex;
    sellerPayout: bigint;
    buyerPayout: bigint;
    blockNumber: number;
}

export interface ProcessResolvedEvent {
    processId: Hex;
    buyer: Address;
    orderCount: bigint;
    blockNumber: number;
}

export interface AttestationEvent {
    orderHash: Hex;
    processId: Hex;
    attester: Address;
    clauseId: Hex;
    stage: number;
    contentRef: Hex;
    blockNumber: number;
}

export interface AuctionCreatedEvent {
    auctionId: Hex;
    creator: Address;
    maxPrice: bigint;
    processId: Hex;
    currency: Address;
    blockNumber: number;
}

export interface AuctionClaimedEvent {
    auctionId: Hex;
    provider: Address;
    clearingPrice: bigint;
    blockNumber: number;
}

// ── EIP-712 commitment type (unified — matches CommitmentTypes.sol) ─────────

export interface Commitment {
    processId: Hex;
    buyer: Address;
    seller: Address;
    currency: Address;
    payment: bigint;
    expectedCumulativeValue: bigint;
    agreementHash: Hex;
    salt: bigint;
    deadline: bigint;
}

export interface EIP712Domain {
    name: "FigaroCore";
    version: "3";
    chainId: number;
    verifyingContract: Address;
}

// ── Contract addresses configuration ────────────────────────────────────────

export interface FigaroAddresses {
    core: Address;
    token?: Address;
    attestationCoordinator?: Address;
    clauseRegistry?: Address;
    dutchAuction?: Address;
}

// ── Bond breakdown ──────────────────────────────────────────────────────────

export interface BondBreakdown {
    /** Seller bond = 2× cumulativeValue. */
    sellerBond: bigint;
    /** Buyer bond = 2× payment. */
    buyerBond: bigint;
    /** Total locked capital for this order. */
    totalLocked: bigint;
}

export interface SettlementBreakdown {
    /** Seller receives: payment + sellerBond. */
    sellerPayout: bigint;
    /** Buyer receives: buyerBond - payment = payment (net: paid for value received). */
    buyerPayout: bigint;
    /** Net transfer from buyer to seller. */
    netTransfer: bigint;
}

// ── Agent context (the JSON briefing an agent receives) ─────────────────────

export interface AgentProcessContext {
    processId: Hex;
    rootBuyer: Address;
    currency: Address;
    cumulativeValue: bigint;
    activeOrderCount: number;
    resolved: boolean;
    orders: AgentOrderContext[];
}

export interface AgentOrderContext {
    orderHash: Hex;
    buyer: Address;
    seller: Address;
    payment: bigint;
    cumulativeValue: bigint;
    state: "Active" | "Resolved";
}
