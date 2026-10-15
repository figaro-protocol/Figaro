/**
 * anchored.ts — content the chain anchors, verified before it is used.
 *
 * Four kinds of document live off chain and are anchored on it by a digest:
 * a clause spec (its clause key, the digest of its pinned bytes), an assembly template
 * (`AssemblyRegistry`'s `compositionHash`), an agreement (the commitment's
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
import { templateCompositionHash, type AssemblyTemplate } from "./assembly.js";
import { isBytes32Hex } from "./types.js";

declare const ANCHORED: unique symbol;

/** A document whose digest was recomputed and matched the chain's. Made only
 *  by the `anchor*` functions here, or derived from one by `deriveAnchored`.
 *
 *  It vouches for what the digest covers, and no more. `Anchored<Agreement>`
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

/** An assembly template, verified against `AssemblyRegistry`'s
 *  `compositionHash`: its composition subset hashes to it. A document with no
 *  `agreements` array carries no composition and is not a template. */
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
 *  `provenance` that is not a 32-byte hex hash) is not the agreement. The
 *  top-level `buyer` and `seller` are outside the hash and pass unchecked
 *  here — check them against the commitment. */
export function anchorAgreement(raw: unknown, agreementHash: Hex | string): Anchored<Agreement> | null {
    if (raw === null || typeof raw !== "object" || !Array.isArray((raw as { sections?: unknown }).sections)) return null;
    const provenance = (raw as { provenance?: unknown }).provenance;
    if (provenance !== undefined && !isBytes32Hex(provenance)) return null;
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
