"use client";

import { useCallback } from "react";
import { keccak256, stringToHex, type Hex } from "viem";
import { embeddedSpec, encodeContentFromSpec, type MerchantEvent } from "@figaro/core/clauses";
import { useAttestationCoordinatorActions } from "@/lib/mechanisms/useAttestationCoordinatorActions";
import { MERCHANT_PROCESS_CLAUSE_KEY } from "@/lib/core/agreementManifest";
import {
    encodeProximityProofContent,
    PROXIMITY_CLAUSE_ID,
    type ProximityProof,
} from "@/lib/mechanisms/useCourierProcess";

/**
 * Sovereign merchant event log — `figaro-merchant-process-v1`. The merchant
 * (= seller of a buyer-merchant order) attests their internal lifecycle
 * events under this clause. The event log is the merchant's SSoT for "what
 * the merchant has done" — Class B (discretionary attestation) per Paper E.
 *
 * Mirror of `useCourierProcess.ts` for the courier role. Both clauses are
 * Category-1 (no committed clause) — content is supplied at runtime as
 * `(uint8 eventType, string evidenceUri)`.
 *
 * The merchant-process section must be present in the signed agreement
 * manifest for the on-chain inclusion proof to open. `buildOrderAgreement`
 * appends it by default whenever a fulfilment section is present (the
 * seller will be acting as a merchant).
 */
export const MERCHANT_PROCESS_CLAUSE_ID = keccak256(stringToHex(MERCHANT_PROCESS_CLAUSE_KEY));

/** uint8 stage values matching the `figaro-merchant-process-v1` enum. */
const MERCHANT_EVENT_STAGE: Record<MerchantEvent, number> = {
    "order-received": 0,
    "accepted": 1,
    "prep-started": 2,
    "ready-for-pickup": 3,
    "handed-off": 4,
    "cancelled": 5,
};

export interface MerchantSignalInput {
    orderHash: string;
    eventType: MerchantEvent;
    evidenceUri?: string;
    /** Optional — defaults to `orderHash` for same-order attestation. */
    roleOrderHash?: string;
}

export interface MerchantSignalWithProofInput {
    /** The merchant's own order — this is BOTH the role (auth) AND the
     *  target for the merchant-process event. */
    merchantOrderHash: string;
    /** The courier's order — target for the proximity-proof attestation.
     *  The merchant's role-order is the auth side; the inclusion proof opens
     *  against the courier's manifest, which carries the proximity-proof clause. */
    proximityTargetOrderHash: string;
    /** Merchant-process event paired with the proof — typically `handed-off`,
     *  the lifecycle moment that coincides with the merchant→courier pickup. */
    eventType: MerchantEvent;
    proof: ProximityProof;
}

export function useMerchantProcessActions() {
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
    }: MerchantSignalInput) => {
        return submitSellerAttestation({
            roleOrderHash: roleOrderHash as Hex | undefined,
            orderHash: orderHash as Hex,
            clauseId: MERCHANT_PROCESS_CLAUSE_ID,
            stage: MERCHANT_EVENT_STAGE[eventType],
            content: encodeContentFromSpec(
                embeddedSpec("figaro-merchant-process-v1")!,
                { eventType, evidenceUri },
            ),
            failureMessage: `Merchant ${eventType} attestation failed`,
        });
    }, [submitSellerAttestation]);

    /**
     * Cross-witness the merchant→courier pickup. Pairs a proximity-proof
     * attestation (target = courier's order, role = merchant's order — the
     * inclusion proof opens against the courier's manifest, which already
     * carries the proximity-proof clause) with the merchant's own
     * lifecycle event (typically `handed-off`, target = merchant's order).
     *
     * Two on-chain attestations result: one under proximity-proof-v1 on
     * the courier's order with the merchant as attester, one under
     * merchant-process-v1 on the merchant's order. Off-chain consumers
     * see both witnesses at the pickup edge — merchant's and courier's.
     */
    const signalWithProof = useCallback(async ({
        merchantOrderHash,
        proximityTargetOrderHash,
        eventType,
        proof,
    }: MerchantSignalWithProofInput) => {
        await submitSellerAttestation({
            roleOrderHash: merchantOrderHash as Hex,
            orderHash: proximityTargetOrderHash as Hex,
            clauseId: PROXIMITY_CLAUSE_ID,
            stage: proof.band,
            content: encodeProximityProofContent(proof),
            failureMessage: "Merchant proximity proof submission failed",
        });

        return signal({ orderHash: merchantOrderHash, eventType });
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
