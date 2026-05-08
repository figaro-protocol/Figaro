"use client";

import { useState, useEffect, useRef } from "react";
import { useAccount, useChainId, usePublicClient, useSendTransaction, useWaitForTransactionReceipt } from "wagmi";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { FormField } from "@/components/ui/FormField";
import { CORE_ABI, CONTRACTS } from "@/lib/core/contracts";
import { TEST_HELPERS_ENABLED, windowSafe } from '@/lib/core/testHelpers';
import { useMounted } from "@/lib/shared/useMounted";
import useTokenDecimals from "@/hooks/core/useTokenDecimals";
import useTokenApproval from "@/hooks/core/useTokenApproval";
import { useBondPreview } from "@/hooks/core/useBondPreview";
import { useOrderStore } from "@/lib/core/store";
import { ManifestForm, ManifestFields, EMPTY_MANIFEST_FIELDS } from "@/components/core/ManifestForm";
import { decodeEventLog, isAddress } from "viem";
import Plus from "@/components/icons/Plus";
import OrderErrorMessage from "@/components/core/OrderErrorMessage";
import OrderConfirmationModal from "@/components/core/OrderConfirmationModal";
import BondApprovalPanel from "@/components/core/BondApprovalPanel";
import { CommitmentSharePanel } from "@/components/core/CommitmentSharePanel";
import { broadcastSharedCommitment } from "@/lib/core/commitmentBroadcast";
import PermitControl from "@/components/core/PermitControl";
import { useFigaroActions } from "@/lib/core/useFigaroActions";
import { useCommitmentFlow } from "@/lib/core/useCommitmentFlow";
import { submitPreparedCommitment } from "@/lib/core/commitmentSubmission";
import { prepareOrderCommitment } from "@/lib/core/orderCommitmentPreparation";
import { runOrderSurfaceAction } from "@/lib/core/orderSurfaceActions";
import { hasRequiredManifestLocations, parsePositiveTokenInput } from "@/lib/core/orderEntryValidation";
import { clearTestHelperAllowance } from "@/lib/core/orderApproval";
import { useOrderApprovalFlow } from "@/lib/core/useOrderApprovalFlow";
import { showError, showSuccess } from "@/lib/shared/toast";
import { getE2EModeSession } from "@/lib/shared/e2e";
import { ZERO_ADDRESS, ZERO_PROCESS_ID, hexEqual } from "@/lib/shared/evm";
import { computeCommitmentProcessId } from "@/lib/console/commitmentStore";

