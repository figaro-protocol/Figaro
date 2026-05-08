"use client";

/**
 * /sign — Counter-sign an incoming commitment.
 *
 * The initiating party (typically the buyer) shares a serialized
 * CommitmentPayload via QR or clipboard. The counter-party opens
 * this page, pastes the payload, reviews the terms, counter-signs
 * with their wallet, and broadcasts the fully-signed commitment.
 */

import { Suspense, useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useAccount, useWalletClient } from "wagmi";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useCommitmentFlow, type CommitmentPayload } from "@/lib/core/useCommitmentFlow";
import { ZERO_PROCESS_ID, hexEqual } from "@/lib/shared/evm";
import { extractErrorMessage } from "@/lib/shared/errors";
import { calculateBonds } from "@figaro/core";
import { deserializePayload } from "@/components/core/CommitmentSharePanel";
import { TokenApprovalFlow } from "@/components/core/TokenApprovalFlow";
import { primeAgreementArtifact } from "@/lib/core/agreementStore";
import useTokenDecimals from "@/hooks/core/useTokenDecimals";
import { formatToken } from "@/lib/shared/utils";
import { useRuntimeServices } from "@/lib/shared/runtimeServicesContext";
import { truncateHex } from "@/lib/shared/formatHex";

type InboxStatus = "idle" | "listening" | "received" | "error";

