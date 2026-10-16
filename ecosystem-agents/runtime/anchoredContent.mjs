/**
 * anchoredContent — registry-anchored documents, verified before use.
 *
 * A clause spec, a registered agreement and an assembly template are fetched
 * from IPFS through whatever gateway the host configured, and the registries
 * anchor each one on chain: `ClauseRegistry` keys a clause by the hash of its
 * pinned spec bytes (the clause key), `AgreementRegistry` keys a registered
 * agreement by `agreementKeyOf` of its document, `AssemblyRegistry` keys the
 * template by its composition hash. A gateway can serve any bytes, so the
 * bytes are checked against the anchor before anything reads them, by the
 * SDK's `anchorClauseSpec`, `anchorComposedAgreement` and `anchorTemplate` —
 * the functions the frontend verifies with. A
 * document that does not hash to its anchor reads as absence, never as the
 * registry's content: the verification is what makes an untrusted gateway an
 * acceptable transport (`witnessContent.mjs` holds attestation content to the
 * same rule).
 *
 * The parse strips `__proto__`, `constructor` and `prototype` keys: the
 * anchor proves the registrant published these bytes, and the registries are
 * permissionless, so it says nothing about whether the bytes are hostile.
 */

import { keccak256 } from "viem";
import {
    agreementKeyOf,
    anchorClauseSpec,
    anchorComposedAgreement,
    anchorTemplate,
    strippingReviver,
    templateCompositionHash,
} from "@figaro-protocol/sdk";
import { cidOf, fetchIpfsBytes, fetchIpfsText } from "./ipfsRead.mjs";

/** Parse untrusted JSON text; `null` when it is not JSON. */
function parseUntrusted(text) {
    try {
        return JSON.parse(text, strippingReviver);
    } catch {
        return null;
    }
}

/**
 * A live clause's spec, verified against its clause key: keccak256 of the
 * BYTES fetched must equal the key (nothing is re-canonicalized — the key is
 * the hash of exactly the bytes the registrant pinned).
 *
 * @param clause  a `RegisteredClause` from the discovery graph
 *                (`contentURI`, `clauseKey`)
 * @returns `{ raw, text }` (the parsed spec and its text), or `{ absent }`
 *          naming why: not served, not the keyed bytes, or not JSON.
 *          Throws only when every gateway failed to answer.
 */
export async function fetchAnchoredClauseSpec(clause, options = {}) {
    const bytes = await fetchIpfsBytes(cidOf(clause.contentURI), options);
    if (bytes === null) return { absent: "not served" };
    const digest = keccak256(bytes);
    if (digest.toLowerCase() !== clause.clauseKey.toLowerCase()) {
        return { absent: `bytes hash to ${digest}, not the clause key ${clause.clauseKey}` };
    }
    const raw = anchorClauseSpec(bytes, clause.clauseKey);
    if (raw === null) return { absent: "not JSON" };
    return { raw, text: new TextDecoder().decode(bytes) };
}

/**
 * A registered agreement's document, verified against its agreement key:
 * `agreementKeyOf` of the parsed document (the root over its composed
 * clauses — the editorial fields are outside the key) must equal the key. Read from the
 * binding whatever its stake: a binding is never cleared, so an assembly
 * composed from a withdrawn agreement still hydrates.
 *
 * @param agreement  a `RegisteredAgreement` from the discovery graph
 *                   (`contentURI`, `agreementKey`)
 * @returns `{ composed, text }`, or `{ absent }` naming why. Throws only when
 *          every gateway failed to answer.
 */
export async function fetchAnchoredComposedAgreement(agreement, options = {}) {
    const text = await fetchIpfsText(cidOf(agreement.contentURI), options);
    if (text === null) return { absent: "not served" };
    const parsed = parseUntrusted(text);
    if (parsed === null || typeof parsed !== "object" || parsed.clauses === null || typeof parsed.clauses !== "object") {
        return { absent: "not a registered agreement" };
    }
    const composed = anchorComposedAgreement(parsed, agreement.agreementKey);
    if (composed === null) {
        let recomputed;
        try {
            recomputed = agreementKeyOf(parsed);
        } catch {
            recomputed = "no key";
        }
        return { absent: `keys to ${recomputed}, the registry anchors ${agreement.agreementKey}` };
    }
    return { composed, text };
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
    if (anchorTemplate(template, assembly.compositionHash) === null) {
        let recomputed;
        try {
            recomputed = templateCompositionHash(template);
        } catch {
            recomputed = "no root";
        }
        return { absent: `hashes to ${recomputed}, the registry anchors ${assembly.compositionHash}` };
    }
    return { template, text };
}
