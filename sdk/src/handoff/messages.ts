/**
 * @figaro/sdk/handoff — the handoff coordination wire protocol.
 *
 * The message shapes and channel interface two wallets speak when a pending
 * commitment (or a sealed handoff key) travels between them at runtime:
 *
 *   1. The key-receiving party generates a per-order ephemeral keypair and
 *      sends its public key (`ECDH_PUBKEY`).
 *   2. Both sides independently derive the same ECDH shared secret
 *      (`./ecdh.js` — direction-sensitive; see its doc).
 *   3. The key-sending party wraps the AES handoff key with the shared
 *      secret and sends the blob publicly (`ECDH_WRAPPED_KEY`).
 *   4. The receiver unwraps → holds the AES key → opens the sealed payload.
 *
 * `COMMITMENT_PAYLOAD` carries only an IPFS CID: the sender pins the
 * serialized `CommitmentPayload` (see `@figaro/sdk/agent`) at share time and
 * the receiver dereferences it, keeping the envelope small and giving late
 * subscribers a durable retrieval path.
 *
 * Every shape is safe to expose on a public transport: keys travel either
 * as ephemeral public keys or wrapped under the ECDH secret.
 *
 * `HandoffChannel` is the transport seam — implementations (XMTP, an
 * in-memory test bus, an inert links-only null channel) live with the
 * consumer; the SDK owns only the wire vocabulary. Distinct from
 * `@figaro/sdk/agent`'s `CoordinationChannel`, which carries the bilateral
 * OFFER exchange between agents — different exchange, different vocabulary.
 */

/** Direct AES handoff-key transport (used when the transport itself is
 *  confidential). */
export interface HandoffKeyMessage {
    type: "HANDOFF_KEY";
    /** On-chain order ID. */
    orderId: string;
    /** Base64url-encoded AES-256-GCM key that decrypts the payload. */
    keyB64: string;
    /** Unix-ms timestamp. */
    ts: number;
}

/** ECDH public key offer: the key-receiving party sends its per-order
 *  ephemeral public key. Wallet-authenticated (`./auth.js`): the transport
 *  proves nothing, so the sender's wallet signs (type ‖ orderId ‖ pubKeyHex)
 *  and receivers verify + match `senderAddress` against the order's
 *  counterparty before trusting the key. */
export interface EcdhPubkeyMessage {
    type: "ECDH_PUBKEY";
    orderId: string;
    /** Compressed secp256k1 public key hex (66 chars, unprefixed). */
    pubKeyHex: string;
    /** Sender's wallet address — the identity the signature proves. */
    senderAddress: string;
    /** EIP-191 wallet signature over `ecdhAuthText(type, orderId, pubKeyHex)`. */
    sig: string;
    ts: number;
}

/** ECDH wrapped key: the AES handoff key wrapped with the ECDH shared
 *  secret. Wallet-authenticated like the pubkey offer (`./auth.js`). */
export interface EcdhWrappedKeyMessage {
    type: "ECDH_WRAPPED_KEY";
    orderId: string;
    /** Base64url blob: 12-byte IV || AES-256-GCM ciphertext of the handoff
     *  key. Safe to expose publicly. */
    wrappedKeyB64: string;
    /** Sender's wallet address — the identity the signature proves. */
    senderAddress: string;
    /** EIP-191 wallet signature over `ecdhAuthText(type, orderId, wrappedKeyB64)`. */
    sig: string;
    ts: number;
}

/** Commitment payload delivery: the JSON-serialized `CommitmentPayload`
 *  (`@figaro/sdk/agent`) carried INLINE over the coordination channel, which is
 *  end-to-end encrypted (XMTP). Carrying it here rather than pinning it to
 *  public IPFS is the paid-edge seam's transport half: a `private`-disposition
 *  section's plaintext reaches only the counterparty, never a public surface
 *  (audit F Arm 2). The public-verification copy is the WITHHELD standalone
 *  agreement pin (`publishAgreement`); this delivers the plaintext the
 *  counterparty needs to sign. */
export interface CommitmentSignatureMessage {
    type: "COMMITMENT_PAYLOAD";
    orderId: string;
    /** The JSON-serialized `CommitmentPayload`, delivered inline. */
    payload: string;
    ts: number;
}

export type ChannelMessage =
    | HandoffKeyMessage
    | EcdhPubkeyMessage
    | EcdhWrappedKeyMessage
    | CommitmentSignatureMessage;

// ── Channel interface ──────────────────────────────────────────

/** The transport seam the handoff protocol runs over. Implementations carry
 *  each `ChannelMessage` shape between two wallet addresses; sender identity
 *  metadata is transport-specific (an XMTP inbox id, a wallet address, …). */
export interface HandoffChannel {
    /** Send a handoff key to the counterparty for `orderId`. */
    sendHandoffKey(params: {
        recipientAddress: string;
        orderId: string;
        keyB64: string;
    }): Promise<void>;

    /** Subscribe to incoming handoff keys for `orderId`; returns an
     *  unsubscribe function. */
    onHandoffKey(
        orderId: string,
        callback: (keyB64: string, senderIdentity: string) => void,
    ): () => void;

    /** Send a per-order ephemeral ECDH public key (safe to expose; the
     *  sender pre-signs — see `./auth.js`). */
    sendEcdhPubkey(params: {
        recipientAddress: string;
        orderId: string;
        pubKeyHex: string;
        senderAddress: string;
        sig: string;
    }): Promise<void>;

    /** Subscribe to incoming ECDH public keys for `orderId`. Delivers the
     *  FULL message and keeps listening — the receiver verifies each one
     *  (`verifyEcdhMessageAuth` + counterparty match) and skips failures;
     *  a forged message must never end the subscription. `senderIdentity`
     *  is transport metadata only — NEVER identity. */
    onEcdhPubkey(
        orderId: string,
        callback: (msg: EcdhPubkeyMessage, senderIdentity: string) => void,
    ): () => void;

    /** Send an ECDH-wrapped handoff key (safe to expose; pre-signed). */
    sendWrappedKey(params: {
        recipientAddress: string;
        orderId: string;
        wrappedKeyB64: string;
        senderAddress: string;
        sig: string;
    }): Promise<void>;

    /** Subscribe to incoming ECDH-wrapped keys for `orderId` — same
     *  full-message, verify-and-skip contract as `onEcdhPubkey`. */
    onWrappedKey(
        orderId: string,
        callback: (msg: EcdhWrappedKeyMessage, senderIdentity: string) => void,
    ): () => void;

    /** Deliver a JSON-serialized commitment payload INLINE for dual-signature
     *  collection. Carried over the E2E-encrypted channel, not pinned to public
     *  IPFS, so a `private`-disposition section's plaintext never leaves the
     *  parties (audit F Arm 2). */
    sendCommitmentPayload(params: {
        recipientAddress: string;
        orderId: string;
        payload: string;
    }): Promise<void>;

    /** Subscribe to incoming commitment payloads for `orderId`. */
    onCommitmentPayload(
        orderId: string,
        callback: (payload: string, senderIdentity: string) => void,
    ): () => void;

    /** Subscribe to ANY incoming commitment payload for the connected wallet. */
    onAnyCommitmentPayload(
        callback: (payload: string, orderId: string) => void,
    ): () => void;

    /** Tear down the channel (close the transport client, etc.). */
    destroy(): void;
}
