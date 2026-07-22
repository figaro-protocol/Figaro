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
    type SwapFundingLeg,
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
    type SwapConfirmationDetails,
} from "@/lib/checkout/orderPreview";
import { shareSignedOrder } from "@/lib/checkout/orderSignedAndShared";
import { relayRacePayload } from "@/lib/checkout/dispatchRace";
import { buildCounterDraft, validateDraft, type CommitmentPayload } from "@figaro/sdk/agent";
import { commitSignedOrder } from "@/lib/kernel/orderCommitted";
import { commitmentOrderHash } from "@/lib/kernel/signedCommitment";
import { quoteFundingLeg, signFundingLeg } from "@/lib/composition/swapFunding";
import { useSwapAndCommitActions } from "@/lib/composition/useSwapAndCommitActions";

/** The buyer's checkout-time choice to fund their bond by swap: which
 *  accepted token to fund from. Threaded through the sign step so EVERY
 *  payload the checkout produces (root and sub-orders alike) carries its own
 *  witness-signed leg. */
export interface BuyerFundingRequest {
    inputToken: Hex;
}

/** The seller's accept-time choice to fund their bond by swap: which token
 *  to on-ramp from into the process denomination. Built and witness-signed
 *  at accept, riding the same atomic `swapAndCommit`. */
export interface SellerFundingRequest {
    inputToken: Hex;
}

export type OrderFlowStep =
    | "idle"
    | "signing"
    | "sharing"
    | "awaiting-seller"
    /** A race candidate countersigned an unsigned draft and returned it — now
     *  awaiting the buyer's selection (the buyer signs exactly one winner). */
    | "awaiting-buyer"
    | "committing"
    | "done"
    | "error";

/** Project a funding quote to the confirm-gate's swap summary (null passes
 *  through — no swap leg, no swap section in the modal). */
