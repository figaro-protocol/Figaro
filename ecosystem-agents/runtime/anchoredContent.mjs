/**
 * anchoredContent — registry-anchored documents, verified before use.
 *
 * A clause spec and an assembly template are fetched from IPFS through
 * whatever gateway the host configured, and the registries anchor each one
 * on chain: `ClauseRegistry` stores the spec's content hash, `AssemblyRegistry`
 * keys the template by its composition hash. A gateway can serve any bytes,
 * so the bytes are recomputed against the anchor before anything reads them,
 * with the SDK's own functions — the same check the frontend makes. A
 * document that does not hash to its anchor reads as absence, never as the
 * registry's content: the verification is what makes an untrusted gateway an
 * acceptable transport (`witnessContent.mjs` holds attestation content to the
 * same rule).
 *
 * The parse strips `__proto__`, `constructor` and `prototype` keys: the
 * anchor proves the registrant published these bytes, and the registries are
 * permissionless, so it says nothing about whether the bytes are hostile.
 */

import { canonicalContentHash, strippingReviver, templateCompositionHash } from "@figaro-protocol/sdk";
import { cidOf, fetchIpfsText } from "./ipfsRead.mjs";

const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

/** Parse untrusted JSON text; `null` when it is not JSON. */
function parseUntrusted(text) {
    try {
        return JSON.parse(text, strippingReviver);
    } catch {
        return null;
    }
}

/**
 * A live clause's spec, verified against the registry's content hash.
 *
 * @param clause  a `RegisteredClause` from the discovery graph
 *                (`contentURI`, `contentHash`)
 * @returns `{ raw, text }` (the parsed spec and its text), or `{ absent }`
 *          naming why: not served, not JSON, or not the anchored document.
 *          Throws only when every gateway failed to answer.
 */
export async function fetchAnchoredClauseSpec(clause, options = {}) {
    const text = await fetchIpfsText(cidOf(clause.contentURI), options);
    if (text === null) return { absent: "not served" };
    const raw = parseUntrusted(text);
    if (raw === null) return { absent: "not JSON" };
    const recomputed = canonicalContentHash(raw);
    if (!same(recomputed, clause.contentHash)) {
        return { absent: `hashes to ${recomputed}, the registry anchors ${clause.contentHash}` };
    }
    return { raw, text };
}

/**
 * A live assembly's template, verified against its composition hash.
 *
 * @param assembly  a `RegisteredAssembly` from the discovery graph
 *                  (`contentURI`, `compositionHash`)
 * @returns `{ template, text }`, or `{ absent }` naming why. Throws only when
 *          every gateway failed to answer.
 */
export async function fetchAnchoredTemplate(assembly, options = {}) {
    const text = await fetchIpfsText(cidOf(assembly.contentURI), options);
    if (text === null) return { absent: "not served" };
    const template = parseUntrusted(text);
    if (template === null || typeof template !== "object" || !Array.isArray(template.agreements)) {
        return { absent: "not an assembly template" };
    }
    const recomputed = templateCompositionHash(template);
    if (!same(recomputed, assembly.compositionHash)) {
        return { absent: `hashes to ${recomputed}, the registry anchors ${assembly.compositionHash}` };
    }
    return { template, text };
}
