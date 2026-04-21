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
import { CORE_ABI } from "./abis.js";
import type {
    Hex,
    Address,
    Commitment,
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
