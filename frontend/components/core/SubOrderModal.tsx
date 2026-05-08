"use client";

import { useState, useEffect } from "react";
import { useAccount, usePublicClient, useSendTransaction } from "wagmi";
import { isAddress, keccak256 } from "viem";
import { CONTRACTS, CORE_ABI } from "@/lib/core/contracts";
import { mockGetOrders } from "@/lib/core/mockEventStore";
import { useOrderStore } from "@/lib/core/store";
import { useCommitmentFlow } from "@/lib/core/useCommitmentFlow";
import { useBondPreview } from "@/hooks/core/useBondPreview";
import { useMounted } from "@/lib/shared/useMounted";
import useTokenDecimals from "@/hooks/core/useTokenDecimals";
import { ManifestForm, ManifestFields, EMPTY_MANIFEST_FIELDS } from "@/components/core/ManifestForm";
import BondApprovalPanel from "@/components/core/BondApprovalPanel";
import { CommitmentSharePanel } from "@/components/core/CommitmentSharePanel";
import { broadcastSharedCommitment } from "@/lib/core/commitmentBroadcast";
import { submitPreparedCommitment } from "@/lib/core/commitmentSubmission";
import { prepareOrderCommitment } from "@/lib/core/orderCommitmentPreparation";
import { handleOrderSurfaceFailure, runOrderSurfaceAction } from "@/lib/core/orderSurfaceActions";
import { buildExpectedCumulativeValue, resolveSubOrderParentHashes } from "@/lib/core/processOrderPreparation";
import { hasRequiredManifestLocations, parsePositiveTokenInput } from "@/lib/core/orderEntryValidation";
import { useOrderApprovalFlow } from "@/lib/core/useOrderApprovalFlow";
import { getE2EModeSession } from "@/lib/shared/e2e";
import { ZERO_ADDRESS } from "@/lib/shared/evm";
import { ModalChrome } from "@/components/ui/ModalChrome";

interface SubOrderModalProps {
    /** The processId this sub-order will be added to. */
    processId: string;
    /** The orderHash of the node that triggered "+". Pre-filled into parentOrderHashes. */
    parentOrderId: string;
    /** Optional pre-filled parent set for multi-parent composition. */
    defaultParentOrderIds?: string[];
    /** Currency from the triggering order — pre-filled into the currency field. */
    defaultCurrency: string;
    onClose: () => void;
}

