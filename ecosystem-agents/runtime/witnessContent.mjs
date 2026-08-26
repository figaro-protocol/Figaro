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
 * Why this lives in the runtime and not in the SDK: the equivalent reader is
 * `frontend/lib/composition/witnessContent.ts` (searched 2026-08-26; it is
 * the only other implementation), and it is inside a Next application, not an
 * importable package. The SDK exports no keccak-CID helper and does no IPFS
 * I/O by design. One home for this would be better than two — see the
 * runtime README.
 */

import { keccak256 } from "viem";
import { fetchIpfsBytes } from "./ipfsRead.mjs";

/** CIDv1, multibase base16 ("f") over [raw codec 0x55, keccak-256 multihash
 *  0x1b, digest length 32]. Appending the fingerprint's hex yields the CID. */
const KECCAK_RAW_CID_PREFIX = "f01551b20";

const BYTES32_RE = /^0x[0-9a-fA-F]{64}$/;

/** The content address a `contentRef` resolves to — derivable by any reader
 *  from the Attestation event alone. */
export function witnessContentCid(contentRef) {
    if (!BYTES32_RE.test(contentRef)) throw new Error(`not a bytes32 contentRef: ${contentRef}`);
    return KECCAK_RAW_CID_PREFIX + contentRef.slice(2).toLowerCase();
}

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
