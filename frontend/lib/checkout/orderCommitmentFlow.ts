"use client";

/**
 * orderCommitmentFlow.ts — the SIGN step of the order flow (+ share / commit).
 *
 * Preview and APPROVE happen first and TOGETHER, OUTSIDE this hook: the page
 * builds the preview (orderPreview.buildOrderPreview) and approves the bond via
 * `useTokenApproval`, wired beside the preview so the approval can never be
 * forgotten. This hook owns only the deliberate SIGN step that follows, plus
 * the share / commit it leads into:
 *
 *   buyer:  signAndShare(preview) → sign → relay to the seller
 *   seller: acceptOrder(payload)  → sign → broadcast on-chain
 *
 * It owns the EIP-712 domain and the pre-sign confirm gate. It does NOT approve
 * — that is `useTokenApproval`'s job, wired beside the preview.
 */
import { useCallback, useState } from "react";
import {
    useAccount,
    useChainId,
    usePublicClient,
    useWalletClient,
    useSignTypedData,
} from "wagmi";
import {
    COMMITMENT_TYPES,
    buildDomain,
    type Agreement,
    type Commitment,
    type Hex,
} from "@figaro/core";
import { CONTRACTS } from "@/lib/core/contracts";
import { useFigaroActions } from "@/lib/core/useFigaroActions";
import { useRuntimeServices } from "@/lib/shared/runtimeServicesContext";
import { hexEqual, isValidAddress, ZERO_ADDRESS } from "@/lib/shared/evm";
import { extractErrorMessage } from "@/lib/shared/errors";
import type { PartyRole } from "@/lib/core/walletProcessQueries";
import { requestSignConfirmation, type OrderPreview } from "@/lib/checkout/orderPreview";
import { shareSignedOrder } from "@/lib/checkout/orderSignedAndShared";
import type { CommitmentPayload } from "@/lib/core/signedCommitment";
import { commitSignedOrder } from "@/lib/core/orderCommitted";

export type OrderFlowStep =
    | "idle"
    | "signing"
    | "sharing"
    | "awaiting-seller"
    | "committing"
    | "done"
    | "error";

function assertSigningDomain(core: string | undefined, chainId: number): asserts core is `0x${string}` {
    if (!core || core === ZERO_ADDRESS || !isValidAddress(core)) {
        throw new Error(
            "Refusing to sign: FigaroCore address is missing or invalid. " +
            "Check NEXT_PUBLIC_FIGARO_CORE in your environment.",
        );
    }
    if (!chainId) {
        throw new Error("Refusing to sign: no chain detected. Connect a wallet first.");
    }
}

