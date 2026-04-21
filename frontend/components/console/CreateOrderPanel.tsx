"use client";

/**
 * CreateOrderPanel — Create and commit new orders.
 *
 * Flow:
 * 1. Fill form → build Commitment + EIP-712 typed data
 * 2. Check token allowance → approve if needed
 * 3. Sign EIP-712 as current wallet
 * 4. Submit commit(commitment, buyerSig, sellerSig) on-chain
 *
 * For local testing (Anvil), the same wallet can sign both sides.
 * For production, the counterparty signs separately.
 */

import { useState, useCallback, useEffect } from "react";
import { usePublicClient, useWalletClient, useAccount } from "wagmi";
import { useFigaro } from "@/lib/console/provider";
import type { ConsoleCreateOrderPrefill } from "@/lib/console/actionPresentation";
import { getFigaroAddresses } from "@/lib/console/addresses";
import { broadcastSharedCommitment } from "@/lib/core/commitmentBroadcast";
import { submitPreparedCommitment } from "@/lib/core/commitmentSubmission";
import { prepareOrderCommitment, buildUnsignedOrderCommitment } from "@/lib/core/orderCommitmentPreparation";
import { handleOrderSurfaceFailure, runOrderSurfaceAction } from "@/lib/core/orderSurfaceActions";
import { useCommitmentFlow } from "@/lib/core/useCommitmentFlow";
import { CommitmentSharePanel } from "@/components/core/CommitmentSharePanel";
import BondApprovalPanel from "@/components/core/BondApprovalPanel";
import { type PermitSignature } from "@/hooks/core/useTokenApproval";
import useTokenDecimals from "@/hooks/core/useTokenDecimals";
import { useMounted } from "@/hooks/core/useMounted";
import { parsePositiveTokenInput } from "@/lib/core/orderEntryValidation";
import { buildExpectedCumulativeValue, getLinearPredecessorOrderHash } from "@/lib/core/processOrderPreparation";
import { useOrderApprovalFlow } from "@/lib/core/useOrderApprovalFlow";
import { getE2EModeSession } from "@/lib/shared/e2e";
import { ZERO_ADDRESS, ZERO_BYTES32 } from "@/lib/shared/evm";
import {
    calculateBonds,
    type Hex,
    type Address,
} from "@figaro/core";

type Step = "form" | "submitting-permit" | "done" | "error";

interface FormState {
    seller: string;
    payment: string;
    currency: string;
    agreementHash: string;
    isSubOrder: boolean;
    processId: string;
}

function applyCreateOrderPrefill(prefill: ConsoleCreateOrderPrefill): FormState {
    return {
        seller: prefill.seller,
        payment: prefill.payment,
        currency: prefill.currency,
        agreementHash: prefill.agreementHash,
        isSubOrder: prefill.isSubOrder,
        processId: prefill.processId,
    };
}

function isValidAddress(s: string): s is Address {
    return /^0x[0-9a-fA-F]{40}$/.test(s);
}

function isValidHex(s: string): s is Hex {
    return /^0x[0-9a-fA-F]+$/.test(s);
}

