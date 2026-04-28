"use client";

import { useCallback } from "react";
import { encodeAbiParameters, keccak256, stringToHex, type Hex } from "viem";
import { executeTransactionCapabilityAction } from "@/lib/core/executeTransactionCapability";
import { useAttestationCoordinatorActions } from "@/lib/mechanisms/useAttestationCoordinatorActions";
import { encodeLifecycleContent } from "@figaro/core/schemas";
import { DELIVERY_LIFECYCLE_SCHEMA_KEY } from "@/lib/core/agreementManifest";

/** keccak256 of the delivery-lifecycle schema key — matches on-chain
 *  registration. The schema key itself comes from the canonical export
 *  in `lib/core/agreementManifest`. */
const DELIVERY_SCHEMA_ID = keccak256(stringToHex(DELIVERY_LIFECYCLE_SCHEMA_KEY));
/**
 * Runtime proximity-proof schema (Category-1, fresh per attestation). The
 * sister schema figaro-proximity-policy-v1 commits the required band at
 * agreement signing; off-chain consumers verify proof.band == policy.band.
 */
export const PROXIMITY_SCHEMA_KEY = "figaro-proximity-proof-v1";
export const PROXIMITY_SCHEMA_ID = keccak256(stringToHex(PROXIMITY_SCHEMA_KEY));

/**
 * Delivery lifecycle stages — encoded as uint8 in AttestationCoordinator.
 * These map the old per-function signals to attestation stages.
 */
export const DELIVERY_STAGE = {
    preparationStarted: 0,
    readyForPickup: 1,
    courierEnRoute: 2,
    pickedUp: 3,
    delivered: 4,
} as const;

export type DeliveryLifecycleSignal =
    | "declarePreparationStarted"
    | "declareReadyForPickup"
    | "declareEnRoute"
    | "declarePickedUp"
    | "declareDelivered";

/** Map signal names to attestation stages. */
const SIGNAL_TO_STAGE: Record<DeliveryLifecycleSignal, number> = {
    declarePreparationStarted: DELIVERY_STAGE.preparationStarted,
    declareReadyForPickup: DELIVERY_STAGE.readyForPickup,
    declareEnRoute: DELIVERY_STAGE.courierEnRoute,
    declarePickedUp: DELIVERY_STAGE.pickedUp,
    declareDelivered: DELIVERY_STAGE.delivered,
};

/** ProximityTypes.Proof struct matching the Solidity ABI. */
export interface ProximityProof {
    /** 0=None, 1=Zone(WiFi), 2=Nearby(BLE), 3=Contact(NFC) */
    band: number;
    nonce: `0x${string}`;
    deviceSig: `0x${string}`;
}

/**
 * ABI-encode a proximity proof as `figaro-proximity-proof-v1` content.
 * Shape: `abi.encode(uint8 band, bytes32 nonce, bytes deviceSig)` — matches
 * the on-chain validator's `abi.decode(content, (uint8, bytes32, bytes))`.
 */
export function encodeProximityProofContent(proof: ProximityProof): `0x${string}` {
    return encodeAbiParameters(
        [{ type: "uint8" }, { type: "bytes32" }, { type: "bytes" }],
        [proof.band, proof.nonce, proof.deviceSig],
    );
}

/** @deprecated Use `encodeProximityProofContent` — Phase-4a shipped bytes content. */
export function encodeProximityProofRef(proof: ProximityProof): `0x${string}` {
    return keccak256(stringToHex(JSON.stringify({
        band: proof.band,
        nonce: proof.nonce,
        deviceSig: proof.deviceSig,
    })));
}

export function useDeliveryLifecycleActions() {
    const {
        submitSellerAttestation,
        isPending,
        isConfirming,
        isSuccess,
        error,
        isAvailable,
    } = useAttestationCoordinatorActions();

    /** Send a lifecycle attestation (no proximity proof). */
    const signal = useCallback(async (
        orderHash: string,
        functionName: DeliveryLifecycleSignal,
        roleOrderHash?: string,
    ) => {
        const stage = SIGNAL_TO_STAGE[functionName];
        return submitSellerAttestation({
            roleOrderHash: roleOrderHash as Hex | undefined,
            orderHash: orderHash as Hex,
            schemaId: DELIVERY_SCHEMA_ID as Hex,
            stage,
            // Category-1: content must decode as `(string evidenceUri)`. Empty
            // URI is valid; byte-equality with sectionData is not enforced.
            content: encodeLifecycleContent(""),
        });
    }, [submitSellerAttestation]);

    /**
     * Send a lifecycle attestation with a proximity proof.
     * Proximity is a separate attestation under `figaro-proximity-proof-v1`
     * whose content is `abi.encode(uint8 band, bytes32 nonce, bytes deviceSig)`,
     * cryptographically bound to its hash in the Attestation event. Off-chain
     * consumers verify proof.band == policy.band against the committed
     * `figaro-proximity-policy-v1` section.
     */
    const signalWithProof = useCallback(async (
        orderHash: string,
        functionName: "declarePickedUp" | "declareDelivered",
        proof: ProximityProof,
        roleOrderHash?: string,
    ) => {
        await submitSellerAttestation({
            roleOrderHash: roleOrderHash as Hex | undefined,
            orderHash: orderHash as Hex,
            schemaId: PROXIMITY_SCHEMA_ID as Hex,
            stage: proof.band,
            content: encodeProximityProofContent(proof),
            failureMessage: "Proximity proof submission failed",
        });

        return signal(orderHash, functionName, roleOrderHash);
    }, [submitSellerAttestation, signal]);

    return {
        signal,
        signalWithProof,
        isPending,
        isConfirming,
        isSuccess,
        error,
        isAvailable,
    };
}

/**
 * Delivery lifecycle signals via AttestationCoordinator.
 *
 * @param orderHash    The bytes32 order hash (content-addressed ID).
 * @param roleOrderHash The order hash that establishes the caller's role in the process.
 */
export function useDeliveryLifecycleSignals(orderHash: string, roleOrderHash?: string) {
    const {
        signal: submitSignal,
        signalWithProof: submitSignalWithProof,
        isPending,
        isConfirming,
        isSuccess,
        error,
        isAvailable,
    } = useDeliveryLifecycleActions();

    const signal = useCallback(async (functionName: DeliveryLifecycleSignal) => {
        try {
            await executeTransactionCapabilityAction({
                executionType: "transaction",
                kind: "submit-delivery-lifecycle-signal",
                orderHash,
                signal: functionName,
                roleOrderHash,
            }, {
                submitDeliveryLifecycleSignal: submitSignal,
            });
            return true;
        } catch {
            return false;
        }
    }, [submitSignal, orderHash, roleOrderHash]);

    const signalWithProof = useCallback(async (
        functionName: "declarePickedUp" | "declareDelivered",
        proof: ProximityProof,
    ) => {
        try {
            await executeTransactionCapabilityAction({
                executionType: "transaction",
                kind: "submit-delivery-lifecycle-proof",
                orderHash,
                signal: functionName,
                roleOrderHash,
            }, {
                submitDeliveryLifecycleProof: submitSignalWithProof,
            }, {
                kind: "submit-delivery-lifecycle-proof",
                proof,
            });
            return true;
        } catch {
            return false;
        }
    }, [submitSignalWithProof, orderHash, roleOrderHash]);

    return {
        signal,
        signalWithProof,
        isPending,
        isConfirming,
        isSuccess,
        error,
        isAvailable,
    };
}
