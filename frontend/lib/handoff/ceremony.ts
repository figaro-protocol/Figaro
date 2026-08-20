/**
 * ceremony — the ECDH two-message ceremony core the per-order confidential
 * channels share (the address detail, the content delivery):
 *
 *   1. The REQUESTING party generates a per-ceremony ephemeral keypair and
 *      sends its public key across the order edge (wallet-signed).
 *   2. The ANSWERING party derives the ECDH shared secret, AES-GCM-encrypts
 *      its payload, and sends (own public key, encrypted blob) back — both
 *      wallet-signed; the transport proves nothing (`@figaro-protocol/sdk/handoff`
 *      auth), so the receiver verifies each message's signature against the
 *      order's counterparty and skips failures.
 *   3. The receiver derives the same secret and decrypts.
 *
 * Each ceremony scopes its own CORRELATION ID (the channel's `orderId`
 * field): the address ceremony correlates on the bare order hash, the
 * content ceremony on `<orderHash>#content` — so two ceremonies on one
 * order never cross keys or blobs, and the wallet signature binds the
 * scoped id (no cross-ceremony replay). What the blob MEANS — the codec —
 * belongs to each ceremony module, never here.
 */
import {
    deriveSharedSecretAsReceiver,
    deriveSharedSecretAsSender,
    ecdhAuthText,
    unwrapWithSharedSecret,
    wrapWithSharedSecret,
} from "@figaro-protocol/sdk/handoff";
import type { HandoffChannel } from "@figaro-protocol/sdk/handoff";
import { getOrCreateOrderEcdhKeypair } from "./ecdh";

/** Wallet capability that signs the EIP-191 auth text for a channel message
 *  — the sender's identity on an untrusted transport. */
export type SignChannelAuth = (message: string) => Promise<`0x${string}`>;

/** Step 1 — request: per-ceremony ephemeral keypair created (idempotent,
 *  sessionStorage) and its public key sent, wallet-signed. Returns the
 *  public key sent. */
export async function requestCeremonyKey(
    channel: HandoffChannel,
    params: {
        myAddress: string;
        recipientAddress: string;
        ceremonyId: string;
        signAuth: SignChannelAuth;
    },
): Promise<string> {
    const keypair = getOrCreateOrderEcdhKeypair(params.myAddress, params.ceremonyId);
    const sig = await params.signAuth(
        ecdhAuthText("ECDH_PUBKEY", params.ceremonyId, keypair.publicKeyHex),
    );
    await channel.sendEcdhPubkey({
        recipientAddress: params.recipientAddress,
        orderId: params.ceremonyId,
        pubKeyHex: keypair.publicKeyHex,
        senderAddress: params.myAddress,
        sig,
    });
    return keypair.publicKeyHex;
}

/** Step 2 — answer: encrypt `plain` against the requester's public key and
 *  send (own public key, blob), each wallet-signed. Returns the blob so the
 *  caller can anchor its hash on-chain. */
export async function sendCeremonyBlob(
    channel: HandoffChannel,
    params: {
        myAddress: string;
        recipientAddress: string;
        ceremonyId: string;
        recipientPubKeyHex: string;
        plain: string;
        signAuth: SignChannelAuth;
    },
): Promise<{ blobB64: string }> {
    const keypair = getOrCreateOrderEcdhKeypair(params.myAddress, params.ceremonyId);
    // The answering party SENDS the encrypted payload → sender-side derivation.
    const secret = deriveSharedSecretAsSender(keypair.privateKeyHex, params.recipientPubKeyHex);
    const blobB64 = await wrapWithSharedSecret(params.plain, secret);
    const pubkeySig = await params.signAuth(
        ecdhAuthText("ECDH_PUBKEY", params.ceremonyId, keypair.publicKeyHex),
    );
    await channel.sendEcdhPubkey({
        recipientAddress: params.recipientAddress,
        orderId: params.ceremonyId,
        pubKeyHex: keypair.publicKeyHex,
        senderAddress: params.myAddress,
        sig: pubkeySig,
    });
    const blobSig = await params.signAuth(
        ecdhAuthText("ECDH_WRAPPED_KEY", params.ceremonyId, blobB64),
    );
    await channel.sendWrappedKey({
        recipientAddress: params.recipientAddress,
        orderId: params.ceremonyId,
        wrappedKeyB64: blobB64,
        senderAddress: params.myAddress,
        sig: blobSig,
    });
    return { blobB64 };
}

/** Step 3 — decrypt a received blob with the SENDER's public key. Returns
 *  null when the blob doesn't decrypt — a wrong-key or corrupted payload is
 *  absence, not an exception. */
export async function decryptCeremonyBlob(params: {
    myAddress: string;
    ceremonyId: string;
    senderPubKeyHex: string;
    blobB64: string;
}): Promise<string | null> {
    const keypair = getOrCreateOrderEcdhKeypair(params.myAddress, params.ceremonyId);
    try {
        // Receiver-side derivation against the sender's pubkey.
        const secret = deriveSharedSecretAsReceiver(params.senderPubKeyHex, keypair.privateKeyHex);
        return await unwrapWithSharedSecret(params.blobB64, secret);
    } catch {
        return null;
    }
}