export function CreateOrderPanel() {
    const { address } = useAccount();
    const publicClient = usePublicClient();
    const { data: walletClient } = useWalletClient();
    const { resync, ctx, createOrderPrefill, clearCreateOrderPrefill } = useFigaro();
    const {
        initiateAsParty,
        broadcast,
        signAndBroadcast,
        step: commitmentStep,
        error: commitmentError,
        payload,
        reset: resetCommitmentFlow,
    } = useCommitmentFlow();

    const [form, setForm] = useState<FormState>({
        seller: "",
        payment: "0.01",
        currency: "",
        agreementHash: "",
        isSubOrder: false,
        processId: "",
    });
    const [step, setStep] = useState<Step>("form");
    const [error, setError] = useState<string | null>(null);
    const [txHash, setTxHash] = useState<string | null>(null);
    const [prefillMessage, setPrefillMessage] = useState<string | null>(null);
    const [signedPermit, setSignedPermit] = useState<PermitSignature | null>(null);
    const mounted = useMounted();

    const e2eMode = getE2EModeSession();
    const isE2EMock = e2eMode === "mock";
    const immediateCommitEnabled = mounted && (e2eMode === "mock" || e2eMode === "devnet");
    const activeError = error ?? commitmentError;

    // Derive currency from env default if empty
    const addresses = getFigaroAddresses();
    const defaultCurrency = addresses.token ?? ZERO_ADDRESS;
    const selectedCurrency = form.currency.trim() || defaultCurrency;
    const approvalCurrency = (isValidAddress(selectedCurrency) ? selectedCurrency : defaultCurrency) as Address;
    const processIdInput = form.processId.trim();
    const previewProcessId = form.isSubOrder && isValidHex(processIdInput)
        ? processIdInput as Hex
        : ZERO_BYTES32;
    const previewProcess = previewProcessId !== ZERO_BYTES32 ? ctx?.getProcess(previewProcessId) ?? null : null;
    const { decimals: tokenDecimals } = useTokenDecimals(approvalCurrency);

    let paymentPreview = 0n;
    let paymentPreviewError: string | null = null;
    if (form.payment.trim()) {
        const { amount, error } = parsePositiveTokenInput(form.payment, tokenDecimals);
        if (amount) {
            paymentPreview = amount;
        } else {
            paymentPreviewError = error;
        }
    }

    const expectedCumulativePreview = previewProcess
        ? buildExpectedCumulativeValue(previewProcess.cumulativeValue, paymentPreview)
        : paymentPreview;
    const { buyerBond, sellerBond } = calculateBonds(expectedCumulativePreview, paymentPreview);
    const showApprovalPanel =
        paymentPreview > 0n &&
        !paymentPreviewError &&
        isValidAddress(selectedCurrency) &&
        (!form.isSubOrder || previewProcess !== null);
    const {
        approved: approvalSatisfied,
        approveBond,
        signPermitForBond,
        tokenApproval,
    } = useOrderApprovalFlow({
        tokenAddress: approvalCurrency,
        owner: address as Address | undefined,
        spender: addresses.core,
        amount: buyerBond,
        currency: selectedCurrency,
        hasPermit: signedPermit !== null,
        onPermitSigned: setSignedPermit,
    });
    const approved = showApprovalPanel && approvalSatisfied;
    const approvalPending = tokenApproval.isApprovePending || tokenApproval.isApproveConfirming;
    const isSubmittingPermit = step === "submitting-permit";

    const update = useCallback((field: keyof FormState, value: string | boolean) => {
        setForm((f) => ({ ...f, [field]: value }));
        setError(null);
    }, []);

    useEffect(() => {
        if (!createOrderPrefill) return;

        setForm(applyCreateOrderPrefill(createOrderPrefill));
        setStep("form");
        setError(null);
        setTxHash(null);
        setSignedPermit(null);
        resetCommitmentFlow();
        setPrefillMessage(`Loaded a sub-order draft for process ${createOrderPrefill.processId.slice(0, 10)}…`);
        clearCreateOrderPrefill();
    }, [createOrderPrefill, clearCreateOrderPrefill, resetCommitmentFlow]);

    useEffect(() => {
        setSignedPermit(null);
    }, [form.currency, form.payment, form.processId, form.seller]);

    const handleApprove = useCallback(async () => {
        await runOrderSurfaceAction({
            action: approveBond,
            enabled: !!buyerBond,
            missingMessage: "Nothing to approve",
            failureMessage: "Failed to approve token",
            logLabel: "Approve failed",
            onClearError: () => setError(null),
            onError: (message) => setError(message),
        });
    }, [buyerBond, approveBond]);

    const handleSignPermit = useCallback(async () => {
        await runOrderSurfaceAction({
            action: signPermitForBond,
            enabled: !!buyerBond,
            missingMessage: "Nothing to approve",
            failureMessage: "Failed to sign permit",
            logLabel: "Permit signing failed",
            onClearError: () => setError(null),
            onError: (message) => setError(message),
        });
    }, [buyerBond, signPermitForBond]);

    const handleCommitmentError = useCallback((err: unknown) => {
        handleOrderSurfaceFailure(err, {
            failureMessage: "Transaction failed",
            onBeforeError: () => setStep("error"),
            onError: (message) => setError(message),
        });
    }, []);

    const finalizeCommittedOrder = useCallback(async (commitHash?: `0x${string}`) => {
        setTxHash(commitHash ?? null);
        setStep("done");
        await resync();
    }, [resync]);

    const handleSubmit = useCallback(async () => {
        if (!address || !walletClient || !publicClient) {
            setError("Wallet not connected");
            return;
        }

        const seller = form.seller.trim();
        if (!isValidAddress(seller)) {
            setError("Invalid seller address");
            return;
        }

        const currency = (form.currency.trim() || defaultCurrency) as Address;
        if (!isValidAddress(currency)) {
            setError("Invalid currency address");
            return;
        }

        const { amount: payment, error: paymentErrorMessage } = parsePositiveTokenInput(form.payment, tokenDecimals);
        if (!payment) {
            setError(paymentErrorMessage ?? "Payment amount exceeds token decimal precision for this token");
            return;
        }
        const processId = form.isSubOrder && isValidHex(form.processId.trim())
            ? form.processId.trim() as Hex
            : ZERO_BYTES32;
        const manualAgreementHash = form.agreementHash.trim();
        if (manualAgreementHash && !/^0x[0-9a-fA-F]{64}$/.test(manualAgreementHash)) {
            setError("Agreement hash must be a 32-byte hex string");
            return;
        }

        try {
            const targetProcess = processId !== ZERO_BYTES32 ? ctx?.getProcess(processId) ?? null : null;
            if (form.isSubOrder && !targetProcess) {
                setError("Unknown process ID");
                return;
            }

            const requiredBuyerBond = calculateBonds(
                targetProcess ? buildExpectedCumulativeValue(targetProcess.cumulativeValue, payment) : payment,
                payment,
            ).buyerBond;

            if (signedPermit === null && tokenApproval.needsApproval(requiredBuyerBond)) {
                setError("Approve the buyer bond before creating the commitment.");
                return;
            }

            const expectedCumulativeValue = targetProcess
                ? buildExpectedCumulativeValue(targetProcess.cumulativeValue, payment)
                : payment;
            const linearPredecessorOrderHash = targetProcess
                ? getLinearPredecessorOrderHash(targetProcess.orders.values())
                : undefined;

            const prepared = manualAgreementHash
                ? {
                    commitment: buildUnsignedOrderCommitment({
                        processId,
                        buyer: address,
                        seller: seller as Address,
                        currency,
                        payment,
                        expectedCumulativeValue,
                        agreementHash: manualAgreementHash as Hex,
                    }),
                    commitmentMeta: undefined,
                }
                : await prepareOrderCommitment({
                    processId,
                    buyer: address,
                    seller: seller as Address,
                    currency,
                    payment,
                    expectedCumulativeValue,
                    fallbackParentOrderHashes: linearPredecessorOrderHash ? [linearPredecessorOrderHash] : [],
                });

            if (signedPermit) {
                if (!walletClient.account) {
                    setError("Wallet not connected");
                    return;
                }
                setStep("submitting-permit");
            }

            const result = await submitPreparedCommitment({
                prepared,
                proposerRole: "buyer",
                buyerAddress: address,
                sellerAddress: seller as Address,
                immediateCommitEnabled,
                isE2EMock,
                permit: signedPermit,
                sendTransaction: (request) => walletClient.sendTransaction({
                    account: walletClient.account,
                    ...request,
                }),
                publicClient,
                initiateAsParty,
                signAndBroadcastCommitment: signAndBroadcast,
            });

            if (signedPermit) {
                setSignedPermit(null);
            }

            if (result.mode === "broadcast") {
                await finalizeCommittedOrder(result.hash);
            } else {
                setPrefillMessage("Commitment prepared. Share the payload below to collect the seller signature.");
                setStep("form");
                await resync();
            }
        } catch (err: unknown) {
            handleCommitmentError(err);
        }
    }, [
        form,
        address,
        walletClient,
        publicClient,
        defaultCurrency,
        resync,
        ctx,
        tokenDecimals,
        tokenApproval,
        signedPermit,
        immediateCommitEnabled,
        isE2EMock,
        initiateAsParty,
        signAndBroadcast,
        finalizeCommittedOrder,
        handleCommitmentError,
    ]);

    const handleBroadcastSharedCommitment = useCallback(async () => {
        if (!payload) {
            return;
        }

        try {
            const commitHash = await broadcastSharedCommitment({
                payload,
                broadcast,
            });
            await finalizeCommittedOrder(commitHash);
        } catch (err: unknown) {
            handleCommitmentError(err);
        }
    }, [broadcast, payload, finalizeCommittedOrder, handleCommitmentError]);

    const handleReset = useCallback(() => {
        setStep("form");
        setError(null);
        setTxHash(null);
        setPrefillMessage(null);
        setSignedPermit(null);
        resetCommitmentFlow();
    }, [resetCommitmentFlow]);

    if (!address) {
        return (
            <div className="p-4 text-sm text-zinc-500">
                Connect wallet to create orders.
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-4 p-4">
            <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                Create Order
            </h3>

            {prefillMessage && step === "form" && (
                <div className="rounded-lg border border-blue-700/40 bg-blue-900/20 p-3 text-xs text-blue-200">
                    {prefillMessage}
                </div>
            )}

            {step === "done" && txHash && (
                <div className="rounded-lg border border-emerald-700/50 bg-emerald-900/20 p-3">
                    <p className="text-sm text-emerald-300">Order committed successfully!</p>
                    <p className="mt-1 font-mono text-xs text-emerald-400/70">
                        tx: {txHash.slice(0, 14)}…{txHash.slice(-8)}
                    </p>
                    <button
                        onClick={handleReset}
                        className="mt-2 rounded bg-zinc-700 px-3 py-1 text-xs text-zinc-200 hover:bg-zinc-600"
                    >
                        Create Another
                    </button>
                </div>
            )}

            {(step === "error" || activeError) && (
                <div className="rounded-lg border border-red-700/50 bg-red-900/20 p-3">
                    <p className="text-sm text-red-300">Error</p>
                    <p className="mt-1 whitespace-pre-wrap text-xs text-red-400/80">{activeError}</p>
                    <button
                        onClick={handleReset}
                        className="mt-2 rounded bg-zinc-700 px-3 py-1 text-xs text-zinc-200 hover:bg-zinc-600"
                    >
                        Try Again
                    </button>
                </div>
            )}

            {(step === "form" || step === "error") && (
                <div className="flex flex-col gap-3">
                    {/* Seller */}
                    <div>
                        <label className="mb-1 block text-xs text-zinc-500">Seller Address</label>
                        <input
                            value={form.seller}
                            onChange={(e) => update("seller", e.target.value)}
                            placeholder="0x..."
                            className="w-full rounded bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-200 outline-none focus:ring-1 focus:ring-zinc-600"
                        />
                    </div>

                    {/* Payment */}
                    <div>
                        <label className="mb-1 block text-xs text-zinc-500">Payment (Tokens)</label>
                        <input
                            value={form.payment}
                            onChange={(e) => update("payment", e.target.value)}
                            type="text"
                            inputMode="decimal"
                            className="w-full rounded bg-zinc-900 px-3 py-2 text-xs text-zinc-200 outline-none focus:ring-1 focus:ring-zinc-600"
                        />
                        {paymentPreviewError && (
                            <p className="mt-0.5 text-[10px] text-red-400">{paymentPreviewError}</p>
                        )}
                        {!paymentPreviewError && tokenDecimals !== 18 && (
                            <p className="mt-0.5 text-[10px] text-zinc-600">
                                Token precision: {tokenDecimals} decimals
                            </p>
                        )}
                    </div>

                    {/* Currency */}
                    <div>
                        <label className="mb-1 block text-xs text-zinc-500">Currency (ERC-20 address)</label>
                        <input
                            value={form.currency}
                            onChange={(e) => update("currency", e.target.value)}
                            placeholder={defaultCurrency}
                            className="w-full rounded bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-200 outline-none focus:ring-1 focus:ring-zinc-600"
                        />
                    </div>

                    {/* Agreement hash */}
                    <div>
                        <label className="mb-1 block text-xs text-zinc-500">Agreement Hash (optional)</label>
                        <input
                            value={form.agreementHash}
                            onChange={(e) => update("agreementHash", e.target.value)}
                            placeholder="Auto-generated if empty"
                            className="w-full rounded bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-200 outline-none focus:ring-1 focus:ring-zinc-600"
                        />
                    </div>

                    {/* Sub-order toggle */}
                    <label className="flex items-center gap-2 text-xs text-zinc-400">
                        <input
                            type="checkbox"
                            checked={form.isSubOrder}
                            onChange={(e) => update("isSubOrder", e.target.checked)}
                            className="rounded"
                        />
                        Sub-order (join existing process)
                    </label>

                    {form.isSubOrder && (
                        <div>
                            <label className="mb-1 block text-xs text-zinc-500">Process ID</label>
                            <input
                                value={form.processId}
                                onChange={(e) => update("processId", e.target.value)}
                                placeholder="0x..."
                                className="w-full rounded bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-200 outline-none focus:ring-1 focus:ring-zinc-600"
                            />
                        </div>
                    )}

                    {showApprovalPanel && (
                        <div className="rounded border border-zinc-800 bg-zinc-950/50 p-3">
                            <BondApprovalPanel
                                proposerBond={buyerBond}
                                counterpartyBond={sellerBond}
                                feeAmount={0n}
                                feeBps={0}
                                tokenDecimals={tokenDecimals}
                                approved={approved}
                                currentProcessId={form.isSubOrder ? previewProcessId : null}
                                isBuyerProposal={true}
                                supportsPermit={tokenApproval.supportsPermit}
                                onApprove={handleApprove}
                                onSignPermit={handleSignPermit}
                                availableCredit={0n}
                                walletNeeded={buyerBond}
                            />
                            {signedPermit && (
                                <p className="mt-2 text-[10px] text-emerald-300">
                                    Permit signature captured. Submit will broadcast the permit before creating the commitment.
                                </p>
                            )}
                        </div>
                    )}

                    {/* Submit */}
                    <button
                        onClick={handleSubmit}
                        disabled={approvalPending || isSubmittingPermit || commitmentStep === "signing" || commitmentStep === "broadcasting" || !!paymentPreviewError}
                        className="mt-2 rounded bg-blue-600/80 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 transition-colors"
                    >
                        {immediateCommitEnabled ? "Build, Sign & Commit" : "Create Commitment"}
                    </button>
                </div>
            )}

            {approvalPending && (
                <div className="rounded bg-zinc-800 p-3 text-xs text-zinc-300">
                    Token approval transaction pending…
                </div>
            )}
            {isSubmittingPermit && (
                <div className="rounded bg-zinc-800 p-3 text-xs text-zinc-300">
                    Broadcasting signed permit…
                </div>
            )}
            {commitmentStep === "signing" && (
                <div className="rounded bg-zinc-800 p-3 text-xs text-zinc-300">
                    Signing EIP-712 commitment… (check wallet)
                </div>
            )}
            {commitmentStep === "broadcasting" && (
                <div className="rounded bg-zinc-800 p-3 text-xs text-zinc-300">
                    Submitting commit transaction…
                </div>
            )}

            {payload && step !== "done" && (
                <CommitmentSharePanel
                    payload={payload}
                    step={commitmentStep}
                    onBroadcast={() => {
                        void handleBroadcastSharedCommitment();
                    }}
                />
            )}
        </div>
    );
}
