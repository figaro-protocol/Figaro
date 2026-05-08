/**
 * commitmentStore — localStorage-backed store for Commitment structs.
 *
 * Why: Commitments are needed for:
 *   - resolveProcess (kernel re-derives order hashes from commitments)
 *   - attestAsSeller (needs the roleCommitment struct)
 *
 * When a commitment was created in this browser, we persist it locally.
 * When it was created elsewhere, we can reconstruct it from OrderCommitted
 * event data because the kernel emits agreementHash, salt, and deadline.
 */

import {
    buildDomain,
    COMMITMENT_TYPES,
    type Commitment,
    type Hex,
    type Address,
} from "@figaro/core";
import type { PublicClient } from "viem";
import { encodeAbiParameters, encodePacked, hashTypedData, keccak256 } from "viem";
import { getAllOrderCommitted } from "@/lib/core/indexer";
import { ZERO_PROCESS_ID } from "@/lib/shared/evm";

const STORE_PREFIX = "figaro:commitment:";
const COMMITMENT_TYPEHASH = keccak256(
    new TextEncoder().encode(
        "Commitment(bytes32 processId,address buyer,address seller,address currency,uint256 payment,uint256 expectedCumulativeValue,bytes32 agreementHash,uint256 salt,uint256 deadline)",
    ),
);

export interface CommitmentOrderSource {
    processId: Hex;
    buyer: Address;
    seller: Address;
    currency: Address;
    payment: bigint;
    cumulativeValue: bigint;
    agreementHash: Hex;
    salt: bigint;
    deadline: bigint;
}

export type ResolutionCommitmentOrder = CommitmentOrderSource & (
    | { orderHash: Hex }
    | { id: Hex }
);

function computeStructHash(c: Commitment): Hex {
    return keccak256(
        encodeAbiParameters(
            [
                { type: "bytes32" },
                { type: "bytes32" },
                { type: "address" },
                { type: "address" },
                { type: "address" },
                { type: "uint256" },
                { type: "uint256" },
                { type: "bytes32" },
                { type: "uint256" },
                { type: "uint256" },
            ],
            [
                COMMITMENT_TYPEHASH,
                c.processId,
                c.buyer,
                c.seller,
                c.currency,
                c.payment,
                c.expectedCumulativeValue,
                c.agreementHash,
                c.salt,
                c.deadline,
            ],
        ),
    );
}

/**
 * Compute the order hash for a commitment.
 * Mirrors the kernel derivation: keccak256(abi.encodePacked(processId, hashStruct(commitment))).
 */
export function computeOrderHash(
    c: Commitment,
    chainId: number,
    coreAddress: Address,
): Hex {
    const structHash = computeStructHash(c);
    const effectiveProcessId = computeCommitmentProcessId(c, chainId, coreAddress);

    return keccak256(
        encodePacked(["bytes32", "bytes32"], [effectiveProcessId, structHash]),
    );
}

export function computeCommitmentProcessId(
    c: Commitment,
    chainId: number,
    coreAddress: Address,
): Hex {
    return c.processId === ZERO_PROCESS_ID
        ? hashTypedData({
            domain: buildDomain(chainId, coreAddress),
            types: COMMITMENT_TYPES,
            primaryType: "Commitment",
            message: c,
        })
        : c.processId;
}

function reconstructCommitmentFromOrder(
    source: CommitmentOrderSource,
): Commitment {
    return {
        processId:
            source.payment === source.cumulativeValue
                ? ZERO_PROCESS_ID
                : source.processId,
        buyer: source.buyer,
        seller: source.seller,
        currency: source.currency,
        payment: source.payment,
        expectedCumulativeValue: source.cumulativeValue,
        agreementHash: source.agreementHash,
        salt: source.salt,
        deadline: source.deadline,
    };
}

/** Serializable form (bigints → strings). */
interface StoredCommitment {
    processId: string;
    buyer: string;
    seller: string;
    currency: string;
    payment: string;
    expectedCumulativeValue: string;
    agreementHash: string;
    salt: string;
    deadline: string;
}

function toStored(c: Commitment): StoredCommitment {
    return {
        processId: c.processId,
        buyer: c.buyer,
        seller: c.seller,
        currency: c.currency,
        payment: c.payment.toString(),
        expectedCumulativeValue: c.expectedCumulativeValue.toString(),
        agreementHash: c.agreementHash,
        salt: c.salt.toString(),
        deadline: c.deadline.toString(),
    };
}

