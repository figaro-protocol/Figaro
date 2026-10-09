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
 *
 * Erasure mirrors `profileErasure`/`unpinAgreement` (wallet pins → wallet
 * erases): best-effort unpin of the derived CID, idempotent, never throwing —
 * content addressing means only THIS node's copy is erased, and a resolved-
 * empty lookup reads as absence, exactly like a withheld or never-published
 * payload.
 */
import { bytesToHex, hexToBytes, keccak256, type Hex } from "viem";
import { anchorAttestationContent, type Anchored } from "@figaro-protocol/sdk";
import { contentFieldsFor } from "@figaro-protocol/sdk/clauses";
import { witnessContentCid, witnessContentCidBase32 } from "@figaro-protocol/sdk/derive";
import {
    DEFAULT_IPFS_SERVICE,
    fetchCappedBinary,
    resolveContentUri,
    type CappedFetchOptions,
    type IpfsService,
} from "@/lib/shared/ipfsService";
import { clauseIdForHash, clauseSpecForHash } from "@/lib/shared/clauseSpecSource";
import { isBytes32Hex, isEmptyHex } from "@/lib/shared/evm";

export interface PublishWitnessContentParams {
    /** The clause attested — the on-chain clause hash
     *  keccak256(abi.encode(clauseId, version)), which names one registration. */
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
    // The hash names the exact (name, version) attested — resolve that spec.
    const identity = clauseIdForHash(params.clauseId);
    const clauseId = identity ? `${identity.clauseId} v${identity.version}` : params.clauseId;
    const spec = clauseSpecForHash(params.clauseId);
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
