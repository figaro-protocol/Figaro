/**
 * agreement.ts — clause-composed agreement + merkle root + inclusion proofs.
 *
 * An Agreement is the off-chain semantic layer whose merkle root becomes the
 * on-chain `agreementHash` in the signed Commitment struct. Each clause (clause
 * section) is a leaf; inclusion proofs let runtime attestations prove their
 * content was committed to at contract-signing time.
 *
 * Leaf format: `keccak256(keccak256(clauseId || sectionDataHash))` (double-hashed
 * for leaf/node domain separation) where
 *   - `clauseId` = `computeClauseKey(clause, version)` =
 *      `keccak256(abi.encode(clause, version))` — the on-chain bytes32 id,
 *      used DIRECTLY as the leaf id (it is NOT hashed again). This same value
 *      is the `clauseId` argument passed to the attest* calls.
 *   - `sectionDataHash` = `keccak256(canonicalJSON(section.data))`
 *
 * Merkle tree: OpenZeppelin-style sorted-pair hashing. Leaves are sorted
 * lexicographically; pair hash = `keccak256(min(a,b) || max(a,b))`. Odd leaves
 * promote to the next layer unpaired. Inclusion proofs verify on-chain via
 * `MerkleProof.verify`.
 */

import { keccak256, toHex, concat, type Hex } from "viem";
import { computeClauseKey } from "./discovery.js";
import { ZERO_BYTES32 } from "./commitments.js";

// ── Core types ──────────────────────────────────────────────────────────────

/**
 * A single clause in the agreement. The clause key identifies the vocabulary
 * (registered in ClauseRegistry); data is the clause content per that clause.
 *
 * A section is one of two forms, and the merkle leaf is identical either way
 * (`computeSectionLeaf` needs only the data FINGERPRINT):
 *   - PLAINTEXT — `data` is present. The normal form; used for `public`
 *     sections (the free coordination commons) and by whoever authored a
 *     private one.
 *   - CONTENT-WITHHELD — `dataHash` is present instead of `data`. A `private`
 *     section's plaintext (the paid edge) stays off every public surface; a
 *     party carrying only the fingerprint can still build and verify the
 *     agreement root. Produce one with `withholdSectionContent`.
 * Exactly one of `data` / `dataHash` is set.
 */
export interface AgreementSection {
    clause: string;
    /** Clause version — paired with `clause` to form the on-chain id
     *  keccak256(abi.encode(clause, version)). Sourced from the clause spec. */
    version: number;
    /** The clause content, canonical-JSON-hashed into the merkle leaf. Absent
     *  for a content-withheld section (see `dataHash`). */
    data?: Record<string, unknown>;
    /** The section's data FINGERPRINT (`keccak256` of its canonical-JSON bytes),
     *  carried in place of `data` for a content-withheld `private` section. */
    dataHash?: Hex;
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
    /** The `compositionHash` of the registered assembly this agreement was
     *  instantiated from — the design-time identity, carried by the agreement
     *  FORMAT as one reserved leaf (`PROVENANCE_LEAF_KEY`), never by a clause.
     *  Checkout fills it from the template's own hash; a design cannot carry
     *  it, since the hash cannot appear inside the composition it hashes.
     *  Every process instantiates an assembly, so a signed agreement carries
     *  it; an agreement built without a design (a test fixture, a bare pair)
     *  leaves it absent and has no provenance leaf. */
    provenance?: Hex;
}

// ── The provenance leaf — the agreement format's own, not a clause ──────────

/** The label the reserved leaf's key is the hash of. Not a clause id: a
 *  registered clause's key is `keccak256(abi.encode(name, version))`, this
 *  is `keccak256(bytes(label))`, and the two preimage shapes never meet. */
export const PROVENANCE_LEAF_LABEL = "figaro-agreement-provenance";

/** The reserved leaf key, fixed by the agreement format and mirrored in
 *  `UsageCounter.provenanceLeaf()` and the guest: the one leaf whose content
 *  is reproduced from the assembly claimed rather than read from a spec. */
export const PROVENANCE_LEAF_KEY: Hex = keccak256(toHex(PROVENANCE_LEAF_LABEL));

/** The provenance leaf's committed bytes — canonical JSON of the one field,
 *  `{"compositionHash":"0x<64 lowercase hex>"}` — exactly what the counter
 *  reproduces from the claimed hash (`UsageCounter.recordAssemblyUsage`). */
export function provenanceSectionBytes(compositionHash: Hex): Hex {
    if (!/^0x[0-9a-fA-F]{64}$/.test(compositionHash)) {
        throw new Error(`provenance is not a 32-byte hex hash: ${compositionHash}`);
    }
    return toHex(new TextEncoder().encode(canonicalize({ compositionHash: compositionHash.toLowerCase() })));
}

/** The provenance leaf: the section-leaf convention over the reserved key. */
export function computeProvenanceLeaf(compositionHash: Hex): Hex {
    return keccak256(keccak256(concat([PROVENANCE_LEAF_KEY, provenanceContentRef(compositionHash)])));
}

