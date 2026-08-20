/**
 * @figaro-protocol/sdk/handoff — the runtime handoff wire protocol.
 *
 * Message shapes + the `HandoffChannel` transport seam (`./messages.js`) and
 * the ECDH key agreement + AES-GCM wrapping they carry (`./ecdh.js`). A
 * second frontend implements a transport against `HandoffChannel` and
 * reproduces the exact key-exchange bytes from this entry point alone.
 */

export type {
    ChannelMessage,
    CommitmentSignatureMessage,
    EcdhPubkeyMessage,
    EcdhWrappedKeyMessage,
    HandoffChannel,
    HandoffKeyMessage,
} from "./messages.js";

export {
    ecdhAuthText,
    verifyEcdhMessageAuth,
    verifyEcdhMessageFromCounterparty,
    type AuthenticatedEcdhMessage,
} from "./auth.js";

export {
    deriveSharedSecretAsReceiver,
    deriveSharedSecretAsSender,
    generateOrderKeypair,
    unwrapWithSharedSecret,
    wrapWithSharedSecret,
    type EphemeralKeypair,
} from "./ecdh.js";
