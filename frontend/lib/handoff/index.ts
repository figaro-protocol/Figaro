/**
 * Handoff coordination primitives.
 *
 * Public API for any physical-handoff assembly archetype: delivery,
 * ride-hail, repair dispatch, couriered retail, etc.
 *
 * - Geohash + class-of-service utilities
 * - Per-order ephemeral secp256k1 keypair generation
 * - Local key/intent persistence
 * - XMTP-based (or mock) coordination channel
 * - React hook for automatic buyer↔fulfiller key exchange
 *
 * The on-chain manifest codec (encode/decode/seal of a v1–v7 manifest blob)
 * was removed — the kernel Commitment carries no manifest field; an order's
 * content is its agreementHash (the merkle root over agreement sections).
 * ECDH wrap/unwrap remain internal to `ecdh.ts` for the coordination
 * channel's key exchange and are not part of this public surface.
 */

// Geohash + class-of-service + manifest clause IDs
export {
    encodeGeohash,
    geohashBounds,
    geohashCenter,
    geohashDistance,
    COS_OPTIONS,
    cosLabel,
    MANIFEST_CLAUSES,
} from "./manifest";
export type { CoS } from "./manifest";

// Ephemeral keys
export { generateOrderKeypair } from "./ephemeralKeys";
export type { EphemeralKeypair } from "./ephemeralKeys";

// Key persistence
export { saveHandoffKey, getHandoffKey, removeHandoffKey, HANDOFF_KEY_STORAGE_KEY } from "./handoffKeys";
export type { HandoffKeyRecord } from "./handoffKeys";

// Intent persistence
export {
    savePendingHandoffIntent,
    getPendingHandoffIntent,
    removePendingHandoffIntent,
} from "./handoffIntent";
export type { PendingHandoffIntent } from "./handoffIntent";

// Artifact persistence
export { persistHandoffArtifactsForOrder, recoverHandoffKeys } from "./handoffArtifacts";
export type {
    PersistHandoffArtifactsParams,
    PersistedHandoffArtifacts,
    OrderWithManifest,
} from "./handoffArtifacts";

// Lifecycle cleanup
export { useHandoffCleanup } from "./useHandoffCleanup";

// Channel
export { getCoordinationChannel, destroyCoordinationChannel } from "./channel";
export type { CoordinationChannel, HandoffKeyMessage, EcdhPubkeyMessage, EcdhWrappedKeyMessage, ChannelMessage } from "./channel";

// ECDH key agreement (the wired-in pair; Phase-3 wrap/unwrap not re-exported)
export {
    getOrCreateFulfillerEcdhKeypair,
    removeFulfillerEcdhKeypair,
} from "./ecdh";

// Manifest clause registry hook
export { useManifestClause, useManifestClauseCount } from "./useManifestClause";
export type { ManifestClause } from "./useManifestClause";
export { FULFILMENT_V2_CLAUSE_KEY } from "@/lib/core/agreementManifest";