export function useOrderCommitmentFlow() {
    const { address } = useAccount();
    const chainId = useChainId();
    const publicClient = usePublicClient();
    const { data: walletClient } = useWalletClient();
    const { signTypedDataAsync } = useSignTypedData();
    const { commit } = useFigaroActions();
    const services = useRuntimeServices();

    const [step, setStep] = useState<OrderFlowStep>("idle");
    const [error, setError] = useState<string | null>(null);

    const reset = useCallback(() => {
        setStep("idle");
        setError(null);
    }, []);

    // ── Sign a commitment (gated by the confirm preview) ──
    const signAs = useCallback(async (
        commitment: Commitment,
        agreement: Agreement,
    ): Promise<Hex> => {
        assertSigningDomain(CONTRACTS.core, chainId);
        const approved = await requestSignConfirmation(commitment, agreement);
        if (!approved) throw new Error("Signing cancelled by user.");
        const sig = await signTypedDataAsync({
            domain: buildDomain(chainId, CONTRACTS.core),
            types: COMMITMENT_TYPES,
            primaryType: "Commitment",
            message: {
                processId: commitment.processId,
                buyer: commitment.buyer,
                seller: commitment.seller,
                currency: commitment.currency,
                payment: commitment.payment,
                expectedCumulativeValue: commitment.expectedCumulativeValue,
                agreementHash: commitment.agreementHash,
                salt: commitment.salt,
                deadline: commitment.deadline,
            },
        });
        return sig as Hex;
    }, [chainId, signTypedDataAsync]);

    /**
     * BUYER side: sign the previewed order WITHOUT relaying it. Returns the
     * signed payload so the caller chooses the transport (the share panel's
     * XMTP / QR / copy). The sign goes through the SAME confirm gate as every
     * other order — there is no bypass. The bond is already approved (the page
     * gated this on the approval flow before calling).
     */
    const signCommitment = useCallback(async (
        preview: OrderPreview,
    ): Promise<CommitmentPayload> => {
        if (!address) throw new Error("Connect a wallet first.");
        setError(null);
        try {
            setStep("signing");
            const buyerSig = await signAs(preview.commitment, preview.agreement);
            setStep("awaiting-seller");
            return {
                commitment: preview.commitment,
                agreement: preview.agreement,
                buyerSig,
            };
        } catch (e: unknown) {
            setError(extractErrorMessage(e, "Order failed"));
            setStep("error");
            throw e;
        }
    }, [address, signAs]);

    /**
     * BUYER side: sign the previewed order and relay it to the seller — sign +
     * share in one step (the XMTP auto-relay path). Composes `signCommitment`
     * then pins + relays. Returns the signed payload now in flight.
     */
    const signAndShare = useCallback(async (
        preview: OrderPreview,
    ): Promise<CommitmentPayload> => {
        if (!address) throw new Error("Connect a wallet first.");
        const payload = await signCommitment(preview);
        setError(null);
        try {
            setStep("sharing");
            await shareSignedOrder({
                payload,
                recipientAddress: preview.commitment.seller,
                senderAddress: address,
                walletClient: walletClient ?? null,
                chainId,
                coordinationMessaging: services.coordinationMessaging,
                evidenceTransport: services.evidenceTransport,
            });

            setStep("awaiting-seller");
            return payload;
        } catch (e: unknown) {
            setError(extractErrorMessage(e, "Order failed"));
            setStep("error");
            throw e;
        }
    }, [address, chainId, walletClient, services, signCommitment]);

    /**
     * COUNTER-PARTY side (usually the seller): an incoming pending payload →
     * counter-sign → broadcast on-chain. The bond is already approved (the page
     * gated this on `useTokenApproval`). Returns the tx hash.
     */
    const acceptOrder = useCallback(async (
        incoming: CommitmentPayload,
    ): Promise<Hex> => {
        setError(null);
        try {
            const role: PartyRole = hexEqual(address, incoming.commitment.buyer) ? "buyer" : "seller";

            setStep("signing");
            const sig = await signAs(incoming.commitment, incoming.agreement);

            const payload: CommitmentPayload = {
                ...incoming,
                buyerSig: role === "buyer" ? sig : incoming.buyerSig,
                sellerSig: role === "seller" ? sig : incoming.sellerSig,
            };

            setStep("committing");
            const hash = await commitSignedOrder({
                payload,
                commit,
                publicClient,
                waitForReceipt: true,
            });

            setStep("done");
            return hash;
        } catch (e: unknown) {
            setError(extractErrorMessage(e, "Accept failed"));
            setStep("error");
            throw e;
        }
    }, [address, commit, publicClient, signAs]);

    /**
     * Broadcast an ALREADY fully-signed payload — no signature added. For the
     * case where both signatures are present and anyone may submit it on-chain.
     */
    const commitOrder = useCallback(async (
        payload: CommitmentPayload,
    ): Promise<Hex> => {
        setError(null);
        try {
            setStep("committing");
            const hash = await commitSignedOrder({
                payload,
                commit,
                publicClient,
                waitForReceipt: true,
            });
            setStep("done");
            return hash;
        } catch (e: unknown) {
            setError(extractErrorMessage(e, "Commit failed"));
            setStep("error");
            throw e;
        }
    }, [commit, publicClient]);

    return {
        step,
        error,
        signCommitment,
        signAndShare,
        acceptOrder,
        commitOrder,
        reset,
    } as const;
}
