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

/**
 * A process aggregated from its orders. `rootBuyer` is the process-level
 * resolver — the one party who can call `resolveProcess` (kernel star shape).
 * This field is deliberately NOT named `buyer`: `Commitment.buyer` / `Order.buyer`
 * is the per-order party, and on a root order the two coincide. Filtering
 * processes on `p.buyer` silently matches nothing — use `p.rootBuyer`.
 */
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

// ── Discovery: registry events (the three registry families) ─────────────────
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
    registeredBy: Address;
    blockNumber: number;
    logIndex: number;
    /** Set when the source log carries it. */
    transactionHash: Hex | null;
}

/** ClauseRegistry `DepositWithdrawn`. `idHash` is the clause key, NOT the bare
 *  name — the withdraw path keys on `keccak256(abi.encode(clauseId, version))`. */
export interface ClauseWithdrawnEvent {
    idHash: Hex;
    registeredBy: Address;
    blockNumber: number;
    logIndex: number;
}

/** MembersRegistry `MemberRegistered` OR `MemberProfileUpdated` — one shape, the
 *  `updated` flag distinguishing them. Current metadataURI = most-recent of the
 *  two for an address. */
export interface MemberRegisteredEvent {
    member: Address;
    metadataURI: string;
    /** false = MemberRegistered; true = MemberProfileUpdated. */
    updated: boolean;
    blockNumber: number;
    logIndex: number;
    /** Set when the source log carries it. */
    transactionHash: Hex | null;
}

/** MembersRegistry `MemberWithdrawalRequested` — the DE-SURFACING event, not
 *  `MemberWithdrawn`. Requesting clears the dedup guard immediately (the deposit
 *  stays locked for the cooldown), so this is what removes a member from the live
 *  set; a later re-registration re-surfaces them. */
export interface MemberWithdrawnEvent {
    member: Address;
    blockNumber: number;
    logIndex: number;
}

/** AssemblyRegistry `AssemblyRegistered`. Identity IS `compositionHash`; the
 *  human slug is derived off-chain (AssemblyRegistry.sol:16-21). */
export interface AssemblyRegisteredEvent {
    compositionHash: Hex;
    registeredBy: Address;
    contentURI: string;
    blockNumber: number;
    logIndex: number;
    /** Set when the source log carries it. */
    transactionHash: Hex | null;
}

/** AssemblyRegistry `DepositWithdrawn` — keyed by `compositionHash` directly. */
export interface AssemblyWithdrawnEvent {
    compositionHash: Hex;
    registeredBy: Address;
    blockNumber: number;
    logIndex: number;
}

// ── Discovery: live views (deposit-withdrawn entries filtered out) ─────────
//
// What `getClauses/getMembers/getAssemblies` return: the LIVE-staked set, each
// a pointer (contentURI/metadataURI) the consumer hydrates from IPFS itself —
// the SDK stays viem-only and never fetches off-chain documents.

export interface RegisteredClause {
    clauseId: string;
    version: number;
    /** `keccak256(abi.encode(clauseId, version))` — the on-chain key. */
    idHash: Hex;
    contentHash: Hex;
    contentURI: string;
    registeredBy: Address;
}

export interface RegisteredMember {
    member: Address;
    /** Current metadataURI — most-recent `MemberRegistered`/`MemberProfileUpdated`. */
    metadataURI: string;
}

export interface RegisteredAssembly {
    compositionHash: Hex;
    registeredBy: Address;
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
    membersRegistry?: Address;
    assemblyRegistry?: Address;
    /** FigaroBatchVerifier — batch-settled clause content verification (batch path only). */
    batchVerifier?: Address;
    /** UsageCounter — records verified clause/assembly usage per accrual period. */
    usageCounter?: Address;
    /** RpgfMinter — pays clause authors and assembly designers pro rata to recorded usage. */
    rpgfMinter?: Address;
    /** Permit2 — the permit layer WitnessSwapAndCommitCoordinator pulls swap input tokens through. */
    permit2?: Address;
    /** Uniswap Universal Router (or devnet mock) — the swap venue the coordinator routes through. */
    swapRouter?: Address;
    /** WitnessSwapAndCommitCoordinator — off-protocol multi-token bond funding via Permit2 witness + swap + commit. */
    witnessSwapAndCommitCoordinator?: Address;
    /** Disperse (or devnet mock) — composed post-settlement batch dispersal. */
    multisender?: Address;
    /** DAO treasury multisig — holds the 300M-florin DAO genesis allocation. */
    daoTreasury?: Address;
}

/** The key names a PUBLISHED DEPLOYMENT RECORD uses (the etherscan-equivalent
 *  document a live deployment publishes: chain id, RPC, contract addresses).
 *  They are NOT the `FigaroAddresses` field names — `figaroCore` vs `core`,
 *  `tokenAddress` vs `token` — so a record spread verbatim into an SDK call
 *  yields undefined contract addresses. Map it through
 *  `addressesFromDeploymentRecord` instead. This type is the full published
 *  record (mirrors `.deployments/*.json` and the `/spec` route-key table:
 *  the kernel, registries, and coordinators/routers/RPGF surface); core reads
 *  require only the six — `figaroCore`, `tokenAddress`, `attestationCoordinator`,
 *  `clauseRegistry`, `membersRegistry`, `assemblyRegistry`. The rest are optional
 *  and pass through only when present. */
export interface FigaroDeploymentRecord {
    figaroCore: Address;
    tokenAddress?: Address;
    attestationCoordinator?: Address;
    clauseRegistry?: Address;
    membersRegistry?: Address;
    assemblyRegistry?: Address;
    batchVerifier?: Address;
    usageCounter?: Address;
    rpgfMinter?: Address;
    permit2?: Address;
    swapRouter?: Address;
    witnessSwapAndCommitCoordinator?: Address;
    multisender?: Address;
    daoTreasury?: Address;
}

/** Map a published deployment record to the SDK's `FigaroAddresses` — the
 *  ONE place the two vocabularies meet. Throws when `figaroCore` is absent:
 *  nothing works without the kernel address, and a silent undefined here
 *  surfaces later as an opaque transport error. */
export function addressesFromDeploymentRecord(record: FigaroDeploymentRecord): FigaroAddresses {
    if (!record.figaroCore) {
        throw new Error("Deployment record has no figaroCore address — not a Figaro deployment record?");
    }
    return {
        core: record.figaroCore,
        ...(record.tokenAddress ? { token: record.tokenAddress } : {}),
        ...(record.attestationCoordinator ? { attestationCoordinator: record.attestationCoordinator } : {}),
        ...(record.clauseRegistry ? { clauseRegistry: record.clauseRegistry } : {}),
        ...(record.membersRegistry ? { membersRegistry: record.membersRegistry } : {}),
        ...(record.assemblyRegistry ? { assemblyRegistry: record.assemblyRegistry } : {}),
        ...(record.batchVerifier ? { batchVerifier: record.batchVerifier } : {}),
        ...(record.usageCounter ? { usageCounter: record.usageCounter } : {}),
        ...(record.rpgfMinter ? { rpgfMinter: record.rpgfMinter } : {}),
        ...(record.permit2 ? { permit2: record.permit2 } : {}),
        ...(record.swapRouter ? { swapRouter: record.swapRouter } : {}),
        ...(record.witnessSwapAndCommitCoordinator ? { witnessSwapAndCommitCoordinator: record.witnessSwapAndCommitCoordinator } : {}),
        ...(record.multisender ? { multisender: record.multisender } : {}),
        ...(record.daoTreasury ? { daoTreasury: record.daoTreasury } : {}),
    };
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