function SignPageContent() {
    const { address } = useAccount();
    const { data: walletClient } = useWalletClient();
    const searchParams = useSearchParams();
    const { coordinationMessaging } = useRuntimeServices();
    const { counterSign, broadcast, step, error: commitError, payload, reset } = useCommitmentFlow();
    const hydratedPayloadRef = useRef<string | null>(null);
    const receivedTransportOrderIdsRef = useRef<Set<string>>(new Set());

    const [rawInput, setRawInput] = useState("");
    const [parsed, setParsed] = useState<CommitmentPayload | null>(null);
    const [parseError, setParseError] = useState<string | null>(null);
    const [approvalDone, setApprovalDone] = useState(false);
    const [inboxStatus, setInboxStatus] = useState<InboxStatus>("idle");
    const [inboxError, setInboxError] = useState<string | null>(null);
    const [loadedFromInbox, setLoadedFromInbox] = useState(false);

    // Reset approval state when a new commitment is parsed
    useEffect(() => { setApprovalDone(false); }, [parsed]);

    const parseSerializedPayload = useCallback(async (serialized: string) => {
        try {
            setParseError(null);
            const p = deserializePayload(serialized);
            // Basic validation
            if (!p.commitment?.buyer || !p.commitment?.seller) {
                throw new Error("Invalid commitment: missing buyer or seller");
            }
            if (!p.buyerSig && !p.sellerSig) {
                throw new Error("No signatures found — this commitment has not been signed yet");
            }
            await primeAgreementArtifact({
                agreementHash: p.commitment.agreementHash,
                agreement: p.agreement,
                agreementUri: p.agreementUri,
            });
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
        setLoadedFromInbox(false);
        await parseSerializedPayload(rawInput.trim());
    };

    useEffect(() => {
        const linkedPayload = searchParams.get("payload");
        if (!linkedPayload || hydratedPayloadRef.current === linkedPayload) {
            return;
        }

        hydratedPayloadRef.current = linkedPayload;
        setRawInput((current) => current || linkedPayload);
        setLoadedFromInbox(false);
        void parseSerializedPayload(linkedPayload);
    }, [parseSerializedPayload, searchParams]);

    useEffect(() => {
        const linkedPayload = searchParams.get("payload");
        if (!address || parsed || rawInput.trim() || linkedPayload) {
            return;
        }

        let cancelled = false;
        let cleanup: (() => void) | null = null;
        setInboxStatus("listening");
        setInboxError(null);

        void coordinationMessaging.subscribeAnyCommitmentPayload({
            address,
            walletClient,
            callback: async (payloadJson, orderId) => {
                if (cancelled || receivedTransportOrderIdsRef.current.has(orderId)) {
                    return;
                }

                const nextPayload = await parseSerializedPayload(payloadJson);
                if (cancelled || !nextPayload) {
                    if (!cancelled && !nextPayload) {
                        setInboxStatus("error");
                        setInboxError("Received an invalid commitment payload over XMTP.");
                    }
                    return;
                }

                receivedTransportOrderIdsRef.current.add(orderId);
                setLoadedFromInbox(true);
                setRawInput(payloadJson);
                setInboxStatus("received");
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

            setInboxStatus("error");
            setInboxError(extractErrorMessage(error, "Could not open the XMTP inbox."));
        });

        return () => {
            cancelled = true;
            cleanup?.();
        };
    }, [address, coordinationMessaging, parsed, parseSerializedPayload, rawInput, searchParams, walletClient]);

    const handleCounterSign = async () => {
        if (!parsed) return;
        try {
            const updated = await counterSign(parsed);
            // After counter-signing, broadcast immediately
            await broadcast(updated);
        } catch {
            // Error state handled by useCommitmentFlow
        }
    };

    const handleReset = () => {
        setRawInput("");
        setParsed(null);
        setParseError(null);
        setInboxStatus("idle");
        setInboxError(null);
        setLoadedFromInbox(false);
        receivedTransportOrderIdsRef.current.clear();
        reset();
    };

    const commitment = parsed?.commitment;
    const isRoot = commitment?.processId === ZERO_PROCESS_ID;
    const hasBuyerSig = !!parsed?.buyerSig;
    const hasSellerSig = !!parsed?.sellerSig;

    // Determine which role the current wallet would fill
    const isBuyer = hexEqual(address, commitment?.buyer);
    const isSeller = hexEqual(address, commitment?.seller);
    const needsMySignature = (isBuyer && !hasBuyerSig) || (isSeller && !hasSellerSig);
    const myBondLabel = isBuyer ? "Your Buyer Bond (2x)" : isSeller ? "Your Seller Bond (2x)" : "Your Bond (2x)";

    // Token and bond amount for approval flow
    const approvalCurrency = commitment?.currency as `0x${string}` | undefined;
    const { decimals: tokenDecimals } = useTokenDecimals(approvalCurrency);
    const myBondAmount = (() => {
        if (!commitment) return 0n;
        if (isSeller) return calculateBonds(commitment.expectedCumulativeValue, commitment.payment).sellerBond;
        if (isBuyer) return calculateBonds(commitment.expectedCumulativeValue, commitment.payment).buyerBond;
        return 0n;
    })();

    return (
        <div className="max-w-lg mx-auto px-4 py-12 space-y-6">
            <h1 className="text-2xl font-bold text-black">Counter-Sign Commitment</h1>
            <p className="text-sm text-neutral-600">
                This page listens for incoming commitment payloads over XMTP while your wallet is connected.
                You can still paste a payload manually or open a share link that preloads it.
            </p>

            {!parsed && !rawInput.trim() && !searchParams.get("payload") && address && (
                <Card className="p-4 space-y-2">
                    <h2 className="text-sm font-semibold text-neutral-900">Secure Channel Inbox</h2>
                    {inboxStatus === "listening" && (
                        <p className="text-xs text-blue-600" data-testid="xmtp-commitment-inbox-status">
                            Listening for incoming commitment payloads over XMTP…
                        </p>
                    )}
                    {inboxStatus === "error" && (
                        <p className="text-xs text-amber-700" data-testid="xmtp-commitment-inbox-status">
                            {inboxError ?? "Could not open the XMTP inbox."}
                        </p>
                    )}
                    <p className="text-xs text-neutral-500">
                        Manual paste remains available below as a fallback.
                    </p>
                </Card>
            )}

            {/* Step 1: Paste payload */}
            {!parsed && (
                <Card className="p-4 space-y-3">
                    <label className="block text-sm font-medium text-neutral-700">
                        Commitment Payload
                    </label>
                    <textarea
                        data-testid="input-commitment-payload"
                        className="w-full bg-white border border-neutral-300 rounded-lg px-3 py-2 text-black text-sm font-mono placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                        rows={6}
                        placeholder='Paste the JSON payload here…'
                        value={rawInput}
                        onChange={(e) => setRawInput(e.target.value)}
                    />
                    {parseError && (
                        <p className="text-red-600 text-xs" data-testid="parse-error">{parseError}</p>
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
            {parsed && commitment && step !== "done" && (
                <Card className="p-4 space-y-4">
                    <h2 className="text-sm font-semibold text-neutral-900">
                        {isRoot ? "Order Commitment" : "Sub-Order Commitment"}
                    </h2>

                    <div className="text-xs space-y-1.5 text-neutral-600">
                        <div className="flex justify-between">
                            <span>Buyer</span>
                            <span className="font-mono">{truncateHex(commitment.buyer)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Seller</span>
                            <span className="font-mono">{truncateHex(commitment.seller)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Payment</span>
                            <span>{formatToken(commitment.payment, tokenDecimals)} tokens</span>
                        </div>
                        <div className="flex justify-between">
                            <span>{myBondLabel}</span>
                            <span>{formatToken(myBondAmount, tokenDecimals)} tokens</span>
                        </div>
                        {!isRoot && (
                            <div className="flex justify-between">
                                <span>Process</span>
                                <span className="font-mono">
                                    {commitment.processId.slice(0, 10)}…
                                </span>
                            </div>
                        )}
                        <div className="flex justify-between">
                            <span>Deadline</span>
                            <span>{new Date(Number(commitment.deadline) * 1000).toLocaleString()}</span>
                        </div>
                    </div>

                    {/* Signature status */}
                    <div className="flex gap-2 text-xs">
                        <span className={`px-2 py-0.5 rounded ${hasBuyerSig ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                            Buyer: {hasBuyerSig ? "Signed" : "Pending"}
                        </span>
                        <span className={`px-2 py-0.5 rounded ${hasSellerSig ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                            Seller: {hasSellerSig ? "Signed" : "Pending"}
                        </span>
                    </div>

                    {loadedFromInbox && (
                        <p className="text-xs text-green-700 rounded bg-green-50 border border-green-200 px-2 py-1">
                            Received via XMTP secure channel.
                        </p>
                    )}

                    {/* Warning if connected wallet is not a party */}
                    {address && !isBuyer && !isSeller && (
                        <p className="text-amber-600 text-xs bg-amber-50 border border-amber-200 rounded p-2">
                            Your connected wallet ({truncateHex(address)}) is neither the buyer nor the seller in this commitment.
                        </p>
                    )}

                    {/* Payment authorization before counter-signing */}
                    {needsMySignature && !approvalDone && approvalCurrency && (
                        <div className="space-y-2">
                            <h3 className="text-xs font-semibold text-neutral-700">Payment Authorization</h3>
                            <p className="text-xs text-neutral-500">
                                Authorize the deposit for this order before signing.
                            </p>
                            <TokenApprovalFlow
                                tokenAddress={approvalCurrency}
                                requiredAmount={myBondAmount}
                                onApprovalComplete={() => setApprovalDone(true)}
                            />
                        </div>
                    )}

                    {/* Counter-sign button */}
                    {needsMySignature && approvalDone && (
                        <Button
                            onClick={handleCounterSign}
                            disabled={step === "signing" || step === "broadcasting" || !address}
                            data-testid="btn-counter-sign"
                            className="w-full"
                        >
                            {step === "signing" ? "Signing…" : step === "broadcasting" ? "Broadcasting…" : "Counter-Sign & Submit"}
                        </Button>
                    )}

                    {/* Already signed — show broadcast button if both sigs present */}
                    {!needsMySignature && hasBuyerSig && hasSellerSig && (
                        <Button
                            onClick={() => broadcast(parsed)}
                            disabled={step === "broadcasting"}
                            data-testid="btn-broadcast"
                            className="w-full"
                        >
                            {step === "broadcasting" ? "Broadcasting…" : "Submit On-Chain"}
                        </Button>
                    )}

                    {commitError && (
                        <p className="text-red-600 text-xs" data-testid="sign-error">{commitError}</p>
                    )}

                    <button
                        onClick={handleReset}
                        className="text-xs text-neutral-500 hover:text-neutral-700"
                    >
                        ← Start over
                    </button>
                </Card>
            )}

            {/* Step 3: Success */}
            {step === "done" && (
                <Card className="p-6 text-center space-y-3">
                    <p className="text-green-600 font-semibold">Commitment submitted on-chain.</p>
                    <p className="text-xs text-neutral-500">
                        Both parties&apos; bonds are now locked. The order is Active.
                    </p>
                    <button
                        onClick={handleReset}
                        className="text-xs text-blue-600 hover:text-blue-800 underline"
                    >
                        Sign another commitment
                    </button>
                </Card>
            )}

            {/* Not connected */}
            {!address && (
                <p className="text-sm text-neutral-500 text-center">
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
                    <h1 className="text-2xl font-bold text-black">Counter-Sign Commitment</h1>
                    <p className="text-sm text-neutral-600">Loading shared commitment context…</p>
                </div>
            }
        >
            <SignPageContent />
        </Suspense>
    );
}
