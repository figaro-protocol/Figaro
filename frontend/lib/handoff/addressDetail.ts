/**
 * addressDetail — the private-address ceremony on the geolocation clause.
 *
 * The geolocation clause commits the PUBLIC half of where an order goes
 * (origin/destination geohashes — coarse cells on the agreement). This module
 * carries the PRECISE half — the ADDRESSEE BLOCK: recipient name, street
 * address, floor/door, special instructions — which cannot be derived at
 * order time and is nobody's business but the party who must navigate there.
 *
 * SYMMETRIC over the order edge: either party may request and either may
 * answer — a courier requests the buyer's drop-off door; in a private
 * transaction the buyer requests the seller's precise pickup point (the
 * profile address/geohash stay public by definition; the door-level detail
 * is encrypted). The same per-order keypairs serve both directions.
 *
 * The 2-message ceremony over the coordination channel (all channel data safe
 * to expose publicly — no transport-layer trust):
 *
 *   1. The order's SELLER (e.g. the courier), after accepting, requests the
 *      detail: generates a per-order ephemeral keypair and sends its public
 *      key to the buyer.
 *   2. The BUYER answers: generates their own per-order ephemeral keypair,
 *      derives the ECDH shared secret, AES-GCM-encrypts the addressee block,
 *      and sends their public key + the encrypted blob back. The buyer also
 *      anchors keccak256(blob) on-chain as a buyer attestation on the
 *      geolocation section — the HASH is the attestation content, so the
 *      chain (event AND calldata) never carries the ciphertext; the channel
 *      is its only carrier and it stays deletable after key purge
 *      (crypto-shredding survives the anchor). Tamper-evidence for disputes;
 *      a corrected address is a superseding attestation.
 *   3. The seller derives the same secret and decrypts. Verification =
 *      the event's contentRef (keccak256 of the anchored content) equals
 *      keccak256(keccak256(received blob)).
 *
 * This timing mirrors courier practice: the geohash cell is known BEFORE
 * accepting (it is bonded on); the exact door AFTER.
 */
import { keccak256, toHex } from "viem";
import {
    deriveSharedSecretAsReceiver,
    deriveSharedSecretAsSender,
    getOrCreateOrderEcdhKeypair,
    unwrapWithSharedSecret,
    wrapWithSharedSecret,
} from "./ecdh";
import type { CoordinationChannel } from "./channel";

/** The precise-address payload — everything a label/door needs and the chain
 *  never learns. All fields free-form; `name` is the addressee (names are
 *  non-derivable, like the address). */
export interface AddresseeBlock {
    name: string;
    street: string;
    /** Floor / apartment / door — the part a geohash can never carry. */
    unit?: string;
    instructions?: string;
}

function encodeAddresseeBlock(block: AddresseeBlock): string {
    return JSON.stringify(block);
}

export function tryDecodeAddresseeBlock(raw: string): AddresseeBlock | null {
    try {
        const parsed = JSON.parse(raw) as Partial<AddresseeBlock>;
        if (typeof parsed.name !== "string" || typeof parsed.street !== "string") return null;
        return {
            name: parsed.name,
            street: parsed.street,
            ...(typeof parsed.unit === "string" && { unit: parsed.unit }),
            ...(typeof parsed.instructions === "string" && { instructions: parsed.instructions }),
        };
    } catch {
        return null;
    }
}

/** keccak256 over the encrypted blob's base64url text — the 32-byte value the
 *  answering party anchors on-chain AS the attestation content. Hash-only by
 *  design: the ciphertext must never reach the chain (not even calldata), so
 *  the channel stays its only carrier and the blob remains deletable. */
export function addressDetailBlobHash(blobB64: string): `0x${string}` {
    return keccak256(toHex(blobB64));
}

/** What the Attestation event's contentRef equals for a hash-only anchor:
 *  the coordinator records keccak256(content), and the content IS the blob
 *  hash — so the receiving party verifies the event's contentRef against
 *  this double hash of the received blob. */
export function addressDetailAnchorRef(blobB64: string): `0x${string}` {
    return keccak256(addressDetailBlobHash(blobB64));
}

/** Step 1 — EITHER party requests the counterparty's detail: per-order
 *  ephemeral keypair created (idempotent, sessionStorage) and its public key
 *  sent across the order edge. The ceremony is symmetric — the courier
 *  requests the drop-off door; in a pickup, the buyer requests the seller's
 *  precise pickup point the same way. Returns the public key sent. */
export async function requestAddressDetail(
    channel: CoordinationChannel,
    params: { myAddress: string; recipientAddress: string; orderId: string },
): Promise<string> {
    const keypair = getOrCreateOrderEcdhKeypair(params.myAddress, params.orderId);
    await channel.sendEcdhPubkey({
        recipientAddress: params.recipientAddress,
        orderId: params.orderId,
        pubKeyHex: keypair.publicKeyHex,
    });
    return keypair.publicKeyHex;
}

/** Step 2 — the answering party encrypts ITS addressee block against the
 *  requester's public key and sends (own public key, blob) over the channel.
 *  Returns the blob so the caller can anchor its hash on-chain (a buyer
 *  answer anchors as a buyer attestation; a seller answer as a seller one). */
export async function sendAddressDetail(
    channel: CoordinationChannel,
    params: {
        myAddress: string;
        recipientAddress: string;
        orderId: string;
        recipientPubKeyHex: string;
        block: AddresseeBlock;
    },
): Promise<{ blobB64: string }> {
    const keypair = getOrCreateOrderEcdhKeypair(params.myAddress, params.orderId);
    // The answering party SENDS the encrypted payload → sender-side derivation.
    const secret = deriveSharedSecretAsSender(keypair.privateKeyHex, params.recipientPubKeyHex);
    const blobB64 = await wrapWithSharedSecret(encodeAddresseeBlock(params.block), secret);
    await channel.sendEcdhPubkey({
        recipientAddress: params.recipientAddress,
        orderId: params.orderId,
        pubKeyHex: keypair.publicKeyHex,
    });
    await channel.sendWrappedKey({
        recipientAddress: params.recipientAddress,
        orderId: params.orderId,
        wrappedKeyB64: blobB64,
    });
    return { blobB64 };
}

/** Step 3 — the receiving party decrypts a received blob with the SENDER's
 *  public key. Returns null when the blob doesn't decrypt or doesn't parse —
 *  a wrong-key or corrupted payload is absence, not an exception. */
export async function decryptAddressDetail(params: {
    myAddress: string;
    orderId: string;
    senderPubKeyHex: string;
    blobB64: string;
}): Promise<AddresseeBlock | null> {
    const keypair = getOrCreateOrderEcdhKeypair(params.myAddress, params.orderId);
    try {
        // Receiver-side derivation against the sender's pubkey.
        const secret = deriveSharedSecretAsReceiver(params.senderPubKeyHex, keypair.privateKeyHex);
        const plain = await unwrapWithSharedSecret(params.blobB64, secret);
        return tryDecodeAddresseeBlock(plain);
    } catch {
        return null;
    }
}
