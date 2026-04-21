"use client";

import { useCallback } from "react";
import { keccak256, stringToHex, type Hex } from "viem";
import { executeTransactionCapabilityAction } from "@/lib/core/executeTransactionCapability";
import { ZERO_BYTES32, useAttestationCoordinatorActions } from "@/lib/mechanisms/useAttestationCoordinatorActions";

/** Well-known delivery schema key (matches on-chain registration). */
export const DELIVERY_SCHEMA_KEY = "figaro-delivery-lifecycle-v1";
export const DELIVERY_SCHEMA_ID = keccak256(stringToHex(DELIVERY_SCHEMA_KEY));
export const PROXIMITY_SCHEMA_KEY = "figaro-proximity-v1";
export const PROXIMITY_SCHEMA_ID = keccak256(stringToHex(PROXIMITY_SCHEMA_KEY));

/**
 * Delivery lifecycle stages — encoded as uint8 in AttestationCoordinator.
 * These map the old per-function signals to attestation stages.
 */
export const DELIVERY_STAGE = {
    preparationStarted: 0,
    readyForPickup: 1,
    driverEnRoute: 2,
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
    declareEnRoute: DELIVERY_STAGE.driverEnRoute,
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

/** Commit a proximity proof payload into the attestation contentRef field. */
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
            contentRef: ZERO_BYTES32,
        });
    }, [submitSellerAttestation]);

    /**
     * Send a lifecycle attestation with a proximity proof.
      * Proximity is a separate attestation under the figaro-proximity-v1
        * schema. The proof data (band, nonce, deviceSig) is committed into a
        * deterministic contentRef and submitted as a separate standard attestation.
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
            contentRef: encodeProximityProofRef(proof),
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