export function OrderControls() {
    const { address } = useAccount();
    const chainId = useChainId();
    const publicClient = usePublicClient();
    const contractAddress = CONTRACTS.core;
    const e2eMode = getE2EModeSession();
    const isE2EMock = e2eMode === 'mock';
    const isE2EDevnet = e2eMode === 'devnet';
    if (typeof window !== 'undefined') {
        // eslint-disable-next-line no-console
        console.log('[OrderControls] mount', {
            e2eMode,
            isE2EMock,
            isE2EDevnet,
            location: window.location.href,
            address,
            contractAddress,
        });
    }
    if (typeof window !== 'undefined') {
        // eslint-disable-next-line no-console
        console.log('[OrderControls] mount', {
            e2eMode,
            isE2EMock,
            isE2EDevnet,
            location: window.location.href,
            address,
            contractAddress,
        });
    }
    // After firstOrder succeeds, navigate the graph to the new processId.
    const setViewedProcessId = useOrderStore((state) => state.setViewedProcessId);
    const bumpProcessReload = useOrderStore((state) => state.bumpProcessReload);

    // Proposer role: true = buyer, false = seller
    const [isBuyerProposal, setIsBuyerProposal] = useState(true);
    const [counterparty, setCounterparty] = useState("");
    const [currency, setCurrency] = useState("");
    const { decimals: tokenDecimals } = useTokenDecimals(currency as `0x${string}`);
    const [payment, setPayment] = useState("");
    const [paymentError, setPaymentError] = useState<string | null>(null);
    const [manifestFields, setManifestFields] = useState<ManifestFields>(EMPTY_MANIFEST_FIELDS);
    const [showManifestValidation, setShowManifestValidation] = useState(false);
    // Incrementing this key forces ManifestForm to remount on reset, clearing internal state
    // such as the "advancedOpen" toggle so the form fully collapses after submission.
    const [manifestFormKey, setManifestFormKey] = useState(0);
    const [permitEnabled, setPermitEnabled] = useState(false);
    const [permitTarget, setPermitTarget] = useState<string | null>(null);
    const [permitData, setPermitData] = useState<string | null>(null);
    // Tracks mock approval in E2E mock mode — wagmi allowance query is disabled
    // when address is undefined (no real wallet), so refetchAllowance() is a no-op.
    // A dedicated state ensures a React re-render after __FIGARO_MOCK_APPROVE__ runs.
    const [mockApproved, setMockApproved] = useState(false);

    // Mounted guard: prevents disabled/address hydration mismatch (server always has no wallet)
    const mounted = useMounted();

    // Error and modal state — declared at top so every hook below can reference setError
    const [error, setError] = useState<string | undefined>(undefined);
    const [modalOpen, setModalOpen] = useState(false);
    const [modalMessage, setModalMessage] = useState<string>("");

    const { hash, isPending, mockIsSuccess } = useFigaroActions();

    const { sendTransactionAsync } = useSendTransaction();

    const {
        initiateAsParty,
        broadcast,
        signAndBroadcast: signAndBroadcastCommitment,
        step: commitStep,
        error: commitError,
        payload,
    } = useCommitmentFlow();

    const { isLoading: isConfirming, isSuccess, data: receipt } = useWaitForTransactionReceipt({
        hash,
    });

    // Ref to prevent re-processing the same receipt on re-renders
    const processedTxHash = useRef<string | null>(null);
    const handledCommitSuccessKey = useRef<string | null>(null);
    const immediateCommitEnabled = mounted && (isE2EMock || isE2EDevnet);
    const sharePayload = payload?.commitment.processId === ZERO_PROCESS_ID ? payload : null;
    const displayError = error ?? commitError ?? undefined;

    // token decimals are provided by `useTokenDecimals`

    // A3: permit-loader runs once on mount only
    useEffect(() => {
        try {
            if (TEST_HELPERS_ENABLED) {
                const _win = windowSafe();
                // @ts-ignore
                if (_win && _win.__FIGARO_PENDING_PERMIT__) {
                    // @ts-ignore
                    const p = _win.__FIGARO_PENDING_PERMIT__;
                    setPermitEnabled(true);
                    setPermitTarget(p.target || null);
                    setPermitData(p.data || null);
                }
            }
        } catch (e) {
            console.error("Permit state init failed", e);
        }
    }, []);

    // A3: receipt parser runs only when a new confirmed tx arrives
    useEffect(() => {
        if ((isSuccess || mockIsSuccess) && receipt && receipt.transactionHash !== processedTxHash.current) {
            processedTxHash.current = receipt.transactionHash;
            // Force useProcessOrders to re-scan getLogs after ANY confirmed TX so
            // state transitions (accept, cancel, resolve) are never missed.
            bumpProcessReload();
            for (const log of receipt.logs) {
                try {
                    const event = decodeEventLog({
                        abi: CORE_ABI,
                        data: log.data,
                        topics: log.topics,
                    });

                    if (event.eventName === "OrderCommitted") {
                        const args = event.args;
                        // Navigate the graph to the newly-created process.
                        if ('processId' in args && args.processId) {
                            console.log("New process committed:", args.processId);
                            setViewedProcessId(args.processId as string);
                        }
                    }
                } catch (e) {
                    // Ignore logs that don't match ABI (e.g. ERC20 Transfer)
                }
            }
        }
    }, [isSuccess, mockIsSuccess, receipt, setViewedProcessId, bumpProcessReload]);

    useEffect(() => {
        if (isE2EMock) return;
        if (!sharePayload || !CONTRACTS.core) return;

        const pendingProcessId = computeCommitmentProcessId(
            sharePayload.commitment,
            chainId,
            CONTRACTS.core,
        );
        setViewedProcessId(pendingProcessId);
    }, [chainId, isE2EMock, setViewedProcessId, sharePayload]);

    const handleCreateOrder = async () => {
        if (!address && !isE2EMock) {
            setError('Please connect your wallet');
            return;
        }

        if (!isE2EMock && (!contractAddress || !counterparty || !payment || !currency)) {
            setError('Please fill in payment and addresses');
            return;
        }

        if (!isE2EMock) {
            if (!isAddress(currency)) {
                setError('Invalid currency address format');
                return;
            }
            if (!isAddress(counterparty)) {
                setError('Invalid counterparty address format');
                return;
            }
        }

        // Require origin and destination in all modes
        if (!hasRequiredManifestLocations(manifestFields)) {
            setShowManifestValidation(true);
            setError('Please fill in origin and destination');
            return;
        }

        try {
            const { amount: paymentValue, error: paymentErrorMessage } = parsePositiveTokenInput(payment, tokenDecimals, {
                nonPositiveMessage: 'Payment must be a positive amount',
            });
            if (!paymentValue) {
                setError(paymentErrorMessage ?? 'Payment must be a positive amount');
                return;
            }
            const proposerRole = isBuyerProposal ? "buyer" : "seller";
            const connectedAddress = (address ?? ZERO_ADDRESS) as `0x${string}`;
            const buyerAddress = (isBuyerProposal
                ? connectedAddress
                : (counterparty || ZERO_ADDRESS)) as `0x${string}`;
            const sellerAddress = (isBuyerProposal
                ? (counterparty || ZERO_ADDRESS)
                : connectedAddress) as `0x${string}`;
            const currencyAddress = (currency || ZERO_ADDRESS) as `0x${string}`;
            const prepared = await prepareOrderCommitment({
                buyer: buyerAddress,
                seller: sellerAddress,
                currency: currencyAddress,
                payment: paymentValue,
                manifestFields,
            });
            await submitPreparedCommitment({
                prepared,
                proposerRole,
                buyerAddress,
                sellerAddress,
                immediateCommitEnabled,
                isE2EMock,
                permit: !isE2EMock && permitEnabled && permitTarget && permitData
                    ? {
                        target: permitTarget as `0x${string}`,
                        data: permitData as `0x${string}`,
                    }
                    : null,
                sendTransaction: sendTransactionAsync,
                publicClient,
                initiateAsParty,
                signAndBroadcastCommitment,
            });
        } catch (error) {
            if (error instanceof SyntaxError || (error instanceof Error && error.message.includes('decimal'))) {
                // Targeted message for input parsing errors that are not tx failures
                const msg = error.message.includes('decimal')
                    ? 'Payment has too many decimal places for this token'
                    : 'Parent order IDs must be whole numbers (e.g. 1, 2, 3)';
                setError(msg);
            } else {
                console.error("Order creation failed:", error);
                showError(error, 'Order creation failed');
            }
        }
    };

    const {
        paymentPreview,
        buyerBond,
        sellerBond,
        newCumulativeValue,
    } = useBondPreview({ payment, tokenDecimals, currentProcessId: null });

    // Live kernel: no fee and no internal credit. Wallet always needs the full bond.
    const totalNeeded = isBuyerProposal ? buyerBond : sellerBond;
    const walletNeeded = totalNeeded;

    const approvalAmount = walletNeeded ?? totalNeeded;
    const {
        approved,
        approveBond,
        signPermitForBond,
        resetApprovalState,
        tokenApproval,
    } = useOrderApprovalFlow({
        tokenAddress: currency as `0x${string}`,
        owner: address as `0x${string}` | undefined,
        spender: contractAddress as `0x${string}`,
        amount: approvalAmount,
        currency,
        hasPermit: permitEnabled && !!permitTarget && !!permitData,
        onPermitSigned: (signedPermit) => {
            setPermitEnabled(true);
            setPermitTarget(signedPermit.target);
            setPermitData(signedPermit.data);
        },
    });

    const handleApprove = async () => {
        await runOrderSurfaceAction({
            action: approveBond,
            failureMessage: "Token approval failed",
            logLabel: "Approve flow failed",
            onError: (_message, error) => showError(error, "Token approval failed"),
        });
    };

    const handleSignPermit = async () => {
        await runOrderSurfaceAction({
            action: signPermitForBond,
            failureMessage: "Permit signing failed",
            logLabel: "Permit signing failed",
            onError: (_message, error) => showError(error, "Permit signing failed"),
        });
    };

    const commitDone = isSuccess || mockIsSuccess || commitStep === 'done';
    const commitSuccessKey = isSuccess && hash
        ? hash
        : mockIsSuccess
            ? 'mock-success'
            : commitStep === 'done'
                ? 'shared-done'
                : null;
    const counterpartyMatchesConnectedWallet = hexEqual(counterparty, address);
    const missingRequirements: string[] = [];

    if (!mounted && !isE2EMock) {
        missingRequirements.push("initializing wallet state");
    }
    if (!address && !isE2EMock) {
        missingRequirements.push("connect wallet");
    }
    if (!counterparty.trim()) {
        missingRequirements.push("enter counterparty address");
    } else if (!isE2EMock && !isAddress(counterparty)) {
        missingRequirements.push("use a valid counterparty address");
    } else if (counterpartyMatchesConnectedWallet) {
        missingRequirements.push("use a different counterparty wallet");
    }
    if (!currency.trim()) {
        missingRequirements.push("enter ERC-20 currency address");
    } else if (!isE2EMock && !isAddress(currency)) {
        missingRequirements.push("use a valid currency address");
    }
    if (!payment.trim()) {
        missingRequirements.push("enter payment amount");
    }
    if (!manifestFields.origin?.trim()) {
        missingRequirements.push("set origin");
    }
    if (!manifestFields.destination?.trim()) {
        missingRequirements.push("set destination");
    }

    const submitBlocked = missingRequirements.length > 0 || isPending || isConfirming || !!paymentError;

    // Show modal on transaction pending/confirm/fail, and reset form on success
    useEffect(() => {
        if (isPending) {
            handledCommitSuccessKey.current = null;
            setModalMessage("Waiting for wallet confirmation and transaction to be mined...");
            setModalOpen(true);
        } else if (isConfirming) {
            handledCommitSuccessKey.current = null;
            setModalMessage("Transaction submitted. Waiting for confirmation...");
            setModalOpen(true);
        } else if (commitSuccessKey && handledCommitSuccessKey.current !== commitSuccessKey) {
            handledCommitSuccessKey.current = commitSuccessKey;
            setModalMessage("Order confirmed on-chain! You may continue.");
            setModalOpen(true);
            // Reset form fields after a successful order submission
            setPayment("");
            setCounterparty("");
            setCurrency("");
            setManifestFields(EMPTY_MANIFEST_FIELDS);
            setShowManifestValidation(false);
            setManifestFormKey(k => k + 1);
            setPermitEnabled(false);
            setPermitTarget(null);
            setPermitData(null);
            resetApprovalState();
            // Clear the test-mode allowance for the current currency so the next
            // sub-order starts unapproved and the approve-button re-appears.
            clearTestHelperAllowance(currency);
        } else if (displayError) {
            setModalMessage("Transaction failed. Please try again.");
            setModalOpen(true);
        } else {
            setModalOpen(false);
        }
    }, [isPending, isConfirming, commitSuccessKey, displayError, currency, resetApprovalState]);

    // Clear stale validation/tx error when the user modifies the form.
    // Also reset mockApproved if the token changes — a different currency needs a fresh approval.
    useEffect(() => {
        setError(undefined);
        resetApprovalState();
    }, [counterparty, currency, payment, manifestFields, isBuyerProposal, permitEnabled, resetApprovalState]);

    // Previously we blocked rendering the create-order form until the user
    // connected a wallet. Show the form regardless; submission remains
    // disabled when no wallet is connected (button uses `disabled`).

    // Ensure no stray JSX or tokens here
    return (
        <Card
            className="p-6 w-full max-w-2xl mx-auto mt-6"
            data-testid="order-controls-root"
            data-e2e-mode={e2eMode || 'none'}
        >
            <div data-testid="create-order-form" role="form" aria-label="Create Order Form">
                <OrderConfirmationModal
                    open={modalOpen}
                    onDismiss={() => setModalOpen(false)}
                    message={modalMessage}
                    dismissable={commitDone || !!displayError}
                />
                <div className="flex items-center justify-between mb-6">
                    <h2 data-testid="create-order-heading" className="text-2xl font-bold flex items-center gap-2">
                        <Plus className="w-5 h-5 text-black" />
                        <span>Create Order</span>
                    </h2>
                </div>
                <OrderErrorMessage error={displayError} />
                <hr className="my-4 border-gray-100" />

                <form className="flex flex-col gap-4" autoComplete="off">


                    {/* Proposer role toggle — always shown (form always creates a new process) */}
                    <fieldset className="flex items-center gap-4">
                        <legend className="text-xs text-black">I am the:</legend>
                        <label className="flex items-center gap-2 text-sm">
                            <input
                                type="radio"
                                name="proposer-role"
                                checked={isBuyerProposal}
                                onChange={() => setIsBuyerProposal(true)}
                            />
                            Buyer
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                            <input
                                type="radio"
                                name="proposer-role"
                                checked={!isBuyerProposal}
                                onChange={() => setIsBuyerProposal(false)}
                            />
                            Seller
                        </label>
                    </fieldset>

                    {/* Counterparty Address */}
                    <FormField label="Counterparty Address" inputId="order-counterparty-input" error={counterpartyMatchesConnectedWallet ? 'Buyer and seller cannot be the same address.' : null} required>
                        <Input
                            id="order-counterparty-input"
                            data-testid="input-counterparty"
                            type="text"
                            placeholder="0x..."
                            value={counterparty}
                            required
                            hasError={counterpartyMatchesConnectedWallet}
                            errorId={counterpartyMatchesConnectedWallet ? 'order-counterparty-input-error' : undefined}
                            onChange={e => setCounterparty(e.target.value)}
                            className="font-mono"
                        />
                    </FormField>

                    {/* ERC-20 Currency */}
                    <FormField label="ERC-20 Currency" inputId="order-currency-input" required>
                        <Input
                            id="order-currency-input"
                            data-testid="input-currency"
                            type="text"
                            placeholder="0x..."
                            value={currency}
                            onChange={e => setCurrency(e.target.value as `0x${string}`)}
                            className="font-mono"
                        />
                        <div className="flex justify-end mt-1">
                            <button
                                data-testid="btn-use-default-token"
                                type="button"
                                onClick={() => setCurrency(CONTRACTS.mockToken)}
                                className="text-xs text-black underline bg-white border-none cursor-pointer p-0 hover:text-gray-700"
                            >
                                Use Default MockToken
                            </button>
                        </div>
                        <PermitControl
                            currency={currency}
                            permitEnabled={permitEnabled}
                            permitTarget={permitTarget}
                            onPermitEnabledChange={setPermitEnabled}
                            onPermitTargetChange={setPermitTarget}
                            onPermitDataChange={setPermitData}
                        />
                        <p className="text-[11px] text-amber-600 mt-2">
                            ⚠ Rebase and fee-on-transfer tokens are not supported. FigaroCore
                            detects fee-on-transfer at commitment time (reverts with
                            FeeOnTransferDetected), but rebase tokens may cause bond accounting
                            mismatches. Use standard ERC-20 tokens only.
                        </p>
                    </FormField>

                    {/* Payment */}
                    <FormField label="Payment (Tokens)" inputId="order-payment-input" error={paymentError} required>
                        <Input
                            id="order-payment-input"
                            data-testid="input-payment"
                            type="text"
                            inputMode="decimal"
                            placeholder="0.0"
                            value={payment}
                            required
                            hasError={!!paymentError}
                            errorId={paymentError ? "order-payment-input-error" : undefined}
                            onChange={e => {
                                const v = e.target.value;
                                // Prevent negative input from being accepted
                                if (v.startsWith('-')) {
                                    setPayment('');
                                    setPaymentError('Payment cannot be negative');
                                    return;
                                }
                                setPayment(v);
                                try {
                                    if (!v || v.trim() === '') {
                                        setPaymentError(null);
                                        return;
                                    }
                                    const n = Number(v);
                                    if (Number.isNaN(n) || !Number.isFinite(n) || n <= 0) {
                                        setPaymentError('Payment must be a positive number');
                                    } else {
                                        setPaymentError(null);
                                    }
                                } catch (e) {
                                    setPaymentError('Invalid payment');
                                }
                            }}
                        />
                    </FormField>

                    {/* Manifest */}
                    <FormField label="Manifest" inputId="manifest-input-origin">
                        <ManifestForm
                            key={manifestFormKey}
                            value={manifestFields}
                            onChange={setManifestFields}
                            showValidation={showManifestValidation}
                        />
                    </FormField>

                </form>

                {/* Bond & Approval */}
                {!!currency && paymentPreview > 0n && (
                    <BondApprovalPanel
                        proposerBond={isBuyerProposal ? buyerBond : sellerBond}
                        counterpartyBond={isBuyerProposal ? sellerBond : buyerBond}
                        feeAmount={0n}
                        feeBps={0}
                        tokenDecimals={tokenDecimals}
                        approved={approved}
                        currentProcessId={null}
                        isBuyerProposal={isBuyerProposal}
                        supportsPermit={tokenApproval.supportsPermit}
                        onApprove={handleApprove}
                        onSignPermit={handleSignPermit}
                        availableCredit={0n}
                        walletNeeded={walletNeeded}
                    />
                )}

                {sharePayload && (
                    <div className="mt-4">
                        <CommitmentSharePanel
                            payload={sharePayload}
                            step={commitStep}
                            tokenDecimals={tokenDecimals}
                            onBroadcast={() => {
                                void broadcastSharedCommitment({
                                    payload: sharePayload,
                                    broadcast,
                                });
                            }}
                        />
                    </div>
                )}

                <Button
                    data-testid="btn-submit-order"
                    onClick={handleCreateOrder}
                    disabled={submitBlocked}
                    className="w-full mt-4"
                    size="default"
                >
                    {isPending || isConfirming ? "Processing..." : immediateCommitEnabled ? "Commit Order" : "Create Commitment"}
                </Button>
                {submitBlocked && !(isPending || isConfirming) ? (
                    <p className="mt-2 text-xs text-neutral-500" data-testid="order-submit-requirements">
                        Complete the remaining setup: {missingRequirements.join(", ")}.
                    </p>
                ) : null}
            </div>
        </Card>
    );
}