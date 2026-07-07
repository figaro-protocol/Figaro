/**
 * @figaro/core — Commitment Builder
 *
 * Produces EIP-712 typed data payloads for the unified Commitment struct.
 * These are ready to be signed by any wallet (MetaMask, Safe, programmatic signer).
 *
 * The builder automatically handles:
 *   - Salt generation (random uint256)
 *   - Deadline computation (current time + TTL)
 *   - CumulativeValue fetching for sub-orders (prevents CumulativeValueMismatch reverts)
 *
 * Usage (agent-assists-human):
 *   const typedData = buildCommitment({ ... }, domain);
 *   // Send to wallet for signing
 *
 * Usage (autonomous agent):
 *   const { commitment, typedData } = buildCommitment({ ... }, domain);
 *   const sig = await walletClient.signTypedData(typedData);
 */

import type { PublicClient } from "viem";
import { keccak256, encodeAbiParameters, encodePacked, hashTypedData, toBytes } from "viem";
import { CORE_ABI } from "./abis.js";
import type {
    Hex,
    Address,
    Commitment,
    Order,
    EIP712Domain,
    FigaroAddresses,
} from "./types.js";

// ── EIP-712 type definitions (match CommitmentTypes.sol) ────────────────────

export const COMMITMENT_TYPES = {
    Commitment: [
        { name: "processId", type: "bytes32" },
        { name: "buyer", type: "address" },
        { name: "seller", type: "address" },
        { name: "currency", type: "address" },
        { name: "payment", type: "uint256" },
        { name: "expectedCumulativeValue", type: "uint256" },
        { name: "agreementHash", type: "bytes32" },
        { name: "salt", type: "uint256" },
        { name: "deadline", type: "uint256" },
    ],
} as const;

// ── Domain constructor ──────────────────────────────────────────────────────

export function buildDomain(chainId: number, coreAddress: Address): EIP712Domain {
    return {
        name: "FigaroCore",
        version: "3",
        chainId,
        verifyingContract: coreAddress,
    };
}

// ── Order-hash derivation (mirrors CommitmentTypes.sol + FigaroCore) ──────────
//
// Single source for the on-chain order id. The EIP-712 typehash and the struct
// encoding are DERIVED from COMMITMENT_TYPES above, so they can never drift from
// the type the parties sign. Frontends import these — they do not re-implement.

/** The kernel's zero processId — what a ROOT commitment signs before the kernel
 *  derives the real id. Exported so reconstruction callers can restore it. */
export const ZERO_PROCESS_ID = `0x${"0".repeat(64)}` as Hex;

/** The EIP-712 type string, derived from COMMITMENT_TYPES (single source). */
const COMMITMENT_TYPE_STRING =
    `Commitment(${COMMITMENT_TYPES.Commitment.map((f) => `${f.type} ${f.name}`).join(",")})`;

/** keccak256 of the EIP-712 type string — matches `CommitmentTypes.COMMITMENT_TYPEHASH`. */
export const COMMITMENT_TYPEHASH = keccak256(toBytes(COMMITMENT_TYPE_STRING));

/** EIP-712 hashStruct of a Commitment (NO domain separator) — mirrors
 *  `CommitmentTypes.hashStruct`: keccak256(abi.encode(TYPEHASH, ...fields)). */
export function hashCommitmentStruct(c: Commitment): Hex {
    const params = [
        { type: "bytes32" },
        ...COMMITMENT_TYPES.Commitment.map((f) => ({ type: f.type })),
    ];
    const values = [
        COMMITMENT_TYPEHASH,
        ...COMMITMENT_TYPES.Commitment.map((f) => c[f.name as keyof Commitment]),
    ];
    return keccak256(encodeAbiParameters(params, values as never));
}

/** The order's process id: a root order (processId == 0) uses the full EIP-712
 *  digest the kernel derives; a sub-order keeps its target processId. */
export function computeCommitmentProcessId(
    c: Commitment,
    chainId: number,
    coreAddress: Address,
): Hex {
    return c.processId.toLowerCase() === ZERO_PROCESS_ID
        ? hashTypedData({
            domain: buildDomain(chainId, coreAddress),
            types: COMMITMENT_TYPES,
            primaryType: "Commitment",
            message: c,
        })
        : c.processId;
}

/** The on-chain order hash: keccak256(abi.encodePacked(processId, hashStruct(c))).
 *  Mirrors the kernel's order-id derivation — the single canonical implementation. */
export function computeOrderHash(c: Commitment, chainId: number, coreAddress: Address): Hex {
    return keccak256(
        encodePacked(
            ["bytes32", "bytes32"],
            [computeCommitmentProcessId(c, chainId, coreAddress), hashCommitmentStruct(c)],
        ),
    );
}

/**
 * Rebuild the Commitment struct from an event-derived Order. `Order` carries
 * every Commitment field (the OrderCommitted event emits all of them), so an
 * agent can reconstruct what to pass to `resolveProcess` without having stored
 * the original structs. `expectedCumulativeValue` is the order's committed
 * `cumulativeValue`.
 *
 * NOTE: a ROOT order's `processId` here is the DERIVED id (what the event
 * carries), not the `0` the party signed. Pass the result through
 * `restoreSignedProcessId` before hashing/submitting, or the kernel's recomputed
 * orderHash will miss. This function stays chain-free so it can be pure.
 */
export function orderToCommitment(order: Order): Commitment {
    return {
        processId: order.processId,
        buyer: order.buyer,
        seller: order.seller,
        currency: order.currency,
        payment: order.payment,
        expectedCumulativeValue: order.cumulativeValue,
        agreementHash: order.agreementHash,
        salt: order.salt,
        deadline: order.deadline,
    };
}

/**
 * Recover the SIGNED commitment from an event-derived one. A ROOT order was
 * signed with `processId = 0`; the kernel derives the real id as the root's
 * EIP-712 digest and emits THAT. Every path that recomputes an order's hash
 * (`resolveProcess`, the attestation coordinator) needs the signed struct, so
 * the root must carry `processId = 0`. If treating the commitment as a root
 * reproduces its own processId, it WAS a root → return it with `processId = 0`;
 * otherwise it is a sub-order and is returned unchanged. Mirrors the frontend's
 * `restoreSignedProcessId` — the SDK-native home so agents don't reimplement it.
 */
export function restoreSignedProcessId(c: Commitment, chainId: number, coreAddress: Address): Commitment {
    const asRoot: Commitment = { ...c, processId: ZERO_PROCESS_ID };
    return computeCommitmentProcessId(asRoot, chainId, coreAddress).toLowerCase() === c.processId.toLowerCase()
        ? asRoot
        : c;
}

// ── Salt generation ─────────────────────────────────────────────────────────

/**
 * Generate a cryptographically random salt (uint256).
 * Uses Web Crypto API when available, falls back to Math.random.
 */
export function generateSalt(): bigint {
    if (typeof globalThis.crypto !== "undefined" && globalThis.crypto.getRandomValues) {
        const buf = new Uint8Array(32);
        globalThis.crypto.getRandomValues(buf);
        return BigInt("0x" + Array.from(buf).map((b) => b.toString(16).padStart(2, "0")).join(""));
    }
    // Fallback for environments without Web Crypto
    return BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER));
}

// ── Deadline computation ────────────────────────────────────────────────────

/** Default commitment TTL: 1 hour. */
const DEFAULT_TTL_SECONDS = 3600;

/**
 * Compute a deadline timestamp (seconds since epoch).
 * @param ttlSeconds How long the commitment remains valid. Default: 1 hour.
 */
export function computeDeadline(ttlSeconds: number = DEFAULT_TTL_SECONDS): bigint {
    return BigInt(Math.floor(Date.now() / 1000) + ttlSeconds);
}

// ── Cumulative value fetcher ────────────────────────────────────────────────

/**
 * Read the current cumulativeValue for a process from the contract.
 * This MUST be called before building a sub-order commitment to prevent
 * CumulativeValueMismatch reverts.
 */
export async function fetchCumulativeValue(
    client: PublicClient,
    coreAddress: Address,
    processId: Hex,
): Promise<bigint> {
    const result = await client.readContract({
        address: coreAddress,
        abi: CORE_ABI,
        functionName: "processes",
        args: [processId],
    });
    // processes() returns (rootBuyer, currency, cumulativeValue, activeOrderCount)
    return (result as readonly [Address, Address, bigint, bigint])[2];
}

// ── Typed data builder ──────────────────────────────────────────────────────

export interface CommitmentParams {
    /** Process ID. Use 0x0 for root orders (kernel derives processId from hash). */
    processId: Hex;
    buyer: Address;
    seller: Address;
    currency: Address;
    payment: bigint;
    /**
     * Expected cumulative value of the process after this order.
     * For root orders: equals payment (first order sets the baseline).
     * For sub-orders: must match the current on-chain cumulativeValue.
     */
    expectedCumulativeValue: bigint;
    agreementHash: Hex;
    /** Override random salt. Useful for deterministic testing. */
    salt?: bigint;
    /** Override deadline. Default: now + 1 hour. */
    deadline?: bigint;
}

/**
 * Build a Commitment and its EIP-712 typed data.
 * Returns both the commitment struct and the signable typed data.
 */
export function buildCommitment(params: CommitmentParams, domain: EIP712Domain) {
    const commitment: Commitment = {
        processId: params.processId,
        buyer: params.buyer,
        seller: params.seller,
        currency: params.currency,
        payment: params.payment,
        expectedCumulativeValue: params.expectedCumulativeValue,
        agreementHash: params.agreementHash,
        salt: params.salt ?? generateSalt(),
        deadline: params.deadline ?? computeDeadline(),
    };

    const typedData = {
        domain,
        types: COMMITMENT_TYPES,
        primaryType: "Commitment" as const,
        message: commitment,
    };

    return { commitment, typedData };
}

/**
 * Convenience: fetch current cumulative value and build a sub-order commitment
 * in one call. This is the safe path — prevents CumulativeValueMismatch.
 */
export async function buildCommitmentSafe(
    client: PublicClient,
    addresses: FigaroAddresses,
    params: Omit<CommitmentParams, "expectedCumulativeValue">,
    domain: EIP712Domain,
) {
    const currentCumulativeValue = await fetchCumulativeValue(
        client,
        addresses.core,
        params.processId,
    );

    return buildCommitment(
        { ...params, expectedCumulativeValue: currentCumulativeValue },
        domain,
    );
}