/** The provenance leaf's fingerprint — `keccak256(provenanceSectionBytes(hash))`:
 *  the leaf's section hash, and the `contentRef` of an attestation that
 *  re-asserts it. A reader links a provenance attestation to its assembly by
 *  computing this for a registered composition hash and comparing. */
export function provenanceContentRef(compositionHash: Hex): Hex {
    return keccak256(provenanceSectionBytes(compositionHash));
}

/** The composition hash a provenance leaf's bytes name, or null when the bytes
 *  are not the format's own (`provenanceSectionBytes` of a 32-byte hash,
 *  byte for byte). The leaf has no clause spec; this is its one decoder. */
export function decodeProvenanceContent(content: Hex): Hex | null {
    if (!/^0x([0-9a-fA-F]{2})*$/.test(content)) return null;
    let text: string;
    try {
        const hex = content.slice(2);
        const bytes = new Uint8Array(hex.length / 2);
        for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
        text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
        return null;
    }
    const match = /^\{"compositionHash":"(0x[0-9a-f]{64})"\}$/.exec(text);
    if (!match) return null;
    const compositionHash = match[1] as Hex;
    return provenanceSectionBytes(compositionHash).toLowerCase() === content.toLowerCase() ? compositionHash : null;
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
 * Deterministic JSON serialization: sorted object keys at every depth,
 * preserved array order, no whitespace. THE one canonical-JSON convention —
 * agreement sections, clause specs (`ClauseRegistry.contentHash`), and
 * assembly compositions (`AssemblyRegistry.compositionHash`) all hash this
 * form, so any reader verifies a fetched document by re-canonicalizing the
 * parsed JSON. The serialized value must carry no bigints.
 */
export function canonicalize(value: unknown): string {
    return JSON.stringify(value, sortedReplacer);
}

/** keccak256 over the canonical serialization — the digest the registries
 *  anchor (`contentHash` for clause specs, `compositionHash` for assembly
 *  compositions). Publishers hash with it; readers verify with it after fetch. */
export function canonicalContentHash(value: unknown): Hex {
    return keccak256(toHex(canonicalize(value)));
}

// ── Merkle primitives ───────────────────────────────────────────────────────

/**
 * Return the on-chain `sectionData` bytes for an agreement section: the
 * canonical JSON of the section data. The chain merkle-binds the section HASH
 * and never sees these bytes, but they are what a party pins to IPFS (plaintext
 * for a public section, encrypted for a private one) and what
 * `sectionDataHash` fingerprints. No clause spec is consulted — specs live ONLY
 * in `ClauseRegistry` (→ IPFS), never bundled into the SDK. A never-seen clause
 * hashes the same way as any other. Throws for a content-withheld section: its
 * plaintext is not available, only its `dataHash`.
 */
export function getSectionDataBytes(section: AgreementSection): Hex {
    if (section.data === undefined) {
        throw new Error(
            `Section ${section.clause} is content-withheld (dataHash only) — its plaintext bytes are not available`,
        );
    }
    return toHex(new TextEncoder().encode(canonicalize(section.data)));
}

/**
 * The section's data FINGERPRINT — `keccak256` of its canonical-JSON bytes.
 * This is the ONLY thing the merkle leaf (and the on-chain `sectionHash`
 * argument to `recordClauseUsage` / the attest calls) needs, so a `private` section's
 * plaintext never has to be present to build or verify the agreement root. For
 * a content-withheld section the fingerprint is carried directly (`dataHash`);
 * otherwise it is computed from the plaintext.
 */
export function sectionDataHash(section: AgreementSection): Hex {
    if (section.dataHash !== undefined) {
        // A section carries EITHER plaintext `data` OR a content-withheld
        // `dataHash` — never both. The merkle leaf uses `dataHash` verbatim
        // while a review surface renders `data`, so a section carrying both
        // would sign one thing and show another. Refuse it at the hashing
        // locus, so no consumer (leaf, root, sign gate) can pass it.
        if (section.data !== undefined) {
            throw new Error(
                `Section ${section.clause} carries both plaintext data and a dataHash fingerprint — exactly one is allowed`,
            );
        }
        return section.dataHash;
    }
    return keccak256(getSectionDataBytes(section));
}

/**
 * Convert a section to its CONTENT-WITHHELD form: replace the plaintext `data`
 * with its fingerprint `dataHash`. The withheld section contributes the exact
 * same merkle leaf, so the agreement root is unchanged — a party can publish or
 * verify the agreement's structure while keeping a `private` section's plaintext
 * (the paid-edge data) off every public surface.
 */
export function withholdSectionContent(section: AgreementSection): AgreementSection {
    return { clause: section.clause, version: section.version, dataHash: sectionDataHash(section) };
}

/**
 * Compute one merkle leaf:
 * `keccak256(keccak256(clauseId || sectionDataHash))` — the inner hash binds the
 * section, the outer hash DOMAIN-SEPARATES leaves from internal nodes (OZ
 * double-hash convention: a leaf preimage is 32 bytes, an internal node's is 64,
 * so no internal node can ever be replayed as a leaf). Uses `sectionDataHash`,
 * so a plaintext and a content-withheld section for the same content produce the
 * identical leaf, and leaves computed off-chain match the coordinator's
 * reconstruction during inclusion-proof verification.
 */
export function computeSectionLeaf(section: AgreementSection): Hex {
    return keccak256(
        keccak256(
            concat([computeClauseKey(section.clause, section.version), sectionDataHash(section)]),
        ),
    );
}

function hashPair(a: Hex, b: Hex): Hex {
    return a.toLowerCase() < b.toLowerCase()
        ? keccak256(concat([a, b]))
        : keccak256(concat([b, a]));
}

function buildMerkleRoot(leaves: readonly Hex[]): Hex {
    if (leaves.length === 0) return ZERO_BYTES32;
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
 * section leaves. The agreement hash IS the merkle root — there is no separate
 * "root" object. Empty agreements return bytes32(0).
 */
export function computeAgreementHash(agreement: Agreement): Hex {
    return buildMerkleRoot(agreementLeaves(agreement));
}

/** Every leaf of the agreement, sorted as the tree is built: one per clause
 *  section, plus the reserved provenance leaf when the agreement names the
 *  design it instantiates. */
export function agreementLeaves(agreement: Agreement): Hex[] {
    const keys = agreement.sections.map((s) => s.clause);
    const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
    if (dupes.length > 0) {
        throw new Error(`Duplicate clause keys in agreement: ${[...new Set(dupes)].join(", ")}`);
    }
    const leaves = agreement.sections.map(computeSectionLeaf);
    if (agreement.provenance !== undefined) leaves.push(computeProvenanceLeaf(agreement.provenance));
    leaves.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    return leaves;
}

/**
 * Build an inclusion proof for a given section. Returns the leaf and the
 * sibling hashes walking the tree toward the root. Throws if the section is
 * absent from the agreement.
 *
 * @param clauseKey The RAW clause section name — `section.clause`, e.g.
 *        "figaro-commerce". This is NOT the `computeClauseKey(clause, version)`
 *        bytes32 hash that the attest calls (`attestAsSeller`/`attestAsBuyer`)
 *        take as their `clauseId`; passing that hash here throws
 *        "Section not found: 0x…".
 */
export function buildSectionInclusionProof(
    agreement: Agreement,
    clauseKey: string,
): { leaf: Hex; proof: Hex[] } {
    const section = agreement.sections.find((s) => s.clause === clauseKey);
    if (!section) {
        throw new Error(`Section not found: ${clauseKey}`);
    }
    return buildLeafInclusionProof(agreementLeaves(agreement), computeSectionLeaf(section));
}

/**
 * Build the inclusion proof of the reserved provenance leaf — what
 * `UsageCounter.recordAssemblyUsage` and the batch path's assembly claim
 * verify against the signed root. Throws if the agreement names no design.
 */
export function buildProvenanceInclusionProof(agreement: Agreement): { leaf: Hex; proof: Hex[] } {
    if (agreement.provenance === undefined) {
        throw new Error("Agreement names no assembly: no provenance leaf to prove");
    }
    return buildLeafInclusionProof(agreementLeaves(agreement), computeProvenanceLeaf(agreement.provenance));
}

/**
 * The attestation inputs of the provenance leaf, in the shape the attest
 * helpers take (`attestAsBuyer` / `executeAction`'s `inputs.attestation`,
 * beside the caller's `target`): the reserved key where a clause key goes,
 * the leaf's fingerprint as both `sectionHash` and `contentRef` (the
 * attestation re-asserts the committed leaf), its inclusion proof, and stage
 * 0. The buyer files it while the process is open, as every attestation is; the data corpus links the process
 * to its assembly through that attestation. Throws if the agreement names no
 * design.
 */
export function provenanceLeafAttestation(agreement: Agreement): {
    clauseId: Hex;
    stage: number;
    sectionHash: Hex;
    proof: Hex[];
    contentRef: Hex;
} {
    const { proof } = buildProvenanceInclusionProof(agreement);
    const sectionHash = provenanceContentRef(agreement.provenance as Hex);
    return { clauseId: PROVENANCE_LEAF_KEY, stage: 0, sectionHash, proof, contentRef: sectionHash };
}

function buildLeafInclusionProof(sortedLeaves: readonly Hex[], targetLeaf: Hex): { leaf: Hex; proof: Hex[] } {
    let idx = sortedLeaves.findIndex((l) => l.toLowerCase() === targetLeaf.toLowerCase());
    if (idx < 0) throw new Error("Internal error: leaf not in sorted tree");
    const proof: Hex[] = [];
    let layer: Hex[] = [...sortedLeaves];
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
