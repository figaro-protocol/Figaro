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
import { useAccount } from "wagmi";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { deriveSignState } from "@/lib/checkout/signState";
import { readSigningDesign, useOrderCommitmentFlow } from "@/lib/checkout/orderCommitmentFlow";
import {
    deserializeCommitmentPayload,
    type CommitmentPayload,
} from "@figaro-protocol/sdk/agent";
import { hexEqual } from "@/lib/shared/evm";
import { useTokenSymbol } from "@/hooks/useTokenSymbol";
import { extractErrorMessage } from "@/lib/shared/errors";
import { validateCommitmentAgreement, type HydratedAssembly } from "@figaro-protocol/sdk";
import { specSource } from "@/lib/shared/clauseSpecSource";
import { TokenApprovalFlow } from "@/components/runtime/TokenApprovalFlow";
import { SwapFundingPanel } from "@/app/(app)/s/checkout/_components/SwapFundingPanel";
import { useSwapFunding, fundingBlocksTheAct } from "@/lib/composition/useSwapFunding";
import { useFundingMargin, marginBlocksTheAct } from "@/lib/composition/useFundingMargin";
import useTokenBalance from "@/hooks/useTokenBalance";
import { useMemberProfile } from "@/lib/member/useMembersRegistry";
import { fetchMemberProfile } from "@/lib/member/profileFetcher";
import type { MemberProfileMetadata } from "@/lib/member/memberProfileMetadata";
import { AgreementReview, commerceLineItems } from "@/components/runtime/AgreementReview";
import { useRegisteredCatalogs } from "@/lib/member/useRegisteredCatalogs";
import useTokenDecimals from "@/hooks/useTokenDecimals";
import useProcessResolveCapacity from "@/hooks/useProcessResolveCapacity";
import { parseToken, tokenFigure } from "@/lib/shared/utils";
import { useCommitmentPayloadInbox, type InboxEntry } from "@/lib/checkout/orderPendingSellerSignature";
import { truncateHex } from "@/lib/shared/formatHex";

