/**
 * agreement.ts — clause-composed agreement manifest + merkle root + inclusion proofs.
 *
 * An Agreement is the off-chain semantic layer whose merkle root becomes the
 * on-chain `agreementHash` in the signed Commitment struct. Each clause (clause
 * section) is a leaf; inclusion proofs let runtime attestations prove their
 * content was committed to at contract-signing time.
 *
 * Leaf format: `keccak256(clauseId || sectionDataHash)` where
 *   - `clauseId` = `keccak256(clauseKey)` (matches on-chain bytes32 id)
 *   - `sectionDataHash` = `keccak256(canonicalJSON(section.data))`
 *
 * Merkle tree: OpenZeppelin-style sorted-pair hashing. Leaves are sorted
 * lexicographically; pair hash = `keccak256(min(a,b) || max(a,b))`. Odd leaves
 * promote to the next layer unpaired. Inclusion proofs verify on-chain via
 * `MerkleProof.verify`.
 */

import { keccak256, toHex, concat, encodeAbiParameters, type Hex } from "viem";
import { encodeContentFromSpec } from "./clauses/encode.js";
import { embeddedSpec } from "./clauses/embedded.js";

// ── Core types ──────────────────────────────────────────────────────────────

/**
 * A single clause in the agreement. The clause key identifies the vocabulary
 * (registered in ClauseRegistry); data is the clause content per that clause.
 */
export interface AgreementSection {
    clause: string;
    /** Clause version — paired with `clause` to form the on-chain id
     *  keccak256(abi.encode(clause, version)). Sourced from the clause spec. */
    version: number;
    data: Record<string, unknown>;
}

/**
 * The signed agreement. Parties compose sections from registered clauses, sort
 * by clause key, and sign the merkle root of the leaves.
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

function clauseIdOf(clauseKey: string, version: number): Hex {
    return keccak256(encodeAbiParameters([{ type: "string" }, { type: "uint64" }], [clauseKey, BigInt(version)]));
}

/**
 * Return the on-chain sectionData bytes for an agreement section.
 *
 * cross-checked clauses (declarative clauses) encode their data via the
 * generic canonical encoder — the same path the runtime attestation's
 * `content` takes — so the on-chain byte-equality check
 * `keccak256(content) == keccak256(sectionData)` succeeds. runtime
 * clauses (no committed clause) and unknown clauses fall through to
 * canonical JSON bytes.
 *
 * Post-Keystone there is no per-clause dispatch table; the embedded
 * spec drives both encoding and tier classification.
 */
export function getSectionDataBytes(section: AgreementSection): Hex {
    const spec = embeddedSpec(section.clause);
    if (spec && spec.block?.tier === "cross-checked") {
        return encodeContentFromSpec(spec, section.data);
    }
    return toHex(new TextEncoder().encode(canonicalizeSectionData(section.data)));
}

/**
 * Compute one merkle leaf: `keccak256(clauseId || keccak256(sectionDataBytes))`.
 * Uses `getSectionDataBytes` so leaves computed off-chain match the coordinator's
 * reconstruction during inclusion-proof verification.
 */
export function computeSectionLeaf(section: AgreementSection): Hex {
    return keccak256(
        concat([clauseIdOf(section.clause, section.version), keccak256(getSectionDataBytes(section))]),
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
    const keys = agreement.sections.map((s) => s.clause);
    const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
    if (dupes.length > 0) {
        throw new Error(`Duplicate clause keys in agreement: ${[...new Set(dupes)].join(", ")}`);
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
    clauseKey: string,
): { leaf: Hex; proof: Hex[] } {
    const section = agreement.sections.find((s) => s.clause === clauseKey);
    if (!section) {
        throw new Error(`Section not found: ${clauseKey}`);
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
