/**
 * addressDetail — the private-address ceremony on the geolocation clause.
 *
 * The geolocation clause commits the PUBLIC half of where an order goes
 * (origin/destination geohashes — coarse cells on the agreement). This module
 * carries the PRECISE half — the ADDRESSEE BLOCK: recipient name, street
 * address, floor/door, special instructions — which cannot be derived at
 * order time and is nobody's business but the party who must navigate there.
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
 *      geolocation section (the AttestationCoordinator's content-hash
 *      binding) — tamper-evidence for disputes; a corrected address is a
 *      superseding attestation.
 *   3. The seller derives the same secret and decrypts. Verification =
 *      keccak256(received blob) equals the anchored contentHash.
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

/** keccak256 over the encrypted blob's base64url text — the value the buyer
 *  anchors on-chain and the seller verifies the received blob against. */
export function addressDetailBlobHash(blobB64: string): `0x${string}` {
    return keccak256(toHex(blobB64));
}

/** The blob as attestation-content bytes (hex) — what `attestAsBuyer` takes;
 *  the coordinator hash-binds it, and the indexer can recover it from the
 *  event so the channel is a convenience, not a dependency. */
export function addressDetailContentBytes(blobB64: string): `0x${string}` {
    return toHex(blobB64);
}

/** Step 1 — the SELLER requests the detail: per-order ephemeral keypair
 *  created (idempotent, sessionStorage) and its public key sent to the buyer.
 *  Returns the public key sent. */
export async function requestAddressDetail(
    channel: CoordinationChannel,
    params: { myAddress: string; buyerAddress: string; orderId: string },
): Promise<string> {
    const keypair = getOrCreateOrderEcdhKeypair(params.myAddress, params.orderId);
    await channel.sendEcdhPubkey({
        recipientAddress: params.buyerAddress,
        orderId: params.orderId,
        pubKeyHex: keypair.publicKeyHex,
    });
    return keypair.publicKeyHex;
}

/** Step 2 — the BUYER answers: encrypts the addressee block against the
 *  seller's public key and sends (own public key, blob) over the channel.
 *  Returns the blob so the caller can anchor its hash on-chain. */
export async function sendAddressDetail(
    channel: CoordinationChannel,
    params: {
        myAddress: string;
        sellerAddress: string;
        orderId: string;
        sellerPubKeyHex: string;
        block: AddresseeBlock;
    },
): Promise<{ blobB64: string }> {
    const keypair = getOrCreateOrderEcdhKeypair(params.myAddress, params.orderId);
    // The buyer SENDS the encrypted payload → sender-side derivation.
    const secret = deriveSharedSecretAsSender(keypair.privateKeyHex, params.sellerPubKeyHex);
    const blobB64 = await wrapWithSharedSecret(encodeAddresseeBlock(params.block), secret);
    await channel.sendEcdhPubkey({
        recipientAddress: params.sellerAddress,
        orderId: params.orderId,
        pubKeyHex: keypair.publicKeyHex,
    });
    await channel.sendWrappedKey({
        recipientAddress: params.sellerAddress,
        orderId: params.orderId,
        wrappedKeyB64: blobB64,
    });
    return { blobB64 };
}

/** Step 3 — the SELLER decrypts a received blob with the buyer's public key.
 *  Returns null when the blob doesn't decrypt or doesn't parse — a wrong-key
 *  or corrupted payload is absence, not an exception. */
export async function decryptAddressDetail(params: {
    myAddress: string;
    orderId: string;
    buyerPubKeyHex: string;
    blobB64: string;
}): Promise<AddresseeBlock | null> {
    const keypair = getOrCreateOrderEcdhKeypair(params.myAddress, params.orderId);
    try {
        // The seller RECEIVES → receiver-side derivation against the buyer's (sender's) pubkey.
        const secret = deriveSharedSecretAsReceiver(params.buyerPubKeyHex, keypair.privateKeyHex);
        const plain = await unwrapWithSharedSecret(params.blobB64, secret);
        return tryDecodeAddresseeBlock(plain);
    } catch {
        return null;
    }
}
