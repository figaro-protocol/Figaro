/**
 * anchored.ts — content the chain anchors, verified before it is used.
 *
 * Five kinds of document live off chain and are anchored on it by a digest:
 * a clause spec (its clause key, the digest of its pinned bytes), a
 * registered agreement (`AgreementRegistry`'s `agreementKey`), an assembly
 * template (`AssemblyRegistry`'s `compositionHash`), an agreement (the commitment's
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
    templateCompositionHash,
    type AssemblyTemplate,
    type ComposedAgreement,
    type HydratedAssembly,
} from "./assembly.js";
import { isBytes32Hex } from "./types.js";

declare const ANCHORED: unique symbol;

/** A document whose digest was recomputed and matched the chain's. Made only
 *  by the `anchor*` functions here, or derived from one by `deriveAnchored`.
 *
 *  It vouches for what the digest covers, and no more. `Anchored<ComposedAgreement>`
 *  and `Anchored<AssemblyTemplate>` cover their composition, never the
 *  editorial prose beside it. `Anchored<Agreement>`
 *  covers the `sections` and the `provenance`: `computeAgreementHash` is the
 *  merkle root over the section leaves and the reserved provenance leaf, so
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
 *  the key, exactly as `anchorTemplate` recomputes the composition root.
 *  Takes the fetched bytes or text (parsed with prototype-pollution keys
 *  stripped) or an already-parsed value. A failed parse, a document with no
 *  `clauses` object, a reserved key or a mismatch returns null — ABSENCE:
 *  the order slot, and so the assembly, is not offered, and nothing falls
 *  back to another copy. */
export function anchorComposedAgreement(
    raw: Uint8Array | string | unknown,
    agreementKey: Hex | string,
): Anchored<ComposedAgreement> | null {
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
        recomputed = agreementKeyOf(doc as ComposedAgreement);
    } catch {
        return null;
    }
    return sameHex(recomputed, agreementKey) ? (doc as Anchored<ComposedAgreement>) : null;
}

/**
 * Hydrate an anchored template: read each DISTINCT order slot's registered
 * agreement through the caller's `readAgreement` (the SDK does no I/O — the
 * caller resolves the key to the registry binding's `contentURI`, whatever
 * its stake, and fetches it; null when it cannot) and verify every document
 * against its key (`anchorComposedAgreement`). Any order slot whose agreement
 * is unread or does not verify makes the whole assembly ABSENT (null): an
 * assembly is offered only when every order slot can be read.
 */
export async function hydrateAssembly(
    template: Anchored<AssemblyTemplate> | AssemblyTemplate,
    readAgreement: (agreementKey: Hex) => Promise<Uint8Array | string | unknown | null>,
): Promise<HydratedAssembly | null> {
    const agreements: Record<Hex, ComposedAgreement> = {};
    for (const slot of template.agreements) {
        const key = slot.agreementKey.toLowerCase() as Hex;
        if (agreements[key]) continue;
        let raw: unknown;
        try {
            raw = await readAgreement(slot.agreementKey);
        } catch {
            return null;
        }
        if (raw === null || raw === undefined) return null;
        const composed = anchorComposedAgreement(raw, slot.agreementKey);
        if (composed === null) return null;
        agreements[key] = composed;
    }
    return { template, agreements };
}

/** An assembly template, verified against `AssemblyRegistry`'s
 *  `compositionHash`: the merkle root over its order slot leaves and its
 *  assembly-terms leaf is the hash. A document with no `agreements` array
 *  carries no composition and is not a template; an order slot whose key is
 *  malformed or reserved does not hash. */
export function anchorTemplate(raw: unknown, compositionHash: Hex | string): Anchored<AssemblyTemplate> | null {
    if (raw === null || typeof raw !== "object" || !Array.isArray((raw as { agreements?: unknown }).agreements)) return null;
    let recomputed: Hex;
    try {
        recomputed = templateCompositionHash(raw as AssemblyTemplate);
    } catch {
        return null;
    }
    return sameHex(recomputed, compositionHash) ? (raw as Anchored<AssemblyTemplate>) : null;
}

/** An agreement, verified against the commitment's `agreementHash`: the
 *  merkle root over its section leaves and its provenance leaf is the hash. A
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
