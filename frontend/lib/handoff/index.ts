/**
 * Handoff coordination primitives.
 *
 * Public API for any physical-handoff assembly archetype: delivery,
 * ride-hail, repair dispatch, couriered retail, etc.
 *
 * - Manifest encode/decode (cleartext)
 * - Per-order ephemeral secp256k1 keypair generation
 * - Local key/intent persistence
 * - XMTP-based (or mock) coordination channel
 * - React hook for automatic buyer↔fulfiller key exchange
 *
 * Latent (Phase-3) symbols intentionally not re-exported:
 *   - sealManifest / openManifest / generateHandoffKey
 *     (the v3/v5/v7 ECDH-wrapped manifest envelope, currently with no
 *     production caller — `figaro:handoff-manifest` events have no listener
 *     that calls sealManifest)
 *   - encryptLineItems / decryptLineItems (consumed only by sealManifest)
 *   - deriveSharedSecret / wrapHandoffKey / unwrapHandoffKey (the ECDH
 *     wrap/unwrap pair, gated on the same wire-up)
 *   - getFulfillerEcdhKeypair (read-only variant; the get-or-create form
 *     is the production API)
 *
 * The functions themselves remain in `manifest.ts` and `ecdh.ts` ready for
 * Phase-3 activation; they're just not re-exported here so the public
 * surface stays small. Tests import them by direct path.
 */

// Manifest (cleartext API)
export {
    encodeGeohash,
    geohashBounds,
    geohashCenter,
    geohashDistance,
    COS_OPTIONS,
    cosLabel,
    encodeManifest,
    decodeManifest,
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

// ECDH key agreement (the wired-in pair; Phase-3 wrap/unwrap not re-exported)
export {
    getOrCreateFulfillerEcdhKeypair,
    removeFulfillerEcdhKeypair,
} from "./ecdh";

// Manifest schema registry hook
export { useManifestSchema, useManifestSchemaCount, FULFILMENT_V2_SCHEMA_KEY } from "./useManifestSchema";
export type { ManifestSchema } from "./useManifestSchema";
