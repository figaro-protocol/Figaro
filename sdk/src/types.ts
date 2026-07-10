/**
 * @figaro/sdk — Types
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
    /** Set when the source log carries it; calldata recovery
     *  (`getAttestationContent`) starts from this. */
    transactionHash: Hex | null;
}

// ── Discovery: registry events (the three artifact families) ─────────────────
//
// Parallel to the core process events above. A cold-start agent folds these to
// learn what clauses, sellers, and assemblies EXIST — the registries are the
// network's catalogue. Every event carries `logIndex` because seller liveness
// is order-dependent within a block (see DiscoveryGraph), unlike the core
// process events whose block-ordering suffices.

/** ClauseRegistry `ClauseRegistered`. `clauseId` is the bare human name; the
 *  on-chain key is `keccak256(abi.encode(clauseId, version))` (ClauseRegistry.sol:146). */
export interface ClauseRegisteredEvent {
    clauseId: string;
    version: number;
    contentHash: Hex;
    contentURI: string;
    registrar: Address;
    blockNumber: number;
    logIndex: number;
    /** Set when the source log carries it. */
    transactionHash: Hex | null;
}

/** ClauseRegistry `DepositWithdrawn`. `idHash` is the clause key, NOT the bare
 *  name — the withdraw path keys on `keccak256(abi.encode(clauseId, version))`. */
export interface ClauseWithdrawnEvent {
    idHash: Hex;
    registrar: Address;
    blockNumber: number;
    logIndex: number;
}

/** SellerRegistry `SellerRegistered` OR `SellerProfileUpdated` — one shape, the
 *  `updated` flag distinguishing them. Current metadataURI = most-recent of the
 *  two for an address (SellerRegistry.sol:87-90). */
export interface SellerRegisteredEvent {
    seller: Address;
    metadataURI: string;
    /** false = SellerRegistered; true = SellerProfileUpdated. */
    updated: boolean;
    blockNumber: number;
    logIndex: number;
    /** Set when the source log carries it. */
    transactionHash: Hex | null;
}

/** SellerRegistry `SellerWithdrawn`. Withdraw clears the dedup guard and
 *  de-surfaces the seller; a later re-registration re-surfaces it. */
export interface SellerWithdrawnEvent {
    seller: Address;
    blockNumber: number;
    logIndex: number;
}

/** AssemblyRegistry `AssemblyRegistered`. Identity IS `compositionHash`; the
 *  human slug is derived off-chain (AssemblyRegistry.sol:16-21). */
export interface AssemblyRegisteredEvent {
    compositionHash: Hex;
    author: Address;
    contentURI: string;
    blockNumber: number;
    logIndex: number;
    /** Set when the source log carries it. */
    transactionHash: Hex | null;
}

/** AssemblyRegistry `DepositWithdrawn` — keyed by `compositionHash` directly. */
export interface AssemblyWithdrawnEvent {
    compositionHash: Hex;
    author: Address;
    blockNumber: number;
    logIndex: number;
}

// ── Discovery: live views (deposit-withdrawn artifacts filtered out) ─────────
//
// What `getClauses/getSellers/getAssemblies` return: the LIVE-staked set, each
// a pointer (contentURI/metadataURI) the consumer hydrates from IPFS itself —
// the SDK stays viem-only and never fetches off-chain documents.

export interface RegisteredClause {
    clauseId: string;
    version: number;
    /** `keccak256(abi.encode(clauseId, version))` — the on-chain key. */
    idHash: Hex;
    contentHash: Hex;
    contentURI: string;
    registrar: Address;
}

export interface RegisteredSeller {
    seller: Address;
    /** Current metadataURI — most-recent `SellerRegistered`/`SellerProfileUpdated`. */
    metadataURI: string;
}

export interface RegisteredAssembly {
    compositionHash: Hex;
    author: Address;
    contentURI: string;
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
    sellerRegistry?: Address;
    assemblyRegistry?: Address;
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
