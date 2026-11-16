/**
 * witnessContent — publication, lookup, and erasure of an attestation's
 * content preimage, keyed by the fingerprint the chain carries.
 *
 * The coordinator keeps only `contentRef = keccak256(content)` (WS2: calldata
 * never holds a preimage). This module makes the PUBLIC half of that seam
 * readable again: the attester pins the exact ABI content bytes to IPFS as a
 * RAW block multihashed with keccak-256 — so the CID's digest IS the on-chain
 * `contentRef`, and ANY reader derives the content address from the event
 * alone. No registry, no pointer, no calldata: the fingerprint is the lookup.
 *
 * Disposition gate (FAIL-CLOSED, the committed-pin rule applied to runtime
 * content): a payload publishes only when the clause spec is loaded AND every
 * field in the encoded set (`contentFieldsFor` — the same selection the
 * encoder/decoder use) is public-disposition. An unknown spec or any
 * `private` field withholds — a private value's plaintext never lands on
 * public IPFS; its holder proves the fingerprint match off-chain instead.
 * The agreement format's provenance leaf (`PROVENANCE_LEAF_KEY`) has no spec:
 * its bytes pin as-is when they are the format's own, and not at all otherwise.
 *
 * The private half: content whose encoded set is private is never pinned, so
 * its attester keeps it, bytes and values (the blinding value included),
 * before the attestation is sent (`keepPrivateWitnessContent`). It is kept
 * where a party's device keeps its other raw evidence for a forum
 * (`deviceEvidence.ts`'s retained captures): localStorage through the one
 * storage seam, outliving the tab, keyed by order, clause, stage and content
 * reference, and read back only when the bytes hash to the reference
 * (`readKeptWitnessContent`). The attester's own pages and the evidence file
 * read it (`resolveHeldWitnessContent`); no public reader does. A party that
 * clears its browser's storage loses it: the content is its own to keep and
 * export.
 *
 * Erasure mirrors `profileErasure`/`unpinAgreement` (wallet pins → wallet
 * erases): best-effort unpin of the derived CID, idempotent, never throwing —
 * content addressing means only THIS node's copy is erased, and a resolved-
 * empty lookup reads as absence, exactly like a withheld or never-published
 * payload.
 */
import { bytesToHex, hexToBytes, keccak256, type Hex } from "viem";
import { PROVENANCE_LEAF_KEY, anchorAttestationContent, decodeProvenanceContent, type Anchored } from "@figaro-protocol/sdk";
import { contentFieldsFor } from "@figaro-protocol/sdk/clauses";
import { witnessContentCid, witnessContentCidBase32 } from "@figaro-protocol/sdk/derive";
import {
    DEFAULT_IPFS_SERVICE,
    fetchCappedBinary,
    resolveContentUri,
    type CappedFetchOptions,
    type IpfsService,
} from "@/lib/shared/ipfsService";
import { getClauseSpec } from "@/lib/shared/clauseSpecSource";
import { hexEqual, isBytes32Hex, isEmptyHex } from "@/lib/shared/evm";
import { readJsonStorage, writeJsonStorage } from "@/lib/shared/storage";

export interface PublishWitnessContentParams {
    /** The clause attested — its clause key, the hash of the canonical spec
     *  without `block`, as the Attestation event carries it. */
    clauseId: Hex;
    /** Lifecycle stage the content was encoded at — drives the same
     *  `contentFieldsFor` selection the encoder applied. */
    stage: number;
    /** The canonical ABI content bytes — the `contentRef` preimage. */
    content: Hex;
    ipfs?: Pick<IpfsService, "pinKeccakRawBlock">;
}

/**
 * Publish a runtime attestation's content preimage to public IPFS, gated by
 * the clause spec's field dispositions. Best-effort by design: an attestation
 * that landed on-chain must never fail on a node hiccup — failures are logged
 * loudly and swallowed; a withheld payload is a decision, not an error.
 */
