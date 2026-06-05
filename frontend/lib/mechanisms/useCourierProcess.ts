"use client";

import { useCallback } from "react";
import { encodeAbiParameters, keccak256, stringToHex, type Hex } from "viem";
import { embeddedSpec, encodeContentFromSpec, type CourierEvent } from "@figaro/core/clauses";
import { useAttestationCoordinatorActions } from "@/lib/mechanisms/useAttestationCoordinatorActions";
import { COURIER_PROCESS_CLAUSE_KEY, PROXIMITY_PROOF_CLAUSE_KEY } from "@/lib/core/agreement";
import { clauseEnumOrdinal } from "@/lib/shared/clauseSpecSource";

/**
 * Sovereign courier event log — `figaro-courier-process-v1`. The courier
 * (= seller of a buyer-courier sub-order) attests their internal lifecycle
 * events under this clause. The event log is the courier's SSoT for "what
 * the courier has done" — Class B (discretionary attestation) per Paper E.
 *
 * Mirror of `useMerchantProcess.ts` for the courier role. Both clauses are
 * Category-1 (no committed clause) — content is supplied at runtime as
 * `(uint8 eventType, string evidenceUri)`.
 *
 * The courier-process section must be present in the signed agreement
 * assemblyDoc for the on-chain inclusion proof to open. (Auto-anchor wiring
 * for courier sub-orders is the auto-anchor symmetry fix tracked separately
 * — `buildOrderAgreement` today anchors merchant-process unconditionally.)
 */
export const COURIER_PROCESS_CLAUSE_ID = keccak256(stringToHex(COURIER_PROCESS_CLAUSE_KEY));

/** keccak256 of the runtime proximity-proof clauseId. Derived here for
 *  courier callers; the key itself lives canonically in agreement module. */
export const PROXIMITY_CLAUSE_ID = keccak256(stringToHex(PROXIMITY_PROOF_CLAUSE_KEY));

/** ProximityTypes.Proof struct matching the Solidity ABI. Re-exported here so
 *  callers can use the courier hook without depending on the legacy
 *  on the merchant-process module. */
export interface ProximityProof {
    /** 0=None, 1=Zone(WiFi), 2=Nearby(BLE), 3=Contact(NFC), 4=Visual(QR) */
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

export interface CourierSignalInput {
    orderHash: string;
    eventType: CourierEvent;
    evidenceUri?: string;
    /** Optional — defaults to `orderHash` for same-order attestation. */
    roleOrderHash?: string;
}

export interface CourierSignalWithProofInput extends CourierSignalInput {
    proof: ProximityProof;
}

export function useCourierProcessActions() {
    const {
        submitSellerAttestation,
        isPending,
        isConfirming,
        isSuccess,
        error,
        isAvailable,
    } = useAttestationCoordinatorActions();

    const signal = useCallback(async ({
        orderHash,
        eventType,
        evidenceUri,
        roleOrderHash,
    }: CourierSignalInput) => {
        return submitSellerAttestation({
            roleOrderHash: roleOrderHash as Hex | undefined,
            orderHash: orderHash as Hex,
            clauseId: COURIER_PROCESS_CLAUSE_ID,
            stage: clauseEnumOrdinal(COURIER_PROCESS_CLAUSE_KEY, eventType),
            content: encodeContentFromSpec(
                embeddedSpec("figaro-courier-process-v1")!,
                { eventType, evidenceUri },
            ),
            failureMessage: `Courier ${eventType} attestation failed`,
        });
    }, [submitSellerAttestation]);

    /**
     * Send a courier-process attestation paired with a proximity-proof
     * attestation. Used at the two handoff edges (arrived-pickup,
     * arrived-dropoff / completed) where on-chain proximity evidence is
     * required in addition to the role-event log entry.
     *
     * The proximity-proof attestation fires first; on success the
     * role-event attestation follows. Both go through the same
     * AttestationCoordinator surface.
     */
    const signalWithProof = useCallback(async ({
        orderHash,
        eventType,
        proof,
        roleOrderHash,
    }: CourierSignalWithProofInput) => {
        await submitSellerAttestation({
            roleOrderHash: roleOrderHash as Hex | undefined,
            orderHash: orderHash as Hex,
            clauseId: PROXIMITY_CLAUSE_ID,
            stage: proof.band,
            content: encodeProximityProofContent(proof),
            failureMessage: "Proximity proof submission failed",
        });

        return signal({ orderHash, eventType, roleOrderHash });
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
