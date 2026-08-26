/**
 * witnessContent — recover the SUBSTANCE behind an attestation's fingerprint.
 *
 * `AttestationCoordinator` records only `contentRef = keccak256(content)`; the
 * preimage never touches calldata (src/protocol/coordinators/
 * AttestationCoordinator.sol § "Content encoding"). The public half of that
 * seam is readable again because of one convention the attester follows: the
 * content bytes are pinned as a RAW block multihashed with keccak-256, so the
 * CID's digest IS the on-chain `contentRef` and ANY reader derives the address
 * from the event alone. No registry, no pointer, no locator field: the
 * fingerprint is the lookup.
 *
 * A read that resolves nothing is ABSENCE, not an error — a private-
 * disposition field, an erased pin, a payload the attester never published,
 * and a leaf whose substance is sold rather than given all read the same way.
 * Substance withheld from the commons is bought on the data market, never
 * inferred here.
 *
 * The fingerprint→address derivation is `witnessContentCid`
 * (`@figaro-protocol/sdk/derive` — pure, no I/O); this module holds only the
 * runtime's I/O half: the gateway read that verifies the bytes hash back.
 */

import { keccak256 } from "viem";
import { witnessContentCid } from "@figaro-protocol/sdk/derive";
import { fetchIpfsBytes } from "./ipfsRead.mjs";

const BYTES32_RE = /^0x[0-9a-fA-F]{64}$/;

function bytesToHex(bytes) {
    let out = "0x";
    for (const b of bytes) out += b.toString(16).padStart(2, "0");
    return out;
}

/**
 * Resolve a fingerprint to its published content bytes, VERIFYING the bytes
 * hash back to the fingerprint before returning them. A gateway that serves
 * some other block fails the check and reads as absence — the verification is
 * what makes an untrusted gateway an acceptable transport.
 *
 * @returns `{ contentRef, cid, content }` (content as a hex string), or `null`
 *          for absence. Throws only when every gateway failed to answer.
 */
export async function fetchWitnessContent(contentRef, options = {}) {
    if (!BYTES32_RE.test(contentRef)) return null;
    const cid = witnessContentCid(contentRef);
    const bytes = await fetchIpfsBytes(cid, options);
    if (bytes === null || bytes.byteLength === 0) return null;
    const content = bytesToHex(bytes);
    if (keccak256(content).toLowerCase() !== contentRef.toLowerCase()) return null;
    return { contentRef: contentRef.toLowerCase(), cid, content };
}
