/**
 * anchored.ts — content the chain anchors, verified before it is used.
 *
 * Five kinds of document live off chain and are anchored on it by a digest:
 * a clause spec (its clause key, the digest of its pinned bytes), a
 * registered agreement (`AgreementRegistry`'s `agreementKey`), an assembly
 * assembly (`AssemblyRegistry`'s `compositionHash`), an agreement (the commitment's
 * `agreementHash`) and attestation content (the `contentRef` an
 * `Attestation` event carries). A gateway can serve any bytes, so a reader
 * recomputes the digest before reading the document.
 *
 * `Anchored<T>` is the type of a document whose digest has been recomputed
 * and matched. The functions below are the only way to make one: each takes
 * what was fetched and the digest the chain holds, and returns the document
 * as `Anchored<T>` when they agree, `null` when they do not. A consumer that
 * must only ever read registry content takes `Anchored<T>`, so a path that
 * fetches and forgets the check does not compile. `Anchored<T>` is a `T`
 * wherever a `T` is taken, so a draft the designer is still composing and a
 * document read from the network flow through the same code.
 *
 * The digest proves the registrant published these bytes; the registries are
 * permissionless, so it says nothing about whether the bytes are hostile.
 * Parse untrusted text with `strippingReviver` before passing it here.
 */

import { keccak256, type Hex } from "viem";
import { computeAgreementHash, type Agreement } from "./agreement.js";
import { strippingReviver } from "./safeJson.js";
import {
    agreementKeyOf,
    assertNotReservedKey,
    assemblyCompositionHash,
    type Assembly,
    type RegisteredAgreement,
    type HydratedAssembly,
} from "./assembly.js";
import { isBytes32Hex } from "./types.js";

declare const ANCHORED: unique symbol;

/** A document whose digest was recomputed and matched the chain's. Made only
 *  by the `anchor*` functions here, or derived from one by `deriveAnchored`.
 *
 *  It vouches for what the digest covers, and no more. `Anchored<RegisteredAgreement>`
 *  and `Anchored<Assembly>` cover their composition, never the
 *  editorial prose beside it. `Anchored<Agreement>`
 *  covers the `clauses` and the `provenance`: `computeAgreementHash` is the
 *  merkle root over the clause leaves and the reserved provenance leaf, so
 *  the top-level `buyer` and `seller` (and the format tag `version`) are NOT
 *  under the hash. Whoever served the document could
 *  have written any addresses there; a reader checks them against the
 *  commitment's own `buyer` and `seller` before relying on them. */
export type Anchored<T> = T & { readonly [ANCHORED]: true };

const sameHex = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

/** A clause spec, verified against its clause key: `keccak256` of the BYTES
 *  fetched equals the key. The key is the hash of exactly the bytes the
 *  registrant pinned, so the check runs on what was fetched — the exact text
 *  or bytes — and re-canonicalizes nothing; the same document pinned in
 *  another byte form is another key. The spec is parsed from the verified
 *  bytes (prototype-pollution keys stripped) and returned; its shape is the
 *  clause parser's. Bytes that are not JSON are not a spec. */
export function anchorClauseSpec(fetched: Uint8Array | string, clauseKey: Hex | string): Anchored<unknown> | null {
    const bytes = typeof fetched === "string" ? new TextEncoder().encode(fetched) : fetched;
    if (!sameHex(keccak256(bytes), clauseKey)) return null;
    try {
        return JSON.parse(new TextDecoder().decode(bytes), strippingReviver) as Anchored<unknown>;
    } catch {
        return null;
    }
}

/** A registered agreement's pinned document, verified against its
 *  `AgreementRegistry` key: `agreementKeyOf` of the parsed document (the root
 *  over its composed clauses — the editorial fields are outside the key) equals
 *  the key, exactly as `anchorAssembly` recomputes the composition root.
 *  Takes the fetched bytes or text (parsed with prototype-pollution keys
 *  stripped) or an already-parsed value. A failed parse, a document with no
 *  `clauses` object, a reserved key or a mismatch returns null — ABSENCE:
 *  the agreement, and so the assembly, is not offered, and nothing falls
 *  back to another copy. */
