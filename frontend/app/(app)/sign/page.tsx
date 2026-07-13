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
import { useAccount, useWalletClient } from "wagmi";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useOrderCommitmentFlow } from "@/lib/checkout/orderCommitmentFlow";
import {
    deserializeCommitmentPayload,
    type CommitmentPayload,
} from "@figaro/sdk/agent";
import { ZERO_PROCESS_ID, hexEqual } from "@/lib/shared/evm";
import { extractErrorMessage } from "@/lib/shared/errors";
import { calculateBonds, validateCommitmentAgreement } from "@figaro/sdk";
import { specSource } from "@/lib/shared/clauseSpecSource";
import { TokenApprovalFlow } from "@/components/runtime/TokenApprovalFlow";
import { AgreementReview } from "@/components/runtime/AgreementReview";
import useTokenDecimals from "@/hooks/useTokenDecimals";
import useProcessResolveCapacity from "@/hooks/useProcessResolveCapacity";
import { formatToken } from "@/lib/shared/utils";
import { useRuntimeServices } from "@/lib/shared/runtimeServicesContext";
import { fetchCommitmentPayloadJsonByCid } from "@/lib/checkout/orderPendingSellerSignature";
import { truncateHex } from "@/lib/shared/formatHex";

type ChannelStatus = "idle" | "listening" | "received" | "error";

function SignPageContent() {
    const { address } = useAccount();
    const { data: walletClient } = useWalletClient();
    const searchParams = useSearchParams();
    const { coordinationMessaging, evidenceTransport } = useRuntimeServices();
    const { acceptOrder, commitOrder, step, error: commitError, reset } = useOrderCommitmentFlow();
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
            if (!p.buyerSig && !p.sellerSig) {
                throw new Error("No signatures found — this commitment has not been signed yet");
            }
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

        void coordinationMessaging.subscribeAnyCommitmentPayload({
            address,
            walletClient,
            callback: async (payloadCid, orderId) => {
                if (cancelled || receivedTransportOrderIdsRef.current.has(orderId)) {
                    return;
                }

                let payloadJson: string;
                try {
                    payloadJson = await fetchCommitmentPayloadJsonByCid(
                        evidenceTransport,
                        payloadCid,
                    );
                } catch (error) {
                    if (!cancelled) {
                        setChannelStatus("error");
                        setChannelError(extractErrorMessage(error, "Could not fetch the commitment payload from IPFS."));
                    }
                    return;
                }

                if (cancelled) return;

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
    }, [address, coordinationMessaging, evidenceTransport, parsed, parseSerializedPayload, rawInput, searchParams, walletClient]);

    const handleCounterSign = async () => {
        if (!parsed) return;
        try {
            // acceptOrder counter-signs AND broadcasts (bond already approved above).
            await acceptOrder(parsed);
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
    const isRoot = commitment?.processId === ZERO_PROCESS_ID;
    // Sub-orders only — the hook itself returns null for roots/zero ids.
    const processCapacity = useProcessResolveCapacity(commitment?.processId);
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

    // Layer A over what was pasted/relayed: does the inline agreement merkle
    // to the signed agreementHash and conform to its clause specs? Computed at
    // review time so the party isn't reading terms that aren't the ones signed;
    // the sign/commit gates re-assert this at the exit.
    const agreementCheck = useMemo(() => {
        if (!parsed?.agreement || !commitment) return null;
        return validateCommitmentAgreement(parsed.agreement, commitment.agreementHash, specSource());
    }, [parsed, commitment]);

    return (
        <div className="max-w-lg mx-auto px-4 py-12 space-y-6">
            <h1 className="text-2xl font-bold text-black">Counter-Sign Commitment</h1>
            <p className="text-sm text-neutral-600">
                This page listens for incoming commitment payloads over XMTP while your wallet is connected.
                You can still paste a payload manually or open a share link that preloads it.
            </p>

            {!parsed && !rawInput.trim() && !searchParams.get("payload") && address && (
                <Card className="p-4 space-y-2">
                    <h2 className="text-sm font-semibold text-neutral-900">Secure Channel</h2>
                    {channelStatus === "listening" && (
                        <p className="text-xs text-blue-600" data-testid="xmtp-commitment-channel-status">
                            Listening for incoming commitment payloads over XMTP…
                        </p>
                    )}
                    {channelStatus === "error" && (
                        <p className="text-xs text-amber-700" data-testid="xmtp-commitment-channel-status">
                            {channelError ?? "Could not open the XMTP channel."}
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

                    {agreementCheck && !agreementCheck.ok && (
                        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700" data-testid="sign-agreement-invalid">
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
                        <p className="text-xs text-green-700" data-testid="sign-agreement-verified">
                            ✓ Terms verified — the agreement below recomputes to the signed hash.
                        </p>
                    )}

                    <AgreementReview commitment={commitment} agreement={parsed.agreement ?? null} />

                    {/* This party's position — context the agreement itself doesn't carry */}
                    <div className="text-xs space-y-1.5 text-neutral-600 border-t border-neutral-200 pt-3">
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
                                    ? "text-amber-700 font-semibold"
                                    : undefined}>
                                    {processCapacity.activeOrderCount} / {processCapacity.cap} resolvable
                                </span>
                            </div>
                        )}
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

                    {loadedFromChannel && (
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
                            disabled={step === "signing" || step === "committing" || !address}
                            data-testid="btn-counter-sign"
                            className="w-full"
                        >
                            {step === "signing" ? "Signing…" : step === "committing" ? "Submitting…" : "Counter-Sign & Submit"}
                        </Button>
                    )}

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
