/**
 * Coordination channel abstraction for secure key exchange between buyer and fulfiller.
 *
 * Two implementations:
 *   - Real: XMTP DM via @xmtp/browser-sdk (production / devnet with XMTP)
 *   - Mock: in-memory message bus for e2e tests
 *
 * The channel carries per-order AES handoff keys from buyer to fulfiller
 * after the fulfiller is assigned. The fulfiller uses
 * the key to decrypt the sealed payload and reveal the destination address.
 */

import { isE2EMockSession, isE2EDevnetSession } from "@/lib/shared/e2e";

// ── Message types ──────────────────────────────────────────────

export interface HandoffKeyMessage {
    type: "HANDOFF_KEY";
    /** On-chain order ID. */
    orderId: string;
    /** Base64url-encoded AES-256-GCM key that decrypts the payload. */
    keyB64: string;
    /** Unix-ms timestamp. */
    ts: number;
}

/** ECDH public key offer: fulfiller sends their per-order ephemeral public key to buyer. */
export interface EcdhPubkeyMessage {
    type: "ECDH_PUBKEY";
    orderId: string;
    /** Compressed secp256k1 public key hex (66 chars). */
    pubKeyHex: string;
    ts: number;
}

/** ECDH wrapped key: buyer sends the AES handoff key wrapped with the ECDH shared secret. */
export interface EcdhWrappedKeyMessage {
    type: "ECDH_WRAPPED_KEY";
    orderId: string;
    /** Base64url blob: 12-byte IV || AES-256-GCM ciphertext of the handoff key. Safe to expose publicly. */
    wrappedKeyB64: string;
    ts: number;
}

/** Commitment payload: carries an IPFS CID pointing to a JSON-serialized
 *  AnyCommitmentPayload. The sender pins the payload at share time; the
 *  receiver dereferences via the configured IPFS transport. Keeps the
 *  XMTP envelope small and gives late subscribers a durable retrieval
 *  path independent of XMTP DM history. */
export interface CommitmentSignatureMessage {
    type: "COMMITMENT_PAYLOAD";
    orderId: string;
    /** Bare IPFS CID (no `ipfs://` prefix) of the pinned payload JSON. */
    payloadCid: string;
    ts: number;
}

/** Handoff address: the buyer sends the human-readable delivery address to
 *  the assigned courier. The geohash on the courier order's geo clause
 *  section is the on-agreement location commitment; this carries the
 *  street-level detail (apartment, entry notes) the courier needs. */
export interface HandoffAddressMessage {
    type: "HANDOFF_ADDRESS";
    orderId: string;
    /** Human-readable delivery address / handoff notes. */
    deliveryAddress: string;
    ts: number;
}

export type ChannelMessage = HandoffKeyMessage | EcdhPubkeyMessage | EcdhWrappedKeyMessage | CommitmentSignatureMessage | HandoffAddressMessage;

// ── Channel interface ──────────────────────────────────────────

export interface CoordinationChannel {
    /** Send a handoff key to the fulfiller who claimed the job. */
    sendHandoffKey(params: {
        recipientAddress: string;
        orderId: string;
        keyB64: string;
    }): Promise<void>;

    /**
     * Subscribe to incoming handoff-key messages for a specific order.
     * Returns an unsubscribe function.
     *
     * The sender metadata is transport-specific:
     * - XMTP returns the sender inbox identifier
     * - the mock channel returns the sender wallet address
     */
    onHandoffKey(
        orderId: string,
        callback: (keyB64: string, senderIdentity: string) => void,
    ): () => void;

    // ── ECDH key exchange ──────────────────────────────────────

    /**
     * Send the fulfiller's per-order ECDH public key to the buyer.
     * Data is safe to expose publicly — it's an ephemeral public key.
     */
    sendEcdhPubkey(params: {
        recipientAddress: string;
        orderId: string;
        pubKeyHex: string;
    }): Promise<void>;

    /**
     * Subscribe to incoming ECDH public keys for a specific order.
     * Returns an unsubscribe function.
     */
    onEcdhPubkey(
        orderId: string,
        callback: (pubKeyHex: string, senderIdentity: string) => void,
    ): () => void;

