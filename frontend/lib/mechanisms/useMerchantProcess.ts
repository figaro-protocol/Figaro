"use client";

import { useCallback } from "react";
import { keccak256, stringToHex, type Hex } from "viem";
import { encodeMerchantContent, type MerchantEvent } from "@figaro/core/schemas";
import { useAttestationCoordinatorActions } from "@/lib/mechanisms/useAttestationCoordinatorActions";
import { MERCHANT_PROCESS_SCHEMA_KEY } from "@/lib/core/agreementManifest";

/**
 * Sovereign merchant event log — `figaro-merchant-process-v1`. The merchant
 * (= seller of a buyer-merchant order) attests their internal lifecycle
 * events under this schema. The event log is the merchant's SSoT for "what
 * the merchant has done" — Class B (discretionary attestation) per Paper E.
 *
 * Mirrors `useDeliveryLifecycle.ts` for the courier/delivery-lifecycle
 * surface. Both schemas are Category-1 (no committed clause) — content is
 * supplied at runtime as `(uint8 eventType, string evidenceUri)`.
 *
 * The merchant-process section must be present in the signed agreement
 * manifest for the on-chain inclusion proof to open. `buildOrderAgreement`
 * appends it by default whenever a fulfilment section is present (the
 * seller will be acting as a merchant).
 */
export const MERCHANT_PROCESS_SCHEMA_ID = keccak256(stringToHex(MERCHANT_PROCESS_SCHEMA_KEY));

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
            schemaId: MERCHANT_PROCESS_SCHEMA_ID,
            stage: MERCHANT_EVENT_STAGE[eventType],
            content: encodeMerchantContent({ eventType, evidenceUri }),
            failureMessage: `Merchant ${eventType} attestation failed`,
        });
    }, [submitSellerAttestation]);

    return {
        signal,
        isPending,
        isConfirming,
        isSuccess,
        error,
        isAvailable,
    };
}
