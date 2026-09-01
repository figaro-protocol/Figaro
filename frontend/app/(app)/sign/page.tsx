"use client";

/**
 * /sign — Counter-sign an incoming commitment.
 *
 * The initiating party (typically the buyer) shares a serialized
 * CommitmentPayload via QR or clipboard. The counter-party opens
 * this page, pastes the payload, reviews the terms, counter-signs
 * with their wallet, and broadcasts the fully-signed commitment.
 */

import { Suspense, useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useAccount, useReadContract, useWalletClient } from "wagmi";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { deriveSignState } from "@/lib/checkout/signState";
import { useOrderCommitmentFlow } from "@/lib/checkout/orderCommitmentFlow";
import {
    deserializeCommitmentPayload,
    type CommitmentPayload,
} from "@figaro-protocol/sdk/agent";
import { ZERO_ADDRESS, hexEqual } from "@/lib/shared/evm";
import { useTokenSymbol } from "@/hooks/useTokenSymbol";
import { extractErrorMessage } from "@/lib/shared/errors";
import { validateCommitmentAgreement } from "@figaro-protocol/sdk";
import { specSource } from "@/lib/shared/clauseSpecSource";
import { TokenApprovalFlow } from "@/components/runtime/TokenApprovalFlow";
import { SwapFundingPanel } from "@/app/(app)/s/checkout/_components/SwapFundingPanel";
import { resolveSwapFundingContracts } from "@/lib/composition/swapFunding";
import useTokenApproval from "@/hooks/useTokenApproval";
import { ERC20_ABI } from "@/lib/kernel/contracts";
import { useMemberProfile } from "@/lib/member/useMembersRegistry";
import { fetchMemberProfile } from "@/lib/member/profileFetcher";
import type { MemberProfileMetadata } from "@/lib/member/memberProfileMetadata";
import { AgreementReview } from "@/components/runtime/AgreementReview";
import useTokenDecimals from "@/hooks/useTokenDecimals";
import useProcessResolveCapacity from "@/hooks/useProcessResolveCapacity";
import { formatToken, parseToken } from "@/lib/shared/utils";
import { maxUint256 } from "viem";
import { useRuntimeServices } from "@/lib/shared/runtimeServicesContext";
import { MAX_COMMITMENT_PAYLOAD_BYTES } from "@figaro-protocol/sdk/agent";
import { truncateHex } from "@/lib/shared/formatHex";

type ChannelStatus = "idle" | "listening" | "received" | "error";

