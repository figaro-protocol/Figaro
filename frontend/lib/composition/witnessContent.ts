/**
 * witnessContent — publication, lookup, and erasure of an attestation's
 * content preimage, keyed by the fingerprint the chain carries.
 *
 * The coordinator records only `contentRef = keccak256(content)` (WS2: calldata
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
 *
 * Erasure mirrors `profileErasure`/`unpinAgreement` (author pins → author
 * erases): best-effort unpin of the derived CID, idempotent, never throwing —
 * content addressing means only THIS node's copy is erased, and a resolved-
 * empty lookup reads as absence, exactly like a withheld or never-published
 * payload.
 */
import { bytesToHex, hexToBytes, keccak256, type Hex } from "viem";
import { contentFieldsFor } from "@figaro/sdk/clauses";
import {
    DEFAULT_IPFS_SERVICE,
    fetchCappedBinary,
    resolveContentUri,
    type CappedFetchOptions,
    type IpfsService,
} from "@/lib/shared/ipfsService";
import { clauseIdForHash, getClauseSpec } from "@/lib/shared/clauseSpecSource";
import { hexEqual, isEmptyHex } from "@/lib/shared/evm";

// CIDv1 prefix for [raw codec 0x55, keccak-256 multihash 0x1b, length 32],
// multibase base16 ("f"). Appending the fingerprint's hex yields the full CID.
const KECCAK_RAW_CID_PREFIX = "f01551b20";

/** The content address a `contentRef` fingerprint resolves to — derivable by
 *  any reader from the Attestation event alone. */
function witnessContentCid(contentRef: Hex): string {
    return KECCAK_RAW_CID_PREFIX + contentRef.slice(2).toLowerCase();
}

// Kubo reports block/put CIDs in multibase base32 lowercase; encode our
// expected CID bytes the same way so the pin can be verified by comparison.
const BASE32_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";

function base32Lower(bytes: Uint8Array): string {
    let bits = 0;
    let value = 0;
    let out = "";
    for (const byte of bytes) {
        value = (value << 8) | byte;
        bits += 8;
        while (bits >= 5) {
            out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }
    if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
    return out;
}

/** The base32 form of the same CID (`bafkrwi…`) — what Kubo's block/put
 *  reports, compared verbatim to detect a node that ignored the multihash. */
function witnessContentCidBase32(contentRef: Hex): string {
    return "b" + base32Lower(hexToBytes(`0x${KECCAK_RAW_CID_PREFIX.slice(1)}${contentRef.slice(2)}` as Hex));
}

export interface PublishWitnessContentParams {
    /** The clause attested — the event's clauseId HASH or the readable id. */
    clauseId: Hex | string;
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
    const clauseId = clauseIdForHash(params.clauseId) ?? params.clauseId;
    const spec = getClauseSpec(clauseId);
    if (!spec) {
        // FAIL-CLOSED: an unknown spec is withheld (the committed-pin rule).
        // Loud, because at attest time the spec was just used to encode — a
        // cold spec here means the values silently vanish from every audit.
        console.warn(`[witnessContent] no spec for ${clauseId} — content withheld (fail-closed)`);
        return;
    }
    const fields = contentFieldsFor(spec, { stage });
    if (fields.some((f) => f.disposition === "private")) return; // by design, silently
    try {
        const ipfs = params.ipfs ?? DEFAULT_IPFS_SERVICE;
        const contentRef = keccak256(content);
        const cid = await ipfs.pinKeccakRawBlock(hexToBytes(content));
        if (cid !== witnessContentCidBase32(contentRef) && cid !== witnessContentCid(contentRef)) {
            // The node pinned under some OTHER multihash — readers deriving the
            // address from the fingerprint will resolve absence. Loud.
            console.warn(`[witnessContent] pinned CID ${cid} does not match fingerprint ${contentRef} — readers will not resolve this content`);
        }
    } catch (err) {
        console.warn(`[witnessContent] publish for ${clauseId} stage ${stage} failed (fingerprint stays verifiable):`, err);
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
): Promise<Hex | null> {
    if (!/^0x[0-9a-fA-F]{64}$/.test(contentRef)) return null;
    const url = resolveContentUri(`ipfs://${witnessContentCid(contentRef as Hex)}`);
    if (!url) return null;
    try {
        const res = await fetchCappedBinary(url, options);
        if (!res.ok || !res.bytes) return null;
        const content = bytesToHex(res.bytes);
        if (!hexEqual(keccak256(content), contentRef)) return null;
        return content;
    } catch {
        return null;
    }
}

/**
 * Erase this node's copy of a published witness payload: best-effort unpin of
 * the CID derived from the fingerprint. Idempotent — unpinning an absent pin
 * is absence; failures are logged and swallowed (the same erasure symmetry as
 * the member profile and committed-agreement pins).
 */
export async function unpinWitnessContent(
    contentRef: Hex | string,
    ipfs: Pick<IpfsService, "unpin"> = DEFAULT_IPFS_SERVICE,
): Promise<void> {
    if (!/^0x[0-9a-fA-F]{64}$/.test(contentRef)) return;
    try {
        await ipfs.unpin(witnessContentCid(contentRef as Hex));
    } catch (err) {
        console.warn(`[witnessContent] unpin for ${contentRef} failed (content stays pinned):`, err);
    }
}