function swapDetails(
    quote: { inputToken: string; currency: string; maxInput: bigint } | null,
): SwapConfirmationDetails | null {
    if (!quote) return null;
    return { inputToken: quote.inputToken, currency: quote.currency, maxInput: quote.maxInput };
}

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
        swap: SwapConfirmationDetails | null = null,
    ): Promise<Hex> => {
        assertSigningDomain(CONTRACTS.core, chainId);
        // Layer A — the FULL gate at the sign step, so no caller can bypass
        // it: every section conforms to its clause spec AND the agreement's
        // recomputed merkle root equals the hash being signed. The /orders
        // accept card, /sign, and the buyer's checkout sign all route through
        // here — both sides of the bilateral commit get the same check.
        assertAgreementSignable(agreement, commitment.agreementHash, specSource());
        // When the bond is swap-funded, `swap` surfaces the leg's maxInput in
        // the SAME confirm — one approval covers the commitment sign AND the
        // Permit2 witness sign the caller does right after.
        const approved = await requestSignConfirmation(commitment, agreement, swap);
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
            // The buyer's optional swap-funded bond leg is QUOTED before the
            // sign so its maxInput rides into the SAME confirm as the agreement
            // (one approval, both signatures); it is then witness-signed against
            // that exact quote so the relayer is untrusted by construction.
            let fundingQuote: Awaited<ReturnType<typeof quoteFundingLeg>> | null = null;
            if (funding) {
                if (!publicClient) throw new Error("No chain connection — cannot quote the funding swap.");
                fundingQuote = await quoteFundingLeg({
                    publicClient,
                    chainId,
                    inputToken: funding.inputToken,
                    currency: preview.commitment.currency as Hex,
                    // calculateBonds(cumulativeValue, payment) — the buyer
                    // bond is 2×payment; on a SUB-ORDER ecv ≠ payment, so the
                    // arg order is load-bearing (a swap here mis-quotes the
                    // kernel's pull and swapAndCommit reverts at simulate).
                    bondAmount: calculateBonds(
                        preview.commitment.expectedCumulativeValue,
                        preview.commitment.payment,
                    ).buyerBond,
                    deadline: preview.commitment.deadline,
                });
            }
            const buyerSig = await signAs(preview.commitment, preview.agreement, swapDetails(fundingQuote));
            const buyerFunding: CommitmentPayload["buyerFunding"] = fundingQuote
                ? await signFundingLeg(fundingQuote, (typedData) => signTypedDataAsync(typedData) as Promise<Hex>)
                : undefined;
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
     * then pins + relays. Returns the signed payload now in flight. A
     * race-formed order passes the winner's countersignature via
     * `opts.sellerSig` — the relayed payload then carries BOTH signatures and
     * arrives commit-ready on the winner's surface.
     */
    const signAndShare = useCallback(async (
        preview: OrderPreview,
        funding?: BuyerFundingRequest,
        opts?: { sellerSig?: Hex },
    ): Promise<CommitmentPayload> => {
        if (!address) throw new Error("Connect a wallet first.");
        const signed = await signCommitment(preview, funding);
        const payload = opts?.sellerSig ? { ...signed, sellerSig: opts.sellerSig } : signed;
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
    // leg — or an accept carrying the seller's — goes through the
    // coordinator's `swapAndCommit` (which swaps, funds each party in-place,
    // then calls the kernel); everything else goes straight to the kernel's
    // `commit`. The routes are signature-bound, so either party (or anyone)
    // may safely broadcast the funded form.
    const broadcasterFor = useCallback((payload: CommitmentPayload, sellerFunding?: SwapFundingLeg) => {
        const buyerFunding = payload.buyerFunding;
        if (buyerFunding?.enabled || sellerFunding?.enabled) {
            return (c: Commitment, buyerSig: Hex, sellerSig: Hex) =>
                swapAndCommit(c, buyerSig, sellerSig,
                    buyerFunding?.enabled ? buyerFunding : undefined,
                    sellerFunding?.enabled ? sellerFunding : undefined);
        }
        return commit;
    }, [commit, swapAndCommit]);

    /**
     * COUNTER-PARTY side (usually the seller): an incoming pending payload →
     * counter-sign → broadcast on-chain. The bond is already approved (the page
     * gated this on `useTokenApproval`). A seller short of the process
     * denomination may pass `funding` — their swap-funded bond leg is quoted,
     * route-built, and witness-signed here at accept, then rides the same
     * atomic `swapAndCommit`. Returns the tx hash.
     */
    const acceptOrder = useCallback(async (
        incoming: CommitmentPayload,
        funding?: SellerFundingRequest,
    ): Promise<Hex> => {
        setError(null);
        try {
            const role: PartyRole = hexEqual(address, incoming.commitment.buyer) ? "buyer" : "seller";

            setStep("signing");
            // The seller's optional on-ramp is quoted before the sign so its
            // maxInput shows in the same confirm as the agreement.
            // 2·expectedCumulativeValue is the kernel's seller pull.
            let sellerQuote: Awaited<ReturnType<typeof quoteFundingLeg>> | null = null;
            if (funding && role === "seller") {
                if (!publicClient) throw new Error("No chain connection — cannot quote the funding swap.");
                sellerQuote = await quoteFundingLeg({
                    publicClient,
                    chainId,
                    inputToken: funding.inputToken,
                    currency: incoming.commitment.currency as Hex,
                    // calculateBonds(cumulativeValue, payment) — the seller
                    // bond is 2×expectedCumulativeValue (the kernel's seller
                    // pull); on a SUB-ORDER ecv ≠ payment, so arg order matters.
                    bondAmount: calculateBonds(
                        incoming.commitment.expectedCumulativeValue,
                        incoming.commitment.payment,
                    ).sellerBond,
                    deadline: incoming.commitment.deadline,
                });
            }
            const sig = await signAs(incoming.commitment, incoming.agreement, swapDetails(sellerQuote));

            const payload: CommitmentPayload = {
                ...incoming,
                buyerSig: role === "buyer" ? sig : incoming.buyerSig,
                sellerSig: role === "seller" ? sig : incoming.sellerSig,
            };

            const sellerFunding: SwapFundingLeg | undefined = sellerQuote
                ? await signFundingLeg(sellerQuote, (typedData) => signTypedDataAsync(typedData) as Promise<Hex>)
                : undefined;

            setStep("committing");
            const hash = await commitSignedOrder({
                payload,
                commit: broadcasterFor(payload, sellerFunding),
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
    }, [address, broadcasterFor, publicClient, signAs, chainId, signTypedDataAsync]);

    /**
     * CANDIDATE side (dispatch race): an inbound UNSIGNED draft → counter-sign
     * → relay the countersigned payload BACK to the buyer. NO broadcast — a
     * draft cannot be broadcast (the buyer's signature does not exist yet),
     * which is exactly why countersigning first is safe: the countersignature
     * is the candidate's availability answer, binding only if the buyer
     * commits this struct before its deadline. The SDK's draft gate rejects a
     * tampered draft — and a payload that already carries a buyer signature
     * (that is an offer; it accepts through `acceptOrder`). Signing runs the
     * SAME Layer-A + confirm gate as every other signature. The bond is
     * already approved (the page gated this) — being committed later pulls it.
     */
    const counterSignAndReturn = useCallback(async (
        incoming: CommitmentPayload,
    ): Promise<CommitmentPayload> => {
        if (!address) throw new Error("Connect a wallet first.");
        setError(null);
        try {
            const check = validateDraft(incoming, address);
            if (!check.ok) throw new Error(`Refusing this draft — ${check.reason}`);
            setStep("signing");
            const sellerSig = await signAs(incoming.commitment, incoming.agreement);
            const returned: CommitmentPayload = { ...incoming, sellerSig };
            setStep("sharing");
            await relayRacePayload({
                payload: returned,
                recipientAddress: incoming.commitment.buyer,
                senderAddress: address,
                walletClient: walletClient ?? null,
                chainId,
                coordinationMessaging: services.coordinationMessaging,
                evidenceTransport: services.evidenceTransport,
            });
            setStep("awaiting-buyer");
            return returned;
        } catch (e: unknown) {
            setError(extractErrorMessage(e, "Counter-sign failed"));
            setStep("error");
            throw e;
        }
    }, [address, signAs, chainId, walletClient, services]);

    /**
     * CANDIDATE side (RFQ): an inbound QUOTE REQUEST → the person names their
     * price → counter-draft at that figure → counter-sign → relay back. The
     * human entering the quote IS the pricing function, and the sign step's
     * Layer-A + confirm gate (rendering the QUOTED agreement) replaces the
     * autonomous floors — exactly as accept does. The counter-draft is built
     * through the SDK's shared substitution, so the buyer's reconstruction
     * reproduces it hash-for-hash; a quote above the buyer's ceiling (the
     * request's payment) or below the payment floor refuses before signing.
     */
    const quoteAndReturn = useCallback(async (
        incoming: CommitmentPayload,
        quotedPayment: bigint,
    ): Promise<CommitmentPayload> => {
        if (!address) throw new Error("Connect a wallet first.");
        setError(null);
        try {
            const check = validateDraft(incoming, address);
            if (!check.ok) throw new Error(`Refusing this draft — ${check.reason}`);
            const terms = incoming.quoteRequest;
            if (!terms || terms.pricedFields.length === 0) {
                throw new Error("This draft carries no quote request — counter-sign it instead.");
            }
            if (quotedPayment < 1n) throw new Error("A quote must be at least 1 unit.");
            if (quotedPayment > incoming.commitment.payment) {
                throw new Error("Your quote is above the buyer's ceiling — they asked for at most the figure shown.");
            }
            const counter = buildCounterDraft(incoming, terms, quotedPayment);
            setStep("signing");
            const sellerSig = await signAs(counter.commitment, counter.agreement);
            const returned: CommitmentPayload = { commitment: counter.commitment, agreement: counter.agreement, sellerSig };
            setStep("sharing");
            await relayRacePayload({
                payload: returned,
                recipientAddress: incoming.commitment.buyer,
                senderAddress: address,
                walletClient: walletClient ?? null,
                chainId,
                coordinationMessaging: services.coordinationMessaging,
                evidenceTransport: services.evidenceTransport,
                // A quote is a DIFFERENT struct than the request (the whole
                // point) — it answers on the REQUEST's conversation id, where
                // the buyer is listening.
                threadOrderId: commitmentOrderHash(incoming.commitment, chainId),
            });
            setStep("awaiting-buyer");
            return returned;
        } catch (e: unknown) {
            setError(extractErrorMessage(e, "Quote failed"));
            setStep("error");
            throw e;
        }
    }, [address, signAs, chainId, walletClient, services]);

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
        counterSignAndReturn,
        quoteAndReturn,
        commitOrder,
        reset,
    } as const;
}