export async function publishWitnessContent(params: PublishWitnessContentParams): Promise<void> {
    const { stage, content } = params;
    if (isEmptyHex(content)) return; // nothing to learn from empty content
    if (hexEqual(params.clauseId, PROVENANCE_LEAF_KEY)) {
        // The agreement FORMAT's provenance leaf has no spec: its bytes are
        // the format's own (`{"agreementHash":…,"assemblyHash":…}`,
        // reproducible from a registered — public — agreement hash and
        // assembly root), so they pin as-is when
        // `decodeProvenanceContent` reads them, and not at all otherwise.
        if (decodeProvenanceContent(content) === null) {
            console.warn(`[witnessContent] content under the provenance leaf is not the format's bytes — withheld`);
            return;
        }
        await pinContent(content, params.ipfs, "the provenance leaf", stage);
        return;
    }
    // The key names the exact spec attested — resolve that spec.
    const spec = getClauseSpec(params.clauseId);
    const clauseId = spec ? `${spec.clauseId} v${spec.version}` : params.clauseId;
    if (!spec) {
        // FAIL-CLOSED: an unknown spec is withheld (the committed-pin rule).
        // Loud, because at attest time the spec was just used to encode — a
        // cold spec here means the values silently vanish from every audit.
        console.warn(`[witnessContent] no spec for ${clauseId} — content withheld (fail-closed)`);
        return;
    }
    const fields = contentFieldsFor(spec, { stage });
    if (fields.some((f) => f.disposition === "private")) return; // by design, silently
    await pinContent(content, params.ipfs, clauseId, stage);
}

/** Pin the bytes as a keccak raw block at their fingerprint. Best-effort:
 *  failures are logged loudly and swallowed. */
async function pinContent(
    content: Hex,
    ipfsOverride: Pick<IpfsService, "pinKeccakRawBlock"> | undefined,
    label: string,
    stage: number,
): Promise<void> {
    try {
        const ipfs = ipfsOverride ?? DEFAULT_IPFS_SERVICE;
        const contentRef = keccak256(content);
        const cid = await ipfs.pinKeccakRawBlock(hexToBytes(content));
        if (cid !== witnessContentCidBase32(contentRef) && cid !== witnessContentCid(contentRef)) {
            // The node pinned under some OTHER multihash — readers deriving the
            // address from the fingerprint will resolve absence. Loud.
            console.warn(`[witnessContent] pinned CID ${cid} does not match fingerprint ${contentRef} — readers will not resolve this content`);
        }
    } catch (err) {
        console.warn(`[witnessContent] publish for ${label} stage ${stage} failed (fingerprint stays verifiable):`, err);
    }
}

/**
 * Resolve a `contentRef` fingerprint to its published content bytes — the
 * reader half. Derives the keccak-CID, fetches through the configured gateway,
 * and VERIFIES the bytes hash back to the fingerprint before trusting them (a
 * tampered or mismatched block is rejected). Returns null on absence — a
 * withheld, private, erased, or never-published payload all read the same way.
 */
export async function fetchWitnessContent(
    contentRef: Hex | string,
    options: CappedFetchOptions = {},
): Promise<Anchored<Hex> | null> {
    if (!isBytes32Hex(contentRef)) return null;
    const url = resolveContentUri(`ipfs://${witnessContentCid(contentRef as Hex)}`);
    if (!url) return null;
    try {
        const res = await fetchCappedBinary(url, options);
        if (!res.ok || !res.bytes) return null;
        return anchorAttestationContent(bytesToHex(res.bytes), contentRef);
    } catch {
        return null;
    }
}

/**
 * Erase this node's copy of a published witness payload: unpin of the CID
 * derived from the fingerprint. Idempotent — unpinning an absent pin is
 * absence; a refused unpin rejects with the service's answer, so the erase
 * control shows it (the same erasure symmetry as the member profile and
 * committed-agreement pins).
 */
export async function unpinWitnessContent(
    contentRef: Hex | string,
    ipfs: Pick<IpfsService, "unpin"> = DEFAULT_IPFS_SERVICE,
): Promise<void> {
    if (!isBytes32Hex(contentRef)) return;
    await ipfs.unpin(witnessContentCid(contentRef as Hex));
}

// ── The private half: the attester keeps its own private witness content ──

export const KEPT_WITNESS_STORAGE_KEY = "figaro-kept-witness-content";