function SignPageContent() {
    const { address } = useAccount();
    const searchParams = useSearchParams();
    const { acceptOrder, counterSignAndReturn, quoteAndReturn, commitOrder, step, error: commitError, reset } = useOrderCommitmentFlow();
    const hydratedPayloadRef = useRef<string | null>(null);
    const receivedTransportOrderIdsRef = useRef<Set<string>>(new Set());

    const [rawInput, setRawInput] = useState("");
    const [parsed, setParsed] = useState<CommitmentPayload | null>(null);
    const [parseError, setParseError] = useState<string | null>(null);
    const [approvalDone, setApprovalDone] = useState(false);
    // A payload received over the channel that does not parse.
    const [channelPayloadError, setChannelPayloadError] = useState<string | null>(null);
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

    // Listening: a connected wallet with nothing pasted, linked or parsed.
    // The page reads the wallet's ONE shared coordination-channel inbox
    // (`useCommitmentPayloadInbox`): every payload this wallet is a party to.
    // With the dispatch race, k drafts are in flight at once, each naming a
    // different candidate; every candidate parses THEIR draft, since the inbox
    // keeps only payloads naming this wallet. Each listening spell reads the
    // inbox afresh, oldest first, so the newest payload not yet loaded is the
    // one on screen.
    const listening = !!address && !parsed && !rawInput.trim() && !searchParams.get("payload");
    const inbox = useCommitmentPayloadInbox(listening);
    const readEntriesRef = useRef<WeakSet<InboxEntry>>(new WeakSet());
    const wasListeningRef = useRef(false);
    useEffect(() => {
        if (!listening) {
            wasListeningRef.current = false;
            return;
        }
        if (!wasListeningRef.current) {
            wasListeningRef.current = true;
            readEntriesRef.current = new WeakSet();
            setChannelPayloadError(null);
        }
        for (const entry of inbox.entries) {
            if (readEntriesRef.current.has(entry)) continue;
            readEntriesRef.current.add(entry);
            if (receivedTransportOrderIdsRef.current.has(entry.orderId)) continue;
            void parseSerializedPayload(entry.json).then((nextPayload) => {
                if (!nextPayload) {
                    setChannelPayloadError("Received an invalid commitment payload over XMTP.");
                    return;
                }
                receivedTransportOrderIdsRef.current.add(entry.orderId);
                setLoadedFromChannel(true);
                setRawInput(entry.json);
            });
        }
    }, [listening, inbox.entries, parseSerializedPayload]);
    const channelError = channelPayloadError ?? (inbox.status === "error" ? inbox.error : null);

    const handleCounterSign = async () => {
        if (!parsed) return;
        try {
            // acceptOrder counter-signs AND broadcasts (bond already approved
            // above). A chosen funding token adds the seller's witness-signed
            // on-ramp leg — swapped into the process denomination in the same
            // atomic swapAndCommit.
            await acceptOrder(parsed, sellerFundingToken
                ? {
                    inputToken: sellerFundingToken,
                    ...(sellerMargin.bps !== null ? { slippageBps: sellerMargin.bps } : {}),
                    ...(swapFunding.allowance !== undefined ? { approvedInput: swapFunding.allowance } : {}),
                }
                : undefined);
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
        if (!parsed || !quotePrice.trim() || tokenDecimals === undefined) return;
        try {
            const returned = await quoteAndReturn(parsed, parseToken(quotePrice.trim(), tokenDecimals));
            setParsed(returned);
        } catch {
            // Error state handled by the order commitment flow.
        }
    };

    const handleReset = () => {
        setRawInput("");
        setParsed(null);
        setParseError(null);
        setChannelPayloadError(null);
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
    const { read: registration } = useMemberProfile(isSeller ? address : undefined);
    const ownMetadataURI = registration.status === "present" && registration.value.registered
        ? registration.value.metadataURI
        : null;
    const [ownProfile, setOwnProfile] = useState<MemberProfileMetadata | null>(null);
    useEffect(() => {
        let canceled = false;
        setOwnProfile(null);
        if (!ownMetadataURI) return;
        fetchMemberProfile(ownMetadataURI)
            .then((parsed_) => { if (!canceled && parsed_) setOwnProfile(parsed_); })
            .catch(() => { /* absence — the funding panel simply doesn't render */ });
        return () => { canceled = true; };
    }, [ownMetadataURI]);
    const swapFunding = useSwapFunding({
        party: isSeller ? address : undefined,
        currency: approvalCurrency,
        acceptedTokens: ownProfile?.acceptedTokens,
    });
    const { candidates: sellerFundingCandidates, fundingToken: sellerFundingToken, setFundingToken: setSellerFundingToken } = swapFunding;
    // Progressive disclosure: the on-ramp is a TREASURY choice (which balance
    // gets locked — the denomination arrived chosen by the buyer or the pin),
    // collapsed on the common path so visibility never reads as expectation.
    // A seller SHORT of the denomination has no other way through accept, so
    // insufficiency auto-opens it.
    const [fundingOpen, setFundingOpen] = useState(false);
    const { read: myDenominationBalance } = useTokenBalance(approvalCurrency, isSeller ? address : undefined);
    // Where the chosen funding token stands with Permit2 — the one derived
    // state the funding panel shows and the counter-sign button obeys. A
    // counter-sign with a funding leg broadcasts swapAndCommit, which pulls
    // the token through Permit2 and reverts on an allowance that is short.
    // The slippage margin the seller sets in the chooser, before the quote
    // its accept signature binds.
    const sellerMargin = useFundingMargin({
        party: isSeller ? address : undefined,
        currency: approvalCurrency,
        fundingToken: sellerFundingToken,
        fundingSymbol: sellerFundingCandidates.find((t) => hexEqual(t.address, sellerFundingToken))?.symbol ?? "",
    }).marginFor(myBondAmount);
    const marginHeld = !!sellerFundingToken && marginBlocksTheAct(sellerMargin);
    // Against the swap's maximum input in the funding token's units, not the bond's.
    const sellerFunding = swapFunding.authorizationFor(sellerMargin.maxInput);
    // A seller short of the denomination has no other way through accept —
    // insufficiency auto-opens the collapsed on-ramp.
    const sellerShortOfDenomination = isSeller
        && myDenominationBalance.status === "present"
        && myDenominationBalance.value < myBondAmount;
    useEffect(() => {
        if (sellerShortOfDenomination && sellerFundingCandidates.length > 0) setFundingOpen(true);
    }, [sellerShortOfDenomination, sellerFundingCandidates.length]);

    // Off-chain validation over what was pasted/relayed: does the inline agreement merkle
    // to the signed checkoutHash and conform to its clause specs? Computed at
    // review time so the party isn't reading terms that aren't the ones signed;
    // the sign/commit gates re-assert this at the exit. The design the
    // agreement names is read first, so the designer's values are checked
    // against it; the check waits for the read.
    const [designRead, setDesignRead] = useState<{ agreement: unknown; design: HydratedAssembly | null } | null>(null);
    useEffect(() => {
        const agreement = parsed?.agreement;
        if (!agreement) return;
        let live = true;
        void readSigningDesign(agreement).then((design) => {
            if (live) setDesignRead({ agreement, design });
        });
        return () => { live = false; };
    }, [parsed]);
    const agreementCheck = useMemo(() => {
        if (!parsed?.agreement || !commitment) return null;
        if (designRead?.agreement !== parsed.agreement) return null;
        // A design the agreement names that could not be read is the
        // validator's own refusal (its verdict names the unread assembly), and
        // the review shows it before any signature: the gate refuses what it
        // cannot read, and the party reads why rather than no verdict at all.
        return validateCommitmentAgreement(parsed.agreement, commitment.checkoutHash, specSource(), commitment, designRead.design);
    }, [parsed, commitment, designRead]);

    // The seller's own listed prices beside the amounts it is asked to sign,
    // when the denomination is not the token its catalog is priced in: the
    // catalog read from IPFS (the same discovery read checkout prices from),
    // each signed line item matched to its listed item by id. The seller
    // signs the amount or declines; nothing here changes it.
    const { read: catalogsRead } = useRegisteredCatalogs();
    const sellerCatalog = isSeller && commitment && catalogsRead.status === "present"
        ? catalogsRead.value.find((c) => hexEqual(c.address, commitment.seller)) ?? null
        : null;
    const listedToken = sellerCatalog?.defaultTokenAddress as `0x${string}` | undefined;
    const listedInAnotherToken = !!listedToken && !!approvalCurrency && !hexEqual(listedToken, approvalCurrency);
    const { data: listedSymbol } = useTokenSymbol(listedInAnotherToken ? listedToken : "");
    const listedBeside = listedInAnotherToken && sellerCatalog
        ? commerceLineItems(parsed?.agreement ?? null).map((line) => ({
            ...line,
            listedPrice: sellerCatalog.items.find((it) => it.id === line.itemId)?.price,
        }))
        : [];

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
                    {!channelError && inbox.status === "listening" && (
                        <p className="text-xs text-info-fg" data-testid="xmtp-commitment-channel-status">
                            Listening for incoming commitment payloads over XMTP…
                        </p>
                    )}
                    {channelError && (
                        <p className="text-xs text-warning-fg" data-testid="xmtp-commitment-channel-status">
                            {channelError}
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
                    <Textarea
                        data-testid="input-commitment-payload"
                        className="rounded-lg font-mono resize-none"
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
                                These terms do NOT match the signed checkoutHash — do not proceed.
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

                    {listedInAnotherToken && (
                        <div className="text-xs space-y-1.5 text-ink-body border-t border-default pt-3" data-testid="sign-listed-prices">
                            {listedSymbol && currencySymbol && (
                                <p className="text-ink-muted">
                                    Your catalog lists in {listedSymbol}; the buyer pays in{" "}
                                    {currencySymbol} and asks you to sign these amounts. Sign them or decline.
                                </p>
                            )}
                            {listedBeside.map((line, i) => (
                                <div key={i} className="flex justify-between gap-2" data-testid={`sign-listed-price-${line.itemId ?? i}`}>
                                    <span>{line.name} × {line.quantity}</span>
                                    <span className="tabular-nums">
                                        {line.listedPrice !== undefined && (
                                            <>
                                                listed{" "}
                                                <span data-testid={`sign-listed-price-listed-${line.itemId ?? i}`}>{line.listedPrice}</span>{" "}
                                                {listedSymbol ?? ""} ·{" "}
                                            </>
                                        )}
                                        signed{" "}
                                        <span data-testid={`sign-listed-price-signed-${line.itemId ?? i}`}>
                                            {/^\d+$/.test(line.unitPrice) ? tokenFigure(BigInt(line.unitPrice), tokenDecimals) : line.unitPrice}
                                        </span>{" "}
                                        {currencySymbol ?? ""} each
                                    </span>
                                </div>
                            ))}
                            <div className="flex justify-between font-medium">
                                <span>Payment you sign</span>
                                <span className="tabular-nums" data-testid="sign-listed-prices-payment">
                                    {tokenFigure(commitment.payment, tokenDecimals)} {currencySymbol ?? ""}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* This party's position — context the agreement itself doesn't carry */}
                    <div className="text-xs space-y-1.5 text-ink-body border-t border-default pt-3">
                        <div className="flex justify-between gap-2">
                            <span>Token</span>
                            <span className="font-mono break-all text-right" data-testid="sign-token">{commitment.currency}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Payment</span>
                            <span data-testid="sign-payment">
                                {tokenFigure(commitment.payment, tokenDecimals)} {currencySymbol ?? ""}
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span>{myBondLabel}</span>
                            <span data-testid="sign-my-bond">
                                {tokenFigure(myBondAmount, tokenDecimals)} {currencySymbol ?? ""}
                            </span>
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
                                {sellerShortOfDenomination && sellerFundingCandidates.length > 0 && !sellerFundingToken
                                    ? "Your balance is short of the bond. Pick a funding token below: the swap supplies the bond when you submit, and the authorization here is what the Core pulls it with."
                                    : "Authorize the deposit for this order before signing."}
                            </p>
                            {/* A chosen funding leg supplies the bond at commit, so the
                                balance is no gate for the authorization (the buyer's
                                checkout reads the same rule). */}
                            <TokenApprovalFlow
                                tokenAddress={approvalCurrency}
                                requiredAmount={myBondAmount}
                                onApprovalComplete={() => setApprovalDone(true)}
                                fundedAtCommit={sellerFundingToken !== null}
                            />
                        </div>
                    )}

                    {/* The seller's funding leg: fund the 2× bond from another of the
                        seller's own accepted tokens — the coordinator swaps it
                        into the process denomination in the same atomic
                        swapAndCommit. Optional and collapsed by default (the
                        treasury choice); auto-opened when the seller is short
                        of the denomination. Absent when unconfigured. */}
                    {needsMySignature && isSeller && sellerFundingCandidates.length > 0 && (
                        <div className="space-y-2">
                            <Button
                                type="button"
                                variant="link"
                                size="sm"
                                onClick={() => {
                                    // Collapsing withdraws the choice — a closed
                                    // panel never engages a leg silently.
                                    if (fundingOpen) setSellerFundingToken(null);
                                    setFundingOpen(!fundingOpen);
                                }}
                                className="px-0 text-xs text-ink-muted underline hover:text-ink-body"
                                data-testid="seller-funding-toggle"
                            >
                                {fundingOpen ? "Bond from the order's token instead" : "Fund bond from another token"}
                            </Button>
                            {fundingOpen && (
                                <SwapFundingPanel
                                    candidates={sellerFundingCandidates}
                                    party={address as `0x${string}`}
                                    currencySymbol={currencySymbol ?? ""}
                                    fundingToken={sellerFundingToken}
                                    onSelect={setSellerFundingToken}
                                    authorization={sellerFunding}
                                    onAuthorize={() => swapFunding.authorize(sellerMargin.maxInput)}
                                    margin={sellerMargin}
                                />
                            )}
                            {fundingOpen && swapFunding.authorizeFailed && (
                                <p className="text-error-fg text-xs" data-testid="funding-authorize-error">
                                    The funding token was not authorized: the wallet refused it or the transaction reverted.
                                </p>
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
                                    {tokenFigure(commitment!.payment, tokenDecimals)} {currencySymbol}
                                </span>. Your counter-signature binds you at YOUR figure
                                if the buyer commits it before the deadline.
                            </p>
                            <Input
                                type="text"
                                inputMode="decimal"
                                value={quotePrice}
                                onChange={(e) => setQuotePrice(e.target.value)}
                                placeholder="Your price"
                                className="rounded focus-visible:border-transparent"
                                data-testid="quote-price-input"
                            />
                            <Button
                                onClick={handleQuoteReturn}
                                disabled={step === "signing" || step === "sharing" || !address || !quotePrice.trim() || tokenDecimals === undefined}
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
                            disabled={step === "signing" || step === "committing" || !address || fundingBlocksTheAct(sellerFunding) || marginHeld}
                            data-testid="btn-counter-sign"
                            className="w-full"
                        >
                            {step === "signing" ? "Signing…"
                                : step === "committing" ? "Submitting…"
                                : sellerFunding === "needed" ? "Authorize the funding token first"
                                : fundingBlocksTheAct(sellerFunding) ? "Checking the funding authorization…"
                                : marginHeld ? "Fix the slippage margin first"
                                : "Counter-Sign & Submit"}
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

                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleReset}
                        className="px-0 text-xs text-ink-muted hover:bg-transparent hover:text-ink-body"
                    >
                        ← Start over
                    </Button>
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
                    <Button
                        variant="link"
                        size="sm"
                        onClick={handleReset}
                        className="px-0 text-xs text-ink-heading hover:text-ink-body underline"
                    >
                        Listen for another commitment
                    </Button>
                </Card>
            )}

            {/* Step 3: Success */}
            {step === "done" && (
                <Card className="p-6 text-center space-y-3">
                    <p className="text-success-fg font-semibold">Commitment submitted on-chain.</p>
                    <p className="text-xs text-ink-muted">
                        Both parties&apos; bonds are now locked. The order is Active.
                    </p>
                    <Button
                        variant="link"
                        size="sm"
                        onClick={handleReset}
                        className="px-0 text-xs text-ink-heading hover:text-ink-body underline"
                    >
                        Sign another commitment
                    </Button>
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