export function anchorRegisteredAgreement(
    raw: Uint8Array | string | unknown,
    agreementKey: Hex | string,
): Anchored<RegisteredAgreement> | null {
    let doc: unknown = raw;
    if (typeof raw === "string" || raw instanceof Uint8Array) {
        try {
            const text = typeof raw === "string" ? raw : new TextDecoder("utf-8", { fatal: true }).decode(raw);
            doc = JSON.parse(text, strippingReviver);
        } catch {
            return null;
        }
    }
    if (doc === null || typeof doc !== "object" || Array.isArray(doc)) return null;
    const clauses = (doc as { clauses?: unknown }).clauses;
    if (clauses === null || typeof clauses !== "object" || Array.isArray(clauses)) return null;
    if (!isBytes32Hex(agreementKey)) return null;
    try {
        assertNotReservedKey(agreementKey);
    } catch {
        return null;
    }
    let recomputed: Hex;
    try {
        recomputed = agreementKeyOf(doc as RegisteredAgreement);
    } catch {
        return null;
    }
    return sameHex(recomputed, agreementKey) ? (doc as Anchored<RegisteredAgreement>) : null;
}

/**
 * Hydrate an anchored assembly: read each DISTINCT agreement's registered
 * agreement through the caller's `readAgreement` (the SDK does no I/O — the
 * caller resolves the key to the registry binding's `contentURI`, whatever
 * its stake, and fetches it; null when it cannot) and verify every document
 * against its key (`anchorRegisteredAgreement`). Any agreement whose agreement
 * is unread or does not verify makes the whole assembly ABSENT (null): an
 * assembly is offered only when every agreement can be read.
 */
export async function hydrateAssembly(
    assembly: Anchored<Assembly> | Assembly,
    readAgreement: (agreementKey: Hex) => Promise<Uint8Array | string | unknown | null>,
): Promise<HydratedAssembly | null> {
    const agreements: Record<Hex, RegisteredAgreement> = {};
    for (const entry of assembly.agreements) {
        const key = entry.agreementKey.toLowerCase() as Hex;
        if (agreements[key]) continue;
        let raw: unknown;
        try {
            raw = await readAgreement(entry.agreementKey);
        } catch {
            return null;
        }
        if (raw === null || raw === undefined) return null;
        const composed = anchorRegisteredAgreement(raw, entry.agreementKey);
        if (composed === null) return null;
        agreements[key] = composed;
    }
    return { assembly, agreements };
}

/** An assembly, verified against `AssemblyRegistry`'s
 *  `compositionHash`: the merkle root over its agreement leaves and its
 *  assembly-terms leaf is the hash. A document with no `agreements` array
 *  carries no composition and is not a assembly; an agreement whose key is
 *  malformed or reserved does not hash. */
export function anchorAssembly(raw: unknown, compositionHash: Hex | string): Anchored<Assembly> | null {
    if (raw === null || typeof raw !== "object" || !Array.isArray((raw as { agreements?: unknown }).agreements)) return null;
    let recomputed: Hex;
    try {
        recomputed = assemblyCompositionHash(raw as Assembly);
    } catch {
        return null;
    }
    return sameHex(recomputed, compositionHash) ? (raw as Anchored<Assembly>) : null;
}

/** An agreement, verified against the commitment's `agreementHash`: the
 *  merkle root over its clause leaves and its provenance leaf is the hash. A
 *  document whose leaves do not hash (malformed, duplicated clause keys, a
 *  `provenance` that is not two 32-byte hex keys) is not the agreement. The
 *  top-level `buyer` and `seller` are outside the hash and pass unchecked
 *  here — check them against the commitment. */
export function anchorAgreement(raw: unknown, agreementHash: Hex | string): Anchored<Agreement> | null {
    if (raw === null || typeof raw !== "object" || !Array.isArray((raw as { sections?: unknown }).sections)) return null;
    const provenance = (raw as { provenance?: unknown }).provenance;
    if (provenance !== undefined) {
        if (provenance === null || typeof provenance !== "object") return null;
        const { agreementKey, compositionHash } = provenance as { agreementKey?: unknown; compositionHash?: unknown };
        if (!isBytes32Hex(agreementKey) || !isBytes32Hex(compositionHash)) return null;
    }
    let recomputed: Hex;
    try {
        recomputed = computeAgreementHash(raw as Agreement);
    } catch {
        return null;
    }
    return sameHex(recomputed, agreementHash) ? (raw as Anchored<Agreement>) : null;
}

/** Attestation content, verified against the `contentRef` its event carries:
 *  the bytes hash to it under keccak256. */
export function anchorAttestationContent(content: Hex, contentRef: Hex | string): Anchored<Hex> | null {
    return sameHex(keccak256(content), contentRef) ? (content as Anchored<Hex>) : null;
}

/** What is read out of an anchored document is anchored too: `derive` runs
 *  on the verified document and its result carries the same type. A parse
 *  that rejects the document throws, and the throw propagates. */
export function deriveAnchored<T, U>(source: Anchored<T>, derive: (document: T) => U): Anchored<U> {
    return derive(source) as Anchored<U>;
}