export function SubOrderModal({
    processId,
    parentOrderId,
    defaultParentOrderIds,
    defaultCurrency,
    onClose,
}: SubOrderModalProps) {
    const { address } = useAccount();
    const publicClient = usePublicClient();
    const contractAddress = CONTRACTS.core;
    const e2eMode = getE2EModeSession();
    const isE2EMock = e2eMode === "mock";
    const isE2EDevnet = e2eMode === "devnet";

    const setViewedProcessId = useOrderStore((s) => s.setViewedProcessId);
    const bumpProcessReload = useOrderStore((s) => s.bumpProcessReload);

    const [counterparty, setCounterparty] = useState("");
    // Currency is fixed for the process — not a subOrder parameter.
    // We hold it only so the bond-preview / approval panel can compute amounts.
    const currency = defaultCurrency;
    const { decimals: tokenDecimals } = useTokenDecimals(currency as `0x${string}`);
    const [payment, setPayment] = useState("");
    const [paymentError, setPaymentError] = useState<string | null>(null);
    const [parentOrderIds, setParentOrderIds] = useState<string>(
        defaultParentOrderIds && defaultParentOrderIds.length > 0
            ? defaultParentOrderIds.join(", ")
            : parentOrderId
    );
    const [manifestFields, setManifestFields] = useState<ManifestFields>(EMPTY_MANIFEST_FIELDS);
    const [showManifestValidation, setShowManifestValidation] = useState(false);
    const [error, setError] = useState<string | undefined>(undefined);
    /** Permit signature from signPermitForTx — set when token supports EIP-2612. */
    const [subOrderPermitSig, setSubOrderPermitSig] = useState<{ target: `0x${string}`; data: `0x${string}` } | null>(null);
    const [status, setStatus] = useState<"idle" | "busy" | "done">("idle");
    const mounted = useMounted();

    const {
        initiateAsParty,
        broadcast,
        signAndBroadcast: signAndBroadcastCommitment,
        step: commitStep,
        payload,
    } = useCommitmentFlow();
    const { sendTransactionAsync } = useSendTransaction();
    const immediateCommitEnabled = mounted && (isE2EMock || isE2EDevnet);
    const modalPayload = payload?.commitment.processId === processId ? payload : null;

    // Bond preview scoped to the viewed processId (for accurate cumulative bond calc)
    const { paymentPreview, buyerBond, sellerBond } =
        useBondPreview({ payment, tokenDecimals, currentProcessId: processId });

    const {
        approved,
        approveBond,
        signPermitForBond,
        tokenApproval,
    } = useOrderApprovalFlow({
        tokenAddress: currency as `0x${string}`,
        owner: address as `0x${string}` | undefined,
        spender: contractAddress as `0x${string}`,
        amount: buyerBond,
        currency,
        hasPermit: subOrderPermitSig !== null,
        onPermitSigned: setSubOrderPermitSig,
    });

    const handleApprove = async () => {
        await runOrderSurfaceAction({
            action: approveBond,
            failureMessage: "Token approval failed",
            logLabel: "Approve failed",
            onClearError: () => setError(undefined),
            onError: (message) => setError(message),
        });
    };

    /** Signs an EIP-2612 permit off-chain (gas-free). Falls back to approve on failure. */
    const handleSignPermit = async () => {
        await runOrderSurfaceAction({
            action: signPermitForBond,
            failureMessage: "Permit signing failed",
            logLabel: "Permit signing failed",
            onClearError: () => setError(undefined),
            onError: (message) => setError(message),
        });
    };

    const handleCommitmentError = (e: unknown) => {
        handleOrderSurfaceFailure(e, {
            failureMessage: "Transaction failed",
            maxErrorLength: 100,
            onBeforeError: () => setStatus("idle"),
            onError: (message) => setError(message),
        });
    };

    const finalizeCommittedSubOrder = () => {
        setStatus("done");
        setViewedProcessId(processId);
        bumpProcessReload();
        onClose();
    };

    const handleSubmit = async () => {
        if (!isE2EMock) {
            if (!counterparty || !payment) { setError("Fill in seller address and payment"); return; }
            if (!isAddress(counterparty)) { setError("Invalid counterparty address"); return; }
        }
        if (!hasRequiredManifestLocations(manifestFields)) {
            setShowManifestValidation(true);
            setError("Please fill in origin and destination");
            return;
        }
        try {
            const { amount: paymentValue, error: paymentErrorMessage } = parsePositiveTokenInput(payment, tokenDecimals);
            if (!paymentValue) { setError(paymentErrorMessage ?? "Payment must be positive"); return; }
            const parentHashes = resolveSubOrderParentHashes({
                parentOrderIds,
                defaultParentOrderIds,
                parentOrderId,
            });

            const buyerAddress = (address ?? ZERO_ADDRESS) as `0x${string}`;
            const sellerAddress = (counterparty || ZERO_ADDRESS) as `0x${string}`;
            const currencyAddress = (currency || ZERO_ADDRESS) as `0x${string}`;
            setStatus("busy");
            // Read current process cumulative value from chain
            let expectedCumulativeValue = paymentValue;
            if (isE2EMock) {
                const currentCumulativeValue = mockGetOrders()
                    .filter((order) => order.processId === processId)
                    .reduce(
                        (max, order) => order.cumulativeValue > max ? order.cumulativeValue : max,
                        0n,
                    );
                expectedCumulativeValue = buildExpectedCumulativeValue(currentCumulativeValue, paymentValue);
            } else if (publicClient) {
                const processState = await publicClient.readContract({
                    address: contractAddress as `0x${string}`,
                    abi: CORE_ABI,
                    functionName: "processes",
                    args: [processId as `0x${string}`],
                });
                const currentCumulativeValue = (processState as readonly [string, string, bigint, bigint])[2];
                expectedCumulativeValue = buildExpectedCumulativeValue(currentCumulativeValue, paymentValue);
            }

            const prepared = await prepareOrderCommitment({
                processId: processId as `0x${string}`,
                buyer: buyerAddress,
                seller: sellerAddress,
                currency: currencyAddress,
                payment: paymentValue,
                expectedCumulativeValue,
                manifestFields,
                parentOrderHashes: parentHashes,
            });
            const result = await submitPreparedCommitment({
                prepared,
                proposerRole: "buyer",
                buyerAddress,
                sellerAddress,
                immediateCommitEnabled,
                isE2EMock,
                permit: !isE2EMock && subOrderPermitSig ? subOrderPermitSig : null,
                sendTransaction: sendTransactionAsync,
                publicClient,
                waitForCommitReceipt: true,
                initiateAsParty,
                signAndBroadcastCommitment,
            });

            if (result.mode === "shared") {
                setStatus("idle");
                return;
            }
            finalizeCommittedSubOrder();
        } catch (e: unknown) {
            handleCommitmentError(e);
        }
    };

    useEffect(() => {
        setError(undefined);
        setSubOrderPermitSig(null);
    }, [counterparty, currency, payment, manifestFields]);

    useEffect(() => {
        setParentOrderIds(
            defaultParentOrderIds && defaultParentOrderIds.length > 0
                ? defaultParentOrderIds.join(", ")
                : parentOrderId
        );
    }, [defaultParentOrderIds, parentOrderId]);

    const handleBroadcastSharedCommitment = async () => {
        if (!modalPayload) return;

        setStatus("busy");
        try {
            await broadcastSharedCommitment({
                payload: modalPayload,
                broadcast,
                publicClient,
                waitForReceipt: !isE2EMock,
            });
            finalizeCommittedSubOrder();
        } catch (e: unknown) {
            handleCommitmentError(e);
        }
    };

    return (
        <ModalChrome
            onClose={onClose}
            aria-label="Add Sub-order"
            align="top"
            panelTestId="suborder-modal"
            panelClassName="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6 relative flex-shrink-0 max-h-[calc(100vh-3rem)] overflow-y-auto"
        >
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold text-black">Add Sub-order</h2>
                    <button
                        onClick={onClose}
                        className="text-gray-500 hover:text-gray-600 text-xl leading-none min-h-[44px] min-w-[44px] flex items-center justify-center"
                        aria-label="Close"
                    >
                        ×
                    </button>
                </div>

                <div className="text-xs text-gray-500 mb-1 font-mono truncate">
                    Process: {processId.slice(0, 16)}…
                </div>
                <div className="text-xs text-gray-500 mb-4 font-mono truncate">
                    Currency: {currency ? `${currency.slice(0, 10)}…` : "—"} <span className="italic">(fixed by process)</span>
                </div>

                {error && (
                    <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2 mb-4">
                        {error}
                    </div>
                )}

                <div className="flex flex-col gap-3">
                    {/* Counterparty */}
                    <div>
                        <label className="text-xs font-medium text-black">Seller Address</label>
                        <input
                            data-testid="suborder-input-counterparty"
                            type="text"
                            placeholder="0x…"
                            value={counterparty}
                            onChange={(e) => setCounterparty(e.target.value)}
                            className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm font-mono"
                        />
                    </div>

                    {/* Payment */}
                    <div>
                        <label className="text-xs font-medium text-black">Payment</label>
                        <input
                            data-testid="suborder-input-payment"
                            type="text"
                            inputMode="decimal"
                            placeholder="0.0"
                            value={payment}
                            onChange={(e) => {
                                const v = e.target.value;
                                if (v.startsWith("-")) { setPaymentError("Cannot be negative"); return; }
                                setPayment(v);
                                const n = Number(v);
                                setPaymentError(v && (!Number.isFinite(n) || n <= 0) ? "Must be a positive number" : null);
                            }}
                            className={`mt-1 w-full border rounded px-3 py-2 text-sm ${paymentError ? "border-red-500" : "border-gray-300"}`}
                        />
                        {paymentError && <p className="text-xs text-red-600 mt-1">{paymentError}</p>}
                    </div>

                    {/* Manifest */}
                    <div>
                        <label className="text-xs font-medium text-black">Manifest</label>
                        <div className="mt-1">
                            <ManifestForm
                                value={manifestFields}
                                onChange={setManifestFields}
                                showValidation={showManifestValidation}
                            />
                        </div>
                    </div>

                    {/* Parent Order IDs — pre-filled from the node that triggered "+" */}
                    <div>
                        <label className="text-xs font-medium text-black">Parent Order ID(s)</label>
                        <input
                            data-testid="suborder-input-parent-order-ids"
                            type="text"
                            placeholder="e.g. 4, 5"
                            value={parentOrderIds}
                            onChange={(e) => setParentOrderIds(e.target.value)}
                            className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm"
                        />
                        <p className="text-xs text-gray-500 mt-0.5">Pre-filled from the order you clicked. Edit for multiple parents.</p>
                    </div>
                </div>

                {/* Bond & Approval Panel */}
                {!!currency && paymentPreview > 0n && (
                    <div className="mt-4">
                        <BondApprovalPanel
                            proposerBond={buyerBond}
                            counterpartyBond={sellerBond}
                            feeAmount={0n}
                            feeBps={0}
                            tokenDecimals={tokenDecimals}
                            approved={approved}
                            currentProcessId={processId}
                            isBuyerProposal={true}
                            supportsPermit={tokenApproval.supportsPermit}
                            onApprove={handleApprove}
                            onSignPermit={handleSignPermit}
                        />
                    </div>
                )}

                {modalPayload && (
                    <div className="mt-4">
                        <CommitmentSharePanel
                            payload={modalPayload}
                            step={commitStep}
                            tokenDecimals={tokenDecimals}
                            onBroadcast={() => {
                                void handleBroadcastSharedCommitment();
                            }}
                        />
                    </div>
                )}

                {/* Submit */}
                <button
                    data-testid="suborder-btn-submit"
                    onClick={handleSubmit}
                    disabled={status === "busy" || !!paymentError}
                    className="mt-4 w-full py-2.5 rounded bg-black text-white text-sm font-semibold hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {status === "busy" ? "Processing..." : immediateCommitEnabled ? "Commit Sub-order" : "Create Commitment"}
                </button>
        </ModalChrome>
    );
}
