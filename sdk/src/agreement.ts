/**
 * agreement.ts — schema-composed agreement manifest + merkle root + inclusion proofs.
 *
 * An Agreement is the off-chain semantic layer whose merkle root becomes the
 * on-chain `agreementHash` in the signed Commitment struct. Each clause (schema
 * section) is a leaf; inclusion proofs let runtime attestations prove their
 * content was committed to at contract-signing time.
 *
 * Leaf format: `keccak256(schemaId || sectionDataHash)` where
 *   - `schemaId` = `keccak256(schemaKey)` (matches on-chain bytes32 id)
 *   - `sectionDataHash` = `keccak256(canonicalJSON(section.data))`
 *
 * Merkle tree: OpenZeppelin-style sorted-pair hashing. Leaves are sorted
 * lexicographically; pair hash = `keccak256(min(a,b) || max(a,b))`. Odd leaves
 * promote to the next layer unpaired. Inclusion proofs verify on-chain via
 * `MerkleProof.verify`.
 */

import { keccak256, toHex, concat, type Hex } from "viem";
import {
    encodeGeoContent,
    encodeFulfilmentV2Content,
    encodeJurisdictionContent,
    encodeGHGScopeContent,
    encodeCommerceContent,
    encodeProximityPolicyContent,
    type GeoContent,
    type FulfilmentV2Content,
    type JurisdictionContent,
    type GHGScopeContent,
    type CommerceContent,
    type ProximityBand,
} from "./schemas/encode.js";

// ── Core types ──────────────────────────────────────────────────────────────

/**
 * A single clause in the agreement. The schema key identifies the vocabulary
 * (registered in SchemaRegistry); data is the clause content per that schema.
 */
export interface AgreementSection {
    schema: string;
    data: Record<string, unknown>;
}

/**
 * The signed agreement. Parties compose sections from registered schemas, sort
 * by schema key, and sign the merkle root of the leaves.
 */
export interface Agreement {
    version: "a1";
    buyer: `0x${string}`;
    seller: `0x${string}`;
    sections: AgreementSection[];
}

// ── Canonical serialization ─────────────────────────────────────────────────

function sortedReplacer(_key: string, value: unknown): unknown {
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
        return Object.keys(value as Record<string, unknown>)
            .sort()
            .reduce<Record<string, unknown>>((acc, k) => {
                acc[k] = (value as Record<string, unknown>)[k];
                return acc;
            }, {});
    }
    return value;
}

/**
 * Deterministic JSON serialization: sorted object keys, preserved array order.
 * Used by both parties so the same logical data always produces the same hash.
 */
export function canonicalizeSectionData(data: Record<string, unknown>): string {
    return JSON.stringify(data, sortedReplacer);
}

// ── Merkle primitives ───────────────────────────────────────────────────────

const ZERO_HASH = `0x${"0".repeat(64)}` as Hex;

function schemaIdOf(schemaKey: string): Hex {
    return keccak256(toHex(new TextEncoder().encode(schemaKey)));
}

/**
 * Encoders for Category-2 (declarative-clause) schemas. These produce the ABI
 * bytes that match the on-chain validator's `abi.decode` for each schema.
 * Both `sectionData` (committed at agreement time) and runtime attestation
 * `content` must open to these exact bytes — the validator enforces
 * `keccak256(content) == keccak256(sectionData)` to prevent drift.
 *
 * Category-1 schemas (delivery-lifecycle, proximity-proof, merchant-process,
 * courier-process) have no committed clause; their sectionData remains
 * canonical JSON and the validator does not cross-check. Note: the sister
 * schema figaro-proximity-policy-v1 IS Category-2 (committed band), while
 * figaro-proximity-proof-v1 is Category-1 (runtime witness payload).
 */
const CATEGORY_2_ENCODERS: Record<string, (data: Record<string, unknown>) => Hex> = {
    "figaro-geo-v1": (data) => encodeGeoContent({
        originGeohash: data.originGeohash as string,
        destinationGeohash: data.destinationGeohash as string,
    } as GeoContent),
    "figaro-fulfilment-v2": (data) => encodeFulfilmentV2Content(data as unknown as FulfilmentV2Content),
    "figaro-jurisdiction-v1": (data) => encodeJurisdictionContent({
        applicableLaw: data.applicableLaw as string,
        forum: data.forum as string | undefined,
        language: data.language as string | undefined,
    }),
    "figaro-ghg-protocol-v1": (data) => encodeGHGScopeContent(data as GHGScopeContent),
    "figaro-ghg-iso-14064-v1": (data) => encodeGHGScopeContent(data as GHGScopeContent),
    "figaro-ghg-pas-2050-v1": (data) => encodeGHGScopeContent(data as GHGScopeContent),
    "figaro-ghg-en-16258-v1": (data) => encodeGHGScopeContent(data as GHGScopeContent),
    "figaro-ghg-custom-v1": (data) => encodeGHGScopeContent(data as GHGScopeContent),
    "figaro-proximity-policy-v1": (data) => encodeProximityPolicyContent({
        band: data.band as ProximityBand,
    }),
    "figaro-commerce-v1": (data) => encodeCommerceContent({
        currency: data.currency as Hex,
        payment: BigInt(data.payment as string | number | bigint),
        lineItems: ((data.lineItems as Array<Record<string, unknown>>) ?? []).map((li) => ({
            itemId: li.itemId as string,
            name: li.name as string,
            quantity: BigInt(li.quantity as string | number | bigint),
            unitPrice: BigInt(li.unitPrice as string | number | bigint),
        })),
    }),
};