    /**
     * Send an ECDH-wrapped handoff key to the fulfiller.
     * Data is safe to expose publicly — encrypted with ECDH shared secret.
     */
    sendWrappedKey(params: {
        recipientAddress: string;
        orderId: string;
        wrappedKeyB64: string;
    }): Promise<void>;

    /**
     * Subscribe to incoming ECDH-wrapped keys for a specific order.
     * Returns an unsubscribe function.
     */
    onWrappedKey(
        orderId: string,
        callback: (wrappedKeyB64: string, senderIdentity: string) => void,
    ): () => void;

    // ── Commitment payload exchange ───────────────────────────

    /**
     * Send the IPFS CID of a pinned commitment payload to the counter-party
     * for dual-signature collection. The sender is responsible for pinning
     * the payload JSON before invoking; the receiver dereferences via IPFS.
     */
    sendCommitmentPayload(params: {
        recipientAddress: string;
        orderId: string;
        payloadCid: string;
    }): Promise<void>;

    /**
     * Subscribe to incoming commitment-payload CIDs for a specific order.
     * Returns an unsubscribe function.
     */
    onCommitmentPayload(
        orderId: string,
        callback: (payloadCid: string, senderIdentity: string) => void,
    ): () => void;

    /**
     * Subscribe to any incoming commitment-payload CIDs for the connected wallet.
     * Returns an unsubscribe function.
     */
    onAnyCommitmentPayload(
        callback: (payloadCid: string, orderId: string) => void,
    ): () => void;

    // ── Handoff address ───────────────────────────────────────

    /** Send the human-readable delivery address to the assigned courier. */
    sendHandoffAddress(params: {
        recipientAddress: string;
        orderId: string;
        deliveryAddress: string;
    }): Promise<void>;

    /**
     * Subscribe to the delivery address for a specific order.
     * Returns an unsubscribe function.
     */
    onHandoffAddress(
        orderId: string,
        callback: (deliveryAddress: string, senderIdentity: string) => void,
    ): () => void;

    /** Tear down the channel (close XMTP client, etc.). */
    destroy(): void;
}

// ── Factory ────────────────────────────────────────────────────

/** Cached channel instances keyed by address. */
const channelCache = new Map<string, CoordinationChannel>();

/**
 * Get or create a CoordinationChannel for the given wallet.
 *
 * In test mode (e2e mock or devnet) returns the mock channel so we
 * never hit the XMTP network in automated tests.
 *
 * @param address  Wallet address (checksummed or lowercase).
 * @param signMessage  Wallet signing capability for XMTP auth.
 */
export async function getCoordinationChannel(
    address: string,
    signMessage?: (message: string) => Promise<`0x${string}`>,
): Promise<CoordinationChannel> {
    const key = address.toLowerCase();
    const cached = channelCache.get(key);
    if (cached) return cached;

    // In any e2e mode fall back to the mock channel. Uses the shared,
    // sessionStorage-backed detector so the mode survives param-dropping
    // <Link> navigations (e.g. browse → /checkout), not just the entry URL.
    if (isE2EMockSession() || isE2EDevnetSession()) {
        const { createMockChannel } = await import("./mockChannel");
        const ch = createMockChannel(address);
        channelCache.set(key, ch);
        return ch;
    }

    if (!signMessage) {
        throw new Error("signMessage callback required for XMTP channel outside test mode");
    }

    // A normal lazy import — webpack emits ./xmtpChannel as its own chunk.
    // (It carried `webpackIgnore: true` from the V5 baseline, which told
    // webpack to emit NO chunk and left the browser resolving a raw
    // relative URL against /_next/static/chunks/… — a guaranteed 404, so
    // the real XMTP path never worked in any bundled build. The module
    // itself already lazy-imports @xmtp/browser-sdk to keep WASM out of
    // the server bundle; no pragma is needed for that.)
    const { createXmtpChannel } = await import("./xmtpChannel");
    const ch = await createXmtpChannel(address, signMessage);
    channelCache.set(key, ch);
    return ch;
}

/** Remove a cached channel (e.g. on wallet disconnect). */
function destroyCoordinationChannel(address: string): void {
    const key = address.toLowerCase();
    const ch = channelCache.get(key);
    if (ch) {
        ch.destroy();
        channelCache.delete(key);
    }
}
