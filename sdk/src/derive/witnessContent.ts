/**
 * @figaro-protocol/sdk/derive — Witness content addressing
 *
 * The fingerprint→content-address derivation behind the attestation seam.
 * `AttestationCoordinator` records only `contentRef = keccak256(content)` —
 * calldata never holds a preimage. The attester pins the exact content bytes
 * to IPFS as a RAW block multihashed with keccak-256, so the CID's digest IS
 * the on-chain `contentRef` and ANY reader derives the content address from
 * the event alone. No registry, no pointer, no locator field: the fingerprint
 * is the lookup.
 *
 * Pure derivation only: pinning, fetching, hash verification, and erasure are
 * the caller's I/O (the SDK does no IPFS I/O by design). A read that resolves
 * nothing at the derived address is ABSENCE, not an error — a private-
 * disposition field, an erased pin, and a never-published payload all read
 * the same way.
 */

import { type Hex, isBytes32Hex } from "../types.js";

// CIDv1 prefix for [raw codec 0x55, keccak-256 multihash 0x1b, digest length
// 32], multibase base16 ("f"). Appending the fingerprint's hex yields the CID.
const KECCAK_RAW_CID_PREFIX = "f01551b20";

/**
 * The content address a `contentRef` fingerprint resolves to — derivable by
 * any reader from the Attestation event alone. Multibase base16 form.
 *
 * Throws on a malformed fingerprint: the derivation is only defined over a
 * bytes32 hex string.
 */
export function witnessContentCid(contentRef: Hex): string {
    if (!isBytes32Hex(contentRef)) throw new Error(`not a bytes32 contentRef: ${contentRef}`);
    return KECCAK_RAW_CID_PREFIX + contentRef.slice(2).toLowerCase();
}

// Kubo reports block/put CIDs in multibase base32 lowercase; encoding the same
// CID bytes that way lets a pin be verified verbatim against what the node
// reported — detecting a node that ignored the requested multihash.
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

/**
 * The multibase base32 form of the same CID (`bafkrwi…`) — what Kubo's
 * block/put reports. Compare it verbatim to the node's reported key to verify
 * the pin landed under the fingerprint-derived address.
 */
export function witnessContentCidBase32(contentRef: Hex): string {
    const hex = witnessContentCid(contentRef).slice(1); // strip multibase "f"
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return "b" + base32Lower(bytes);
}
