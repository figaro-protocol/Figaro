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
 * field in the set the content was encoded from (`attestationContentFields`,
 * the one selection the encoder and every reader use: `stages[stage]` where
 * the spec declares it, else the top-level fields) is public-disposition.
 * An unknown spec or any
 * `private` field withholds — a private value's plaintext never lands on
 * public IPFS; its holder proves the fingerprint match off-chain instead.
 * The agreement format's provenance leaf (`PROVENANCE_LEAF_KEY`) has no spec:
 * its bytes pin as-is when they are the format's own, and not at all otherwise.
 *
 * The private half: content whose encoded set is private is never pinned, so
 * its attester keeps the bytes (the blinding value is inside them) before
 * the attestation is sent (`keepPrivateWitnessContent`, called by the one
 * submitter every filing goes through, `useAttestationCoordinatorActions`). It is kept where a
 * party's device keeps its other raw evidence for a forum
 * (`deviceEvidence.ts`'s retained captures): localStorage through the one
 * storage seam, outliving the tab, one entry per witness under a key that
 * names its order, clause, stage and content reference. It is read back
 * only when the bytes hash to the reference (`readKeptWitnessContent`), and
 * its values are decoded from those checked bytes (`readKeptWitnessValues`).
 * The counterparty receives a copy only by asking for it, sealed to a key
 * that lives in its own tab (`lib/handoff/privateFilings.ts`); that copy is
 * kept in the same entry, marked `received` (`keepReceivedWitnessContent`).
 * The pages of this browser and the evidence file read it
 * (`resolveHeldWitnessContent`, `readHeldWitness`); no public reader does.
 * The copy belongs to the browser profile, not to a wallet: whoever opens
 * this profile reads it, with any wallet connected or none. A party that
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
import { decodeContentFromSpec } from "@figaro-protocol/sdk/clauses";
import { witnessContentCid, witnessContentCidBase32 } from "@figaro-protocol/sdk/derive";
import {
    DEFAULT_IPFS_SERVICE,
    fetchCappedBinary,
    resolveContentUri,
    type CappedFetchOptions,
    type IpfsService,
} from "@/lib/shared/ipfsService";
import { attestationContentFields, getClauseSpec } from "@/lib/shared/clauseSpecSource";
import { hexEqual, isBytes32Hex, isEmptyHex } from "@/lib/shared/evm";
import { readJsonStorage, removeStorage, writeJsonStorage } from "@/lib/shared/storage";

export interface PublishWitnessContentParams {
    /** The clause attested — its clause key, the hash of the canonical spec
     *  without `block`, as the Attestation event carries it. */
    clauseId: Hex;
    /** The stage the attestation is made at. The set the content was
     *  encoded from is read from it and the spec by the same selection the
     *  encoder applied (`attestationContentFields`). */
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
    const fields = attestationContentFields(params.clauseId, stage) ?? [];
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

/** The prefix of every kept witness's storage key. Each witness is an entry
 *  of its own, so a write touches only its own entry, two tabs keeping at
 *  once never lose each other's, and an unreadable entry harms only itself. */
export const KEPT_WITNESS_STORAGE_KEY = "figaro-kept-witness-content";

/** Where a witness sits on the chain: what an Attestation event carries. */
export interface WitnessPlace {
    orderHash: Hex | string;
    clauseId: Hex | string;
    stage: number;
    contentRef: Hex | string;
}

/** The storage key of one kept witness: the prefix, then its place. Every
 *  reader looks an entry up by a place an Attestation event carries, so an
 *  entry left by a rejected or reverted transaction is never shown:
 *  no event names its place. */
function keptKey(place: WitnessPlace): string {
    return [KEPT_WITNESS_STORAGE_KEY, place.orderHash, place.clauseId, place.stage, place.contentRef].map((p) => String(p).toLowerCase()).join(":");
}

/** Whether the set a witness's content is encoded from holds a private
 *  field (`attestationContentFields`): true or false once the clause's spec
 *  is read, null while it is unread (not loaded, or its read failed). The
 *  provenance leaf's bytes are the format's own and public. A reader counts
 *  only true. */
export function encodedSetPrivacy(clauseId: Hex | string, stage: number): boolean | null {
    if (hexEqual(clauseId, PROVENANCE_LEAF_KEY)) return false;
    const fields = attestationContentFields(String(clauseId), stage);
    return fields === null ? null : fields.some((f) => f.disposition === "private");
}

/** The keeper's reading of `encodedSetPrivacy`: an unread spec counts as
 *  private, since its content is never published (`publishWitnessContent`),
 *  so it is kept. */
function encodedSetIsPrivate(clauseId: Hex | string, stage: number): boolean {
    return encodedSetPrivacy(clauseId, stage) ?? true;
}

/**
 * Keep the attester's own private witness content, before the attestation is
 * sent: the bytes are never pinned, so without this copy no one, the attester
 * included, could open the attestation afterwards. Only the bytes are kept:
 * the values, the blinding value included, are decoded from them. Returns
 * `"public"` when the encoded set holds no private field (its bytes publish
 * at their reference, so nothing is kept), `"kept"` once stored, and
 * `"refused"` when the browser refuses the write: the caller then sends
 * nothing.
 */
export function keepPrivateWitnessContent(params: {
    orderHash: Hex | string;
    clauseId: Hex | string;
    stage: number;
    content: Hex;
}): "public" | "kept" | "refused" {
    if (!encodedSetIsPrivate(params.clauseId, params.stage)) return "public";
    const place = { ...params, contentRef: keccak256(params.content) };
    return writeJsonStorage(keptKey(place), { content: params.content }) ? "kept" : "refused";
}

/** Remove the kept copy of one witness. The submitter calls it where the
 *  attestation the copy was kept for never got a transaction hash, so no
 *  event can ever name its place. */
export function forgetKeptWitnessContent(place: WitnessPlace): void {
    removeStorage(keptKey(place));
}

/**
 * Keep a copy of the counterparty's private witness content, received sealed
 * over the private-filings ceremony (`lib/handoff/privateFilings.ts`), in
 * the same per-witness entry its own filings use, so every reader of this
 * browser's copies reads it. The entry carries one more field,
 * `received: true`: a forum reading the evidence file is told that this
 * copy came from the attester and was not filed from this browser. The
 * caller has checked that an Attestation event by the counterparty names
 * this place. Returns `"kept"` once stored, or when this browser already
 * holds a copy (which is never overwritten), and `"refused"` when the bytes
 * do not hash to the reference or the browser refuses the write.
 */
export function keepReceivedWitnessContent(place: WitnessPlace & { content: Hex }): "kept" | "refused" {
    if (!isBytes32Hex(place.contentRef) || !anchorAttestationContent(place.content, place.contentRef)) return "refused";
    if (readKeptEntry(place)) return "kept";
    return writeJsonStorage(keptKey(place), { content: place.content, received: true }) ? "kept" : "refused";
}

/** One kept entry, its bytes checked against the reference; null where this
 *  browser keeps none, or where the entry does not parse or its bytes do not
 *  hash to the reference. `received` is true only for a copy received from
 *  the counterparty (`keepReceivedWitnessContent`). */
function readKeptEntry(place: WitnessPlace): { content: Anchored<Hex>; received: boolean } | null {
    if (!isBytes32Hex(place.contentRef)) return null;
    const entry = readJsonStorage<unknown>(keptKey(place), null);
    if (!entry || typeof entry !== "object") return null;
    const { content, received } = entry as { content?: unknown; received?: unknown };
    if (typeof content !== "string" || !/^0x([0-9a-fA-F]{2})*$/.test(content)) return null;
    const anchored = anchorAttestationContent(content as Hex, place.contentRef);
    return anchored ? { content: anchored, received: received === true } : null;
}

/** The kept bytes of a witness, checked against its content reference
 *  (`anchorAttestationContent`); null where this browser keeps none, or
 *  where the entry does not parse or its bytes do not hash to the
 *  reference. Only the bytes and the `received` mark are read; any other
 *  field an entry carries is never read. */
export function readKeptWitnessContent(place: WitnessPlace): Anchored<Hex> | null {
    return readKeptEntry(place)?.content ?? null;
}

/** The values of a kept witness, the blinding value included, decoded from
 *  its checked bytes through the set they were encoded from (`stages[stage]`
 *  where declared, else the top-level fields: `attestationContentFields`); null unless the bytes check against the
 *  reference and decode under the clause's spec. */
export function readKeptWitnessValues(place: WitnessPlace): Record<string, unknown> | null {
    const content = readKeptWitnessContent(place);
    const spec = content ? getClauseSpec(String(place.clauseId)) : undefined;
    if (!content || !spec) return null;
    try {
        return decodeContentFromSpec(spec, content, { stage: place.stage });
    } catch {
        return null;
    }
}

/** The content this browser holds for one attestation, checked against its
 *  reference, with its decoded values and whether the copy was received from
 *  the counterparty (`received`) or kept by its attester: the reader the
 *  evidence file and the audit page share (`HeldWitnessReader`), so the two
 *  name the same pieces missing. Null where this browser keeps none. */
export function readHeldWitness(place: WitnessPlace): { content: Anchored<Hex>; values: Record<string, unknown> | null; received: boolean } | null {
    const entry = readKeptEntry(place);
    return entry ? { content: entry.content, values: readKeptWitnessValues(place), received: entry.received } : null;
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
