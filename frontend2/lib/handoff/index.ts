/**
 * Handoff coordination primitives.
 *
 * This module provides generic building blocks for any physical-handoff
 * institution archetype: delivery, ride-hail, repair dispatch, couriered
 * retail, etc.
 *
 * - Manifest encoding/decoding with geohash + AES-256-GCM privacy
 * - Per-order ephemeral secp256k1 keypair generation
 * - Local key/intent persistence
 * - XMTP-based (or mock) key exchange channel
 * - React hook for automatic buyer↔fulfiller key exchange
 */

// Manifest
export {
    encodeGeohash,
    geohashBounds,
    geohashCenter,
    geohashDistance,
    COS_OPTIONS,
    cosLabel,
    encodeManifest,
    decodeManifest,
    sealManifest,
    openManifest,
    generateHandoffKey,
    encodeLineItems,
    decodeLineItems,
    LEGACY_MANIFEST,
    MANIFEST_SCHEMAS,
} from "./manifest";
export type { CoS, HandoffManifest, LineItem } from "./manifest";

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

// ECDH key agreement
export {
    deriveSharedSecret,
    wrapHandoffKey,
    unwrapHandoffKey,
    getOrCreateFulfillerEcdhKeypair,
    getFulfillerEcdhKeypair,
    removeFulfillerEcdhKeypair,
} from "./ecdh";

// Manifest schema registry hook
export { useManifestSchema, useMechanismSchema, useManifestSchemaCount, HANDOFF_SCHEMA_KEY } from "./useManifestSchema";
export type { ManifestSchema } from "./useManifestSchema";
