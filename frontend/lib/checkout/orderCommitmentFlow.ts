"use client";

/**
 * orderCommitmentFlow.ts — the SIGN step of the order flow (+ share / commit).
 *
 * Preview and APPROVE happen first and TOGETHER, OUTSIDE this hook: the page
 * builds the preview (the SDK walk (assemblyCheckout)) and approves the bond via
 * `useTokenApproval`, wired beside the preview so the approval can never be
 * forgotten. This hook owns only the deliberate SIGN step that follows, plus
 * the share / commit it leads into:
 *
 *   buyer:  signAndShare(preview) → sign → relay to the seller
 *   seller: acceptOrder(payload)  → sign → broadcast on-chain
 *
 * It owns the EIP-712 domain and the confirm gate — before every sign, and
 * before the standalone commit broadcast (`commitOrder`). It does NOT approve
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
    calculateBonds,
    type Agreement,
    type Commitment,
    type Hex,
} from "@figaro/sdk";
import { CONTRACTS } from "@/lib/kernel/contracts";
import { assertAgreementSignable } from "@figaro/sdk";
import { specSource } from "@/lib/shared/clauseSpecSource";
import { useFigaroActions } from "@/lib/kernel/useFigaroActions";
import { useRuntimeServices } from "@/lib/shared/runtimeServicesContext";
import { hexEqual, isValidAddress, ZERO_ADDRESS } from "@/lib/shared/evm";
import { extractErrorMessage } from "@/lib/shared/errors";
import type { PartyRole } from "@/lib/kernel/walletProcessQueries";
import {
    requestSignConfirmation,
    requestCommitConfirmation,
    type OrderPreview,
} from "@/lib/checkout/orderPreview";
import { shareSignedOrder } from "@/lib/checkout/orderSignedAndShared";
import type { CommitmentPayload } from "@figaro/sdk/agent";
import { commitSignedOrder } from "@/lib/kernel/orderCommitted";
import { buildBuyerFundingLeg } from "@/lib/composition/swapFunding";
import { useSwapAndCommitActions } from "@/lib/composition/useSwapAndCommitActions";

/** The buyer's checkout-time choice to fund their bond by swap: which
 *  accepted token to fund from. Threaded through the sign step so EVERY
 *  payload the checkout produces (root and sub-orders alike) carries its own
 *  witness-signed leg. */
export interface BuyerFundingRequest {
    inputToken: Hex;
}

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
    const { swapAndCommit } = useSwapAndCommitActions();
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
        // Layer A — the FULL gate at the sign step, so no caller can bypass
        // it: every section conforms to its clause spec AND the agreement's
        // recomputed merkle root equals the hash being signed. The /orders
        // accept card, /sign, and the buyer's checkout sign all route through
        // here — both sides of the bilateral commit get the same check.
        assertAgreementSignable(agreement, commitment.agreementHash, specSource());
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
        funding?: BuyerFundingRequest,
    ): Promise<CommitmentPayload> => {
        if (!address) throw new Error("Connect a wallet first.");
        setError(null);
        try {
            setStep("signing");
            const buyerSig = await signAs(preview.commitment, preview.agreement);
            // The buyer's optional swap-funded bond leg: quoted, route-built,
            // and witness-signed HERE so it rides the payload to whoever
            // broadcasts. The route is bound into the buyer's Permit2 witness
            // signature — the relayer is untrusted by construction.
            let buyerFunding: CommitmentPayload["buyerFunding"];
            if (funding) {
                if (!publicClient) throw new Error("No chain connection — cannot quote the funding swap.");
                buyerFunding = await buildBuyerFundingLeg({
                    publicClient,
                    chainId,
                    inputToken: funding.inputToken,
                    currency: preview.commitment.currency as Hex,
                    bondAmount: calculateBonds(
                        preview.commitment.payment,
                        preview.commitment.expectedCumulativeValue,
                    ).buyerBond,
                    deadline: preview.commitment.deadline,
                    signTypedData: (typedData) => signTypedDataAsync(typedData) as Promise<Hex>,
                });
            }
            setStep("awaiting-seller");
            return {
                commitment: preview.commitment,
                agreement: preview.agreement,
                buyerSig,
                ...(buyerFunding ? { buyerFunding } : {}),
            };
        } catch (e: unknown) {
            setError(extractErrorMessage(e, "Order failed"));
            setStep("error");
            throw e;
        }
    }, [address, signAs, publicClient, chainId, signTypedDataAsync]);

    /**
     * BUYER side: sign the previewed order and relay it to the seller — sign +
     * share in one step (the XMTP auto-relay path). Composes `signCommitment`
     * then pins + relays. Returns the signed payload now in flight.
     */
    const signAndShare = useCallback(async (
        preview: OrderPreview,
        funding?: BuyerFundingRequest,
    ): Promise<CommitmentPayload> => {
        if (!address) throw new Error("Connect a wallet first.");
        const payload = await signCommitment(preview, funding);
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

    // Broadcast routing: a payload carrying a witness-signed buyer funding
    // leg goes through the coordinator's `swapAndCommit` (which swaps, funds
    // the buyer in-place, then calls the kernel); every other payload goes
    // straight to the kernel's `commit`. The route is signature-bound, so
    // either party (or anyone) may safely broadcast the funded form.
    const broadcasterFor = useCallback((payload: CommitmentPayload) => {
        const funding = payload.buyerFunding;
        if (funding?.enabled) {
            return (c: Commitment, buyerSig: Hex, sellerSig: Hex) =>
                swapAndCommit(c, buyerSig, sellerSig, funding);
        }
        return commit;
    }, [commit, swapAndCommit]);

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
                commit: broadcasterFor(payload),
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
    }, [address, broadcasterFor, publicClient, signAs]);

    /**
     * Broadcast an ALREADY fully-signed payload — no signature added. For the
     * case where both signatures are present and anyone may submit it on-chain.
     *
     * Gated like the sign step: Layer A first (a payload whose inline agreement
     * doesn't merkle to the signed agreementHash is never broadcast — the chain
     * can't check it, so this is the last integrity gate), then the same
     * review-before-commit confirmation the sign step uses.
     */
    const commitOrder = useCallback(async (
        payload: CommitmentPayload,
    ): Promise<Hex> => {
        setError(null);
        try {
            assertAgreementSignable(
                payload.agreement,
                payload.commitment.agreementHash,
                specSource(),
            );
            const approved = await requestCommitConfirmation(
                payload.commitment,
                payload.agreement,
            );
            if (!approved) throw new Error("Commit cancelled by user.");
            setStep("committing");
            const hash = await commitSignedOrder({
                payload,
                commit: broadcasterFor(payload),
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
    }, [broadcasterFor, publicClient]);

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