function SignPageContent() {
    const { address } = useAccount();
    const { data: walletClient } = useWalletClient();
    const searchParams = useSearchParams();
    const { handoffMessaging, evidenceTransport } = useRuntimeServices();
    const { acceptOrder, counterSignAndReturn, quoteAndReturn, commitOrder, step, error: commitError, reset } = useOrderCommitmentFlow();
    const hydratedPayloadRef = useRef<string | null>(null);
    const receivedTransportOrderIdsRef = useRef<Set<string>>(new Set());

    const [rawInput, setRawInput] = useState("");
    const [parsed, setParsed] = useState<CommitmentPayload | null>(null);
    const [parseError, setParseError] = useState<string | null>(null);
    const [approvalDone, setApprovalDone] = useState(false);
    const [channelStatus, setChannelStatus] = useState<ChannelStatus>("idle");
    const [channelError, setChannelError] = useState<string | null>(null);
    const [loadedFromChannel, setLoadedFromChannel] = useState(false);

    // Reset approval state when a new commitment is parsed
    useEffect(() => { setApprovalDone(false); }, [parsed]);

    const parseSerializedPayload = useCallback(async (serialized: string) => {
        try {
            setParseError(null);
            const p = deserializeCommitmentPayload(serialized);
            // Basic validation
            if (!p.commitment?.buyer || !p.commitment?.seller) {
                throw new Error("Invalid commitment: missing buyer or seller");
            }
            // A payload with NO signatures is a race DRAFT — the dispatch
            // race relays unsigned structs and asks for a countersignature
            // (the candidate's availability answer). Derived from signature
            // absence, never a stored flag; everything downstream branches on
            // the same derived state.
            setParsed(p);
            return p;
        } catch (e: unknown) {
            const msg = extractErrorMessage(e, "Invalid payload");
            setParseError(msg);
            setParsed(null);
            return null;
        }
    }, []);

    const handleParse = async () => {
        setLoadedFromChannel(false);
        await parseSerializedPayload(rawInput.trim());
    };

    useEffect(() => {
        const linkedPayload = searchParams.get("payload");
        if (!linkedPayload || hydratedPayloadRef.current === linkedPayload) {
            return;
        }

        hydratedPayloadRef.current = linkedPayload;
        setRawInput((current) => current || linkedPayload);
        setLoadedFromChannel(false);
        void parseSerializedPayload(linkedPayload);
    }, [parseSerializedPayload, searchParams]);

    useEffect(() => {
        const linkedPayload = searchParams.get("payload");
        if (!address || parsed || rawInput.trim() || linkedPayload) {
            return;
        }

        let cancelled = false;
        let cleanup: (() => void) | null = null;
        setChannelStatus("listening");
        setChannelError(null);

        void handoffMessaging.subscribeAnyCommitmentPayload({
            address,
            walletClient,
            callback: async (payloadJson, orderId) => {
                if (cancelled || receivedTransportOrderIdsRef.current.has(orderId)) {
                    return;
                }

                // The payload arrives INLINE over the E2E-encrypted coordination
                // channel (audit F Arm 2), not IPFS — no fetch. Cap defensively:
                // an unauthenticated inbox can deliver an oversize message.
                if (new TextEncoder().encode(payloadJson).length > MAX_COMMITMENT_PAYLOAD_BYTES) return;
                if (cancelled) return;

                // The subscription is wallet-wide and the transport may not be
                // addressed (the mock bus broadcasts) — surface only payloads
                // this wallet could ever act on: it must be a party. With the
                // dispatch race, k drafts are in flight at once, each naming a
                // different candidate; every candidate must parse THEIR draft,
                // not the first arrival.
                try {
                    const preview = deserializeCommitmentPayload(payloadJson);
                    const isParty = hexEqual(address, preview.commitment?.buyer)
                        || hexEqual(address, preview.commitment?.seller);
                    if (!isParty) return;
                } catch {
                    return;
                }

                const nextPayload = await parseSerializedPayload(payloadJson);
                if (cancelled || !nextPayload) {
                    if (!cancelled && !nextPayload) {
                        setChannelStatus("error");
                        setChannelError("Received an invalid commitment payload over XMTP.");
                    }
                    return;
                }

                receivedTransportOrderIdsRef.current.add(orderId);
                setLoadedFromChannel(true);
                setRawInput(payloadJson);
                setChannelStatus("received");
            },
        }).then((unsubscribe) => {
            if (cancelled) {
                unsubscribe();
                return;
            }

            cleanup = unsubscribe;
        }).catch((error) => {
            if (cancelled) {
                return;
            }

            setChannelStatus("error");
            setChannelError(extractErrorMessage(error, "Could not open the XMTP channel."));
        });

        return () => {
            cancelled = true;
            cleanup?.();
        };
    }, [address, handoffMessaging, evidenceTransport, parsed, parseSerializedPayload, rawInput, searchParams, walletClient]);

    const handleCounterSign = async () => {
        if (!parsed) return;
        try {
            // acceptOrder counter-signs AND broadcasts (bond already approved
            // above). A chosen funding token adds the seller's witness-signed
            // on-ramp leg — swapped into the process denomination in the same
            // atomic swapAndCommit.
            await acceptOrder(parsed, sellerFundingToken ? { inputToken: sellerFundingToken } : undefined);
        } catch {
            // Error state handled by the order commitment flow.
        }
    };

    const handleCounterSignReturn = async () => {
        if (!parsed) return;
        try {
            // A race draft: counter-sign and relay BACK to the buyer — no
            // broadcast (the buyer's signature does not exist yet). The
            // countersignature is this wallet's availability answer, binding
            // only if the buyer commits it before the struct deadline.
            const returned = await counterSignAndReturn(parsed);
            setParsed(returned);
        } catch {
            // Error state handled by the order commitment flow.
        }
    };

    // The RFQ leg: this wallet names its price under the buyer's ceiling.
    const [quotePrice, setQuotePrice] = useState("");
    const handleQuoteReturn = async () => {
        if (!parsed || !quotePrice.trim()) return;
        try {
            const returned = await quoteAndReturn(parsed, parseToken(quotePrice.trim(), tokenDecimals ?? 18));
            setParsed(returned);
        } catch {
            // Error state handled by the order commitment flow.
        }
    };

    const handleReset = () => {
        setRawInput("");
        setParsed(null);
        setParseError(null);
        setChannelStatus("idle");
        setChannelError(null);
        setLoadedFromChannel(false);
        receivedTransportOrderIdsRef.current.clear();
        reset();
    };

    const commitment = parsed?.commitment;
    // The pure half of this surface — signature-absence semantics (draft /
    // RFQ), seat discrimination, and the seat's 2× bond — lives in
    // lib/checkout/signState; this page keeps only the React-bound rest.
    const {
        isRoot, hasBuyerSig, hasSellerSig, isDraft, quoteTerms, isQuoteRequest,
        isBuyer, isSeller, needsMySignature, myBondLabel, myBondAmount,
    } = useMemo(() => deriveSignState(parsed, address), [parsed, address]);
    // Sub-orders only — the hook itself returns null for roots/zero ids.
    const processCapacity = useProcessResolveCapacity(commitment?.processId);

    // Token and bond amount for approval flow
    const approvalCurrency = commitment?.currency as `0x${string}` | undefined;
    const { decimals: tokenDecimals } = useTokenDecimals(approvalCurrency);
    const { data: currencySymbol } = useTokenSymbol(approvalCurrency ?? "");

    // SELLER-side swap funding — the on-ramp into the process denomination
    // (the buyer picked it; the seller can't have known in advance). The
    // candidate set is the seller's OWN accepted array (their social layer),
    // minus the denomination itself; available only where the swap
    // composition is configured. The witness-signed leg is built at accept.
    const swapContracts = resolveSwapFundingContracts();
    const { data: memberProfileData } = useMemberProfile(isSeller ? address : undefined);
    const [ownProfile, setOwnProfile] = useState<MemberProfileMetadata | null>(null);
    useEffect(() => {
        let cancelled = false;
        setOwnProfile(null);
        const metadataURI = memberProfileData?.[0];
        if (!metadataURI) return;
        fetchMemberProfile(metadataURI)
            .then((parsed_) => { if (!cancelled && parsed_) setOwnProfile(parsed_); })
            .catch(() => { /* absence — the funding panel simply doesn't render */ });
        return () => { cancelled = true; };
    }, [memberProfileData]);
    const sellerFundingCandidates = useMemo(
        () => (swapContracts && approvalCurrency && isSeller
            ? (ownProfile?.acceptedTokens ?? []).filter((t) => !hexEqual(t.address, approvalCurrency))
            : []),
        [swapContracts, approvalCurrency, isSeller, ownProfile],
    );
    const [sellerFundingToken, setSellerFundingToken] = useState<`0x${string}` | null>(null);
    // Progressive disclosure: the on-ramp is a TREASURY choice (which balance
    // gets locked — the denomination arrived chosen by the buyer or the pin),
    // collapsed on the common path so visibility never reads as expectation.
    // A seller SHORT of the denomination has no other way through accept, so
    // insufficiency auto-opens it.
    const [fundingOpen, setFundingOpen] = useState(false);
    const { data: myDenominationBalance } = useReadContract({
        address: approvalCurrency ?? undefined,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: address ? [address] : undefined,
        query: { enabled: !!approvalCurrency && !!address && isSeller },
    });
    const permit2SellerFunding = useTokenApproval({
        tokenAddress: sellerFundingToken ?? undefined,
        owner: isSeller ? address : undefined,
        spender: (swapContracts?.permit2 ?? ZERO_ADDRESS) as `0x${string}`,
    });
    // A seller short of the denomination has no other way through accept —
    // insufficiency auto-opens the collapsed on-ramp.
    const sellerShortOfDenomination = isSeller
        && myDenominationBalance !== undefined
        && (myDenominationBalance as bigint) < myBondAmount;
    useEffect(() => {
        if (sellerShortOfDenomination && sellerFundingCandidates.length > 0) setFundingOpen(true);
    }, [sellerShortOfDenomination, sellerFundingCandidates.length]);

    // Off-chain validation over what was pasted/relayed: does the inline agreement merkle
    // to the signed agreementHash and conform to its clause specs? Computed at
    // review time so the party isn't reading terms that aren't the ones signed;
    // the sign/commit gates re-assert this at the exit.
    const agreementCheck = useMemo(() => {
        if (!parsed?.agreement || !commitment) return null;
        return validateCommitmentAgreement(parsed.agreement, commitment.agreementHash, specSource(), commitment);
    }, [parsed, commitment]);

    return (
        <div className="max-w-lg mx-auto px-4 py-12 space-y-6">
            <h1 className="text-2xl font-bold text-ink-primary">Counter-Sign Commitment</h1>
            <p className="text-sm text-ink-body">
                This page listens for incoming commitment payloads over XMTP while your wallet is connected.
                You can still paste a payload manually or open a share link that preloads it.
            </p>

            {!parsed && !rawInput.trim() && !searchParams.get("payload") && address && (
                <Card className="p-4 space-y-2">
                    <h2 className="text-sm font-semibold text-ink-primary">Secure Channel</h2>
                    {channelStatus === "listening" && (
                        <p className="text-xs text-info-fg" data-testid="xmtp-commitment-channel-status">
                            Listening for incoming commitment payloads over XMTP…
                        </p>
                    )}
                    {channelStatus === "error" && (
                        <p className="text-xs text-warning-fg" data-testid="xmtp-commitment-channel-status">
                            {channelError ?? "Could not open the XMTP channel."}
                        </p>
                    )}
                    <p className="text-xs text-ink-muted">
                        Manual paste remains available below as a fallback.
                    </p>
                </Card>
            )}

            {/* Step 1: Paste payload */}
            {!parsed && (
                <Card className="p-4 space-y-3">
                    <label className="block text-sm font-medium text-ink-body">
                        Commitment Payload
                    </label>
                    <textarea
                        data-testid="input-commitment-payload"
                        className="w-full bg-surface border border-default rounded-lg px-3 py-2 text-ink-primary text-sm font-mono placeholder-ink-faint focus:outline-none focus:ring-2 focus:ring-focus resize-none"
                        rows={6}
                        placeholder='Paste the JSON payload here…'
                        value={rawInput}
                        onChange={(e) => setRawInput(e.target.value)}
                    />
                    {parseError && (
                        <p className="text-error-fg text-xs" data-testid="parse-error">{parseError}</p>
                    )}
                    <Button
                        onClick={handleParse}
                        disabled={!rawInput.trim()}
                        data-testid="btn-parse-payload"
                        className="w-full"
                    >
                        Review Commitment
                    </Button>
                </Card>
            )}

            {/* Step 2: Review & counter-sign */}
            {parsed && commitment && step !== "done" && step !== "awaiting-buyer" && (
                <Card className="p-4 space-y-4">
                    <h2 className="text-sm font-semibold text-ink-primary">
                        {isRoot ? "Order Commitment" : "Sub-Order Commitment"}
                    </h2>

                    {agreementCheck && !agreementCheck.ok && (
                        <div className="rounded border border-error/30 bg-error/10 px-3 py-2 text-xs text-error-fg" data-testid="sign-agreement-invalid">
                            <p className="font-semibold mb-1">
                                These terms do NOT match the signed agreementHash — do not proceed.
                            </p>
                            <ul className="list-disc pl-4 space-y-0.5">
                                {agreementCheck.issues.map((issue, i) => (
                                    <li key={i} className="break-all">
                                        {issue.clause} {issue.path}: {issue.message}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                    {agreementCheck?.ok && (
                        <p className="text-xs text-success-fg" data-testid="sign-agreement-verified">
                            ✓ Terms verified — the agreement below recomputes to the signed hash.
                        </p>
                    )}

                    <AgreementReview commitment={commitment} agreement={parsed.agreement ?? null} />

                    {/* This party's position — context the agreement itself doesn't carry */}
                    <div className="text-xs space-y-1.5 text-ink-body border-t border-default pt-3">
                        <div className="flex justify-between">
                            <span>{myBondLabel}</span>
                            <span>{formatToken(myBondAmount, tokenDecimals)} tokens</span>
                        </div>
                        {!isRoot && (
                            <div className="flex justify-between">
                                <span>Process</span>
                                <span className="font-mono">
                                    {truncateHex(commitment.processId, { head: 10, tail: 0 })}
                                </span>
                            </div>
                        )}
                        {/* Resolve-ceiling position — the countersigner sees how
                            close the process is to the chain's atomic-resolve cap
                            BEFORE bonding into it (commitment.expectedCumulativeValue
                            shows value; this shows depth). Absence = no read. */}
                        {!isRoot && processCapacity && (
                            <div className="flex justify-between" data-testid="sign-process-capacity">
                                <span>Process orders</span>
                                <span className={processCapacity.remaining <= Math.max(1, Math.floor(processCapacity.cap / 20))
                                    ? "text-warning-fg font-semibold"
                                    : undefined}>
                                    {processCapacity.activeOrderCount} / {processCapacity.cap} resolvable
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Signature status */}
                    <div className="flex gap-2 text-xs">
                        <span className={`px-2 py-0.5 rounded ${hasBuyerSig ? "bg-success/20 text-success-fg" : "bg-warning/20 text-warning-fg"}`}>
                            Buyer: {hasBuyerSig ? "Signed" : "Pending"}
                        </span>
                        <span className={`px-2 py-0.5 rounded ${hasSellerSig ? "bg-success/20 text-success-fg" : "bg-warning/20 text-warning-fg"}`}>
                            Seller: {hasSellerSig ? "Signed" : "Pending"}
                        </span>
                    </div>

                    {loadedFromChannel && (
                        <p className="text-xs text-success-fg rounded bg-success/10 border border-success/30 px-2 py-1">
                            Received via XMTP secure channel.
                        </p>
                    )}

                    {/* Warning if connected wallet is not a party */}
                    {address && !isBuyer && !isSeller && (
                        <p className="text-warning-fg text-xs bg-warning/10 border border-warning/30 rounded p-2">
                            Your connected wallet ({truncateHex(address)}) is neither the buyer nor the seller in this commitment.
                        </p>
                    )}

                    {/* Payment authorization before counter-signing */}
                    {needsMySignature && !approvalDone && approvalCurrency && (
                        <div className="space-y-2">
                            <h3 className="text-xs font-semibold text-ink-body">Payment Authorization</h3>
                            <p className="text-xs text-ink-muted">
                                Authorize the deposit for this order before signing.
                            </p>
                            <TokenApprovalFlow
                                tokenAddress={approvalCurrency}
                                requiredAmount={myBondAmount}
                                onApprovalComplete={() => setApprovalDone(true)}
                            />
                        </div>
                    )}

                    {/* SELLER on-ramp: fund the 2× bond from another of the
                        seller's own accepted tokens — the coordinator swaps it
                        into the process denomination in the same atomic
                        swapAndCommit. Optional and collapsed by default (the
                        treasury choice); auto-opened when the seller is short
                        of the denomination. Absent when unconfigured. */}
                    {needsMySignature && isSeller && sellerFundingCandidates.length > 0 && (
                        <div className="space-y-2">
                            <button
                                type="button"
                                onClick={() => {
                                    // Collapsing withdraws the choice — a closed
                                    // panel never engages a leg silently.
                                    if (fundingOpen) setSellerFundingToken(null);
                                    setFundingOpen(!fundingOpen);
                                }}
                                className="text-xs text-ink-muted underline hover:text-ink-body"
                                data-testid="seller-funding-toggle"
                            >
                                {fundingOpen ? "Bond from the order's token instead" : "Fund bond from another token"}
                            </button>
                            {fundingOpen && (
                                <SwapFundingPanel
                                    candidates={sellerFundingCandidates}
                                    party={address as `0x${string}`}
                                    currencySymbol={currencySymbol ?? ""}
                                    decimals={tokenDecimals}
                                    fundingToken={sellerFundingToken}
                                    onSelect={setSellerFundingToken}
                                    needsAuthorization={permit2SellerFunding.allowanceKnown && permit2SellerFunding.needsApproval(myBondAmount)}
                                    onAuthorize={() => permit2SellerFunding.approve(maxUint256)}
                                    isAuthorizing={permit2SellerFunding.isApprovePending || permit2SellerFunding.isApproveConfirming}
                                />
                            )}
                        </div>
                    )}

                    {/* Counter-sign button — a draft (no signatures) returns to
                        the buyer; a QUOTE REQUEST names a price first; a
                        buyer-signed order counter-signs & submits. */}
                    {needsMySignature && approvalDone && (isQuoteRequest ? (
                        <div className="space-y-2">
                            <p className="text-xs text-ink-body">
                                The buyer asks for your price — at most{" "}
                                <span className="font-semibold" data-testid="quote-ceiling">
                                    {formatToken(commitment!.payment, tokenDecimals)} {currencySymbol}
                                </span>. Your counter-signature binds you at YOUR figure
                                if the buyer commits it before the deadline.
                            </p>
                            <input
                                type="text"
                                inputMode="decimal"
                                value={quotePrice}
                                onChange={(e) => setQuotePrice(e.target.value)}
                                placeholder="Your price"
                                className="w-full rounded border border-default bg-surface px-3 py-2 text-sm text-ink-primary focus:outline-none focus:ring-2 focus:ring-focus focus:border-transparent"
                                data-testid="quote-price-input"
                            />
                            <Button
                                onClick={handleQuoteReturn}
                                disabled={step === "signing" || step === "sharing" || !address || !quotePrice.trim()}
                                data-testid="btn-quote-return"
                                className="w-full"
                            >
                                {step === "signing" ? "Signing…" : step === "sharing" ? "Returning…" : "Quote & Return"}
                            </Button>
                        </div>
                    ) : isDraft ? (
                        <Button
                            onClick={handleCounterSignReturn}
                            disabled={step === "signing" || step === "sharing" || !address}
                            data-testid="btn-counter-sign-return"
                            className="w-full"
                        >
                            {step === "signing" ? "Signing…" : step === "sharing" ? "Returning…" : "Counter-Sign & Return"}
                        </Button>
                    ) : (
                        <Button
                            onClick={handleCounterSign}
                            disabled={step === "signing" || step === "committing" || !address}
                            data-testid="btn-counter-sign"
                            className="w-full"
                        >
                            {step === "signing" ? "Signing…" : step === "committing" ? "Submitting…" : "Counter-Sign & Submit"}
                        </Button>
                    ))}

                    {/* Already signed — show broadcast button if both sigs present */}
                    {!needsMySignature && hasBuyerSig && hasSellerSig && (
                        <Button
                            onClick={() => commitOrder(parsed)}
                            disabled={step === "committing"}
                            data-testid="btn-broadcast"
                            className="w-full"
                        >
                            {step === "committing" ? "Submitting…" : "Submit On-Chain"}
                        </Button>
                    )}

                    {commitError && (
                        <p className="text-error-fg text-xs" data-testid="sign-error">{commitError}</p>
                    )}

                    <button
                        onClick={handleReset}
                        className="text-xs text-ink-muted hover:text-ink-body"
                    >
                        ← Start over
                    </button>
                </Card>
            )}

            {/* Race draft returned — the countersignature is out, awaiting the
                buyer's selection. Nothing binds unless the buyer commits this
                struct before its deadline. */}
            {step === "awaiting-buyer" && (
                <Card className="p-6 text-center space-y-3">
                    <p className="text-sm font-semibold text-ink-primary" data-testid="sign-offer-returned">
                        Offer returned to the buyer.
                    </p>
                    <p className="text-xs text-ink-muted">
                        If the buyer commits you before the offer&apos;s deadline, the
                        commit-ready order appears on your Orders page. Until then
                        nothing binds either side, and the offer simply expires.
                    </p>
                    <button
                        onClick={handleReset}
                        className="text-xs text-ink-heading hover:text-ink-body underline"
                    >
                        Listen for another commitment
                    </button>
                </Card>
            )}

            {/* Step 3: Success */}
            {step === "done" && (
                <Card className="p-6 text-center space-y-3">
                    <p className="text-success-fg font-semibold">Commitment submitted on-chain.</p>
                    <p className="text-xs text-ink-muted">
                        Both parties&apos; bonds are now locked. The order is Active.
                    </p>
                    <button
                        onClick={handleReset}
                        className="text-xs text-ink-heading hover:text-ink-body underline"
                    >
                        Sign another commitment
                    </button>
                </Card>
            )}

            {/* Not connected */}
            {!address && (
                <p className="text-sm text-ink-muted text-center">
                    Connect your wallet to counter-sign a commitment.
                </p>
            )}
        </div>
    );
}

export default function SignPage() {
    return (
        <Suspense
            fallback={
                <div className="max-w-lg mx-auto px-4 py-12 space-y-6">
                    <h1 className="text-2xl font-bold text-ink-primary">Counter-Sign Commitment</h1>
                    <p className="text-sm text-ink-body">Loading…</p>
                </div>
            }
        >
            <SignPageContent />
        </Suspense>
    );
}