function fromStored(s: StoredCommitment): Commitment {
    return {
        processId: s.processId as Hex,
        buyer: s.buyer as Hex,
        seller: s.seller as Hex,
        currency: s.currency as Hex,
        payment: BigInt(s.payment),
        expectedCumulativeValue: BigInt(s.expectedCumulativeValue),
        agreementHash: s.agreementHash as Hex,
        salt: BigInt(s.salt),
        deadline: BigInt(s.deadline),
    };
}

/** Save a commitment keyed by its order hash. */
export function saveCommitment(orderHash: Hex, commitment: Commitment): void {
    localStorage.setItem(STORE_PREFIX + orderHash, JSON.stringify(toStored(commitment)));
}

/** Load a commitment by order hash. Returns null if not found. */
export function loadCommitment(orderHash: Hex): Commitment | null {
    const raw = localStorage.getItem(STORE_PREFIX + orderHash);
    if (!raw) return null;
    try {
        return fromStored(JSON.parse(raw));
    } catch {
        return null;
    }
}

function loadOrReconstructCommitment(
    orderHash: Hex,
    source?: CommitmentOrderSource,
): Commitment | null {
    const stored = loadCommitment(orderHash);
    if (stored) return stored;
    if (!source) return null;

    const reconstructed = reconstructCommitmentFromOrder(source);
    saveCommitment(orderHash, reconstructed);
    return reconstructed;
}

export function buildResolutionCommitments(
    orders: ResolutionCommitmentOrder[],
): Commitment[] {
    return orders.map((order) => {
        const orderHash = "orderHash" in order ? order.orderHash : order.id;
        const commitment = loadOrReconstructCommitment(orderHash, {
            processId: order.processId,
            buyer: order.buyer,
            seller: order.seller,
            currency: order.currency,
            payment: order.payment,
            cumulativeValue: order.cumulativeValue,
            agreementHash: order.agreementHash,
            salt: order.salt,
            deadline: order.deadline,
        });

        if (!commitment) {
            throw new Error(`Unable to reconstruct commitment for order ${orderHash.slice(0, 10)}...`);
        }

        return commitment;
    });
}

/** Load commitments for multiple order hashes. Returns only found ones. */
export function loadCommitments(orderHashes: Hex[]): Map<Hex, Commitment> {
    const map = new Map<Hex, Commitment>();
    for (const hash of orderHashes) {
        const c = loadCommitment(hash);
        if (c) map.set(hash, c);
    }
    return map;
}

export async function loadOrFetchCommitment(
    client: PublicClient,
    chainId: number,
    orderHash: Hex,
    source?: CommitmentOrderSource,
): Promise<Commitment | null> {
    const fromStore = loadOrReconstructCommitment(orderHash, source);
    if (fromStore) return fromStore;

    const committed = await getAllOrderCommitted(client, chainId);
    const event = committed.find(
        (log) => (log as { args?: { orderHash?: Hex } }).args?.orderHash === orderHash,
    );
    if (!event?.args) return null;
    const args = event.args as Partial<{
        processId: Hex;
        buyer: Address;
        seller: Address;
        currency: Address;
        payment: bigint;
        cumulativeValue: bigint;
        agreementHash: Hex;
        salt: bigint;
        deadline: bigint;
    }>;

    const reconstructed = reconstructCommitmentFromOrder({
        processId: args.processId as Hex,
        buyer: args.buyer as Address,
        seller: args.seller as Address,
        currency: args.currency as Address,
        payment: BigInt(args.payment ?? 0),
        cumulativeValue: BigInt(args.cumulativeValue ?? 0),
        agreementHash: args.agreementHash as Hex,
        salt: BigInt(args.salt ?? 0),
        deadline: BigInt(args.deadline ?? 0),
    });
    saveCommitment(orderHash, reconstructed);
    return reconstructed;
}

/** Delete a stored commitment. */
export function deleteCommitment(orderHash: Hex): void {
    localStorage.removeItem(STORE_PREFIX + orderHash);
}

/** List all stored order hashes. */
export function listStoredCommitments(): Hex[] {
    const keys: Hex[] = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(STORE_PREFIX)) {
            keys.push(key.slice(STORE_PREFIX.length) as Hex);
        }
    }
    return keys;
}