/**
 * Return the on-chain sectionData bytes for an agreement section. For
 * Category-2 schemas (declarative clauses) this is ABI-encoded in the same
 * shape the runtime validator expects as `content`, so the on-chain
 * byte-equality check `keccak256(content) == keccak256(sectionData)` can
 * succeed. For other schemas this is canonical JSON bytes.
 */
export function getSectionDataBytes(section: AgreementSection): Hex {
    const encoder = CATEGORY_2_ENCODERS[section.schema];
    if (encoder) return encoder(section.data);
    return toHex(new TextEncoder().encode(canonicalizeSectionData(section.data)));
}

/**
 * Compute one merkle leaf: `keccak256(schemaId || keccak256(sectionDataBytes))`.
 * Uses `getSectionDataBytes` so leaves computed off-chain match the coordinator's
 * reconstruction during inclusion-proof verification.
 */
export function computeSectionLeaf(section: AgreementSection): Hex {
    return keccak256(
        concat([schemaIdOf(section.schema), keccak256(getSectionDataBytes(section))]),
    );
}

function hashPair(a: Hex, b: Hex): Hex {
    return a.toLowerCase() < b.toLowerCase()
        ? keccak256(concat([a, b]))
        : keccak256(concat([b, a]));
}

function buildMerkleRoot(leaves: readonly Hex[]): Hex {
    if (leaves.length === 0) return ZERO_HASH;
    let layer: Hex[] = [...leaves];
    while (layer.length > 1) {
        const next: Hex[] = [];
        for (let i = 0; i < layer.length; i += 2) {
            next.push(i + 1 < layer.length ? hashPair(layer[i], layer[i + 1]) : layer[i]);
        }
        layer = next;
    }
    return layer[0];
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Compute the `agreementHash` for an Agreement: merkle root over sorted
 * section leaves. Empty agreements return bytes32(0).
 */
export function computeAgreementHash(agreement: Agreement): Hex {
    const keys = agreement.sections.map((s) => s.schema);
    const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
    if (dupes.length > 0) {
        throw new Error(`Duplicate schema keys in agreement: ${[...new Set(dupes)].join(", ")}`);
    }
    const leaves = agreement.sections.map(computeSectionLeaf);
    leaves.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    return buildMerkleRoot(leaves);
}

/**
 * Build an inclusion proof for a given section. Returns the leaf and the
 * sibling hashes walking the tree toward the root. Throws if the section is
 * absent from the agreement.
 */
export function buildSectionInclusionProof(
    agreement: Agreement,
    schemaKey: string,
): { leaf: Hex; proof: Hex[] } {
    const section = agreement.sections.find((s) => s.schema === schemaKey);
    if (!section) {
        throw new Error(`Section not found: ${schemaKey}`);
    }

    const targetLeaf = computeSectionLeaf(section);
    const leaves = agreement.sections.map(computeSectionLeaf);
    leaves.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

    let idx = leaves.findIndex((l) => l.toLowerCase() === targetLeaf.toLowerCase());
    if (idx < 0) throw new Error("Internal error: leaf not in sorted tree");

    const proof: Hex[] = [];
    let layer: Hex[] = [...leaves];
    while (layer.length > 1) {
        const siblingIdx = idx % 2 === 0 ? idx + 1 : idx - 1;
        if (siblingIdx < layer.length) {
            proof.push(layer[siblingIdx]);
        }
        const next: Hex[] = [];
        for (let i = 0; i < layer.length; i += 2) {
            next.push(i + 1 < layer.length ? hashPair(layer[i], layer[i + 1]) : layer[i]);
        }
        layer = next;
        idx = Math.floor(idx / 2);
    }

    return { leaf: targetLeaf, proof };
}

/**
 * Verify an inclusion proof against a root. Mirrors the on-chain OZ
 * `MerkleProof.verify` so receipts produced here validate identically
 * off-chain and on-chain.
 */
export function verifyInclusionProof(
    root: Hex,
    leaf: Hex,
    proof: readonly Hex[],
): boolean {
    let computed = leaf;
    for (const sibling of proof) {
        computed = hashPair(computed, sibling);
    }
    return computed.toLowerCase() === root.toLowerCase();
}