/** One kept private witness: its place on the chain, the encoded bytes
 *  whose keccak256 is the content reference, and the values encoded, the
 *  blinding value included. */
interface KeptWitness {
    orderHash: string;
    clauseId: string;
    stage: number;
    contentRef: string;
    content: string;
    values?: Record<string, unknown>;
}

/** Where a witness sits on the chain: what an Attestation event carries. */
export interface WitnessPlace {
    orderHash: Hex | string;
    clauseId: Hex | string;
    stage: number;
    contentRef: Hex | string;
}

function keptKey(place: WitnessPlace): string {
    return [place.orderHash, place.clauseId, place.stage, place.contentRef].map((p) => String(p).toLowerCase()).join(":");
}

function readKept(): Record<string, KeptWitness> {
    const parsed = readJsonStorage<unknown>(KEPT_WITNESS_STORAGE_KEY, {});
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, KeptWitness>) : {};
}

/** Whether the set a witness's content is encoded from holds a private
 *  field, read from the spec the clause key names. An unknown spec counts as
 *  private: its content is never published (`publishWitnessContent`), so it
 *  is kept. The provenance leaf's bytes are the format's own and public. */
function encodedSetIsPrivate(clauseId: Hex | string, stage: number): boolean {
    if (hexEqual(clauseId, PROVENANCE_LEAF_KEY)) return false;
    const spec = getClauseSpec(clauseId as Hex);
    if (!spec) return true;
    return contentFieldsFor(spec, { stage }).some((f) => f.disposition === "private");
}

/**
 * Keep the attester's own private witness content, before the attestation is
 * sent: the bytes are never pinned, so without this copy no one, the attester
 * included, could open the attestation afterwards. Returns `"public"` when
 * the encoded set holds no private field (its bytes publish at their
 * reference, so nothing is kept), `"kept"` once stored, and `"refused"` when
 * the browser refuses the write: the caller then sends nothing.
 */
export function keepPrivateWitnessContent(params: {
    orderHash: Hex | string;
    clauseId: Hex | string;
    stage: number;
    content: Hex;
    values?: Record<string, unknown>;
}): "public" | "kept" | "refused" {
    if (!encodedSetIsPrivate(params.clauseId, params.stage)) return "public";
    const contentRef = keccak256(params.content);
    const entry: KeptWitness = {
        orderHash: String(params.orderHash),
        clauseId: String(params.clauseId),
        stage: params.stage,
        contentRef,
        content: params.content,
        ...(params.values ? { values: params.values } : {}),
    };
    const store = readKept();
    store[keptKey(entry)] = entry;
    return writeJsonStorage(KEPT_WITNESS_STORAGE_KEY, store) ? "kept" : "refused";
}

/** The kept bytes of a witness, checked against its content reference
 *  (`anchorAttestationContent`); null where this browser keeps none, or
 *  where the kept bytes do not hash to the reference. */
export function readKeptWitnessContent(place: WitnessPlace): Anchored<Hex> | null {
    if (!isBytes32Hex(place.contentRef)) return null;
    const entry = readKept()[keptKey(place)];
    if (!entry || typeof entry.content !== "string" || !/^0x([0-9a-fA-F]{2})*$/.test(entry.content)) return null;
    return anchorAttestationContent(entry.content as Hex, place.contentRef);
}

/** The kept values of a witness, blinding value included; null unless its
 *  kept bytes check against the reference. */
export function readKeptWitnessValues(place: WitnessPlace): Record<string, unknown> | null {
    if (readKeptWitnessContent(place) === null) return null;
    return readKept()[keptKey(place)]?.values ?? null;
}

/**
 * A witness's bytes for its holder's own pages: the copy this browser kept,
 * else the public pin (`fetchWitnessContent`). Both are checked against the
 * reference. Null where neither resolves; the page then shows nothing in
 * their place.
 */
export async function resolveHeldWitnessContent(place: WitnessPlace, options: CappedFetchOptions = {}): Promise<Anchored<Hex> | null> {
    return readKeptWitnessContent(place) ?? fetchWitnessContent(place.contentRef, options);
}
