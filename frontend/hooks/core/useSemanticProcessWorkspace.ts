"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAccount, usePublicClient, useWaitForTransactionReceipt } from "wagmi";
import { useWalletProcessIds } from "@/hooks/core/useWalletProcessIds";
import { useProcessOrders } from "@/hooks/core/useProcessOrders";
import useTokenApproval from "@/hooks/core/useTokenApproval";
import { CONTRACTS, CORE_ABI } from "@/lib/core/contracts";
import { OrderState, useOrderStore } from "@/lib/core/store";
import { useFigaroActions } from "@/lib/core/useFigaroActions";
import { isE2EMockSession } from "@/lib/shared/e2e";
import { useMerchantProcessActions } from "@/lib/mechanisms/useMerchantProcess";
import { useCourierProcessActions } from "@/lib/mechanisms/useCourierProcess";
import { useDutchAuctionActions } from "@/lib/mechanisms/useDutchAuction";
import { useGhgDisclosureActions } from "@/lib/mechanisms/useGHGDisclosure";
import { useRegisterOperator, useUpdateProfile, useWithdrawDeposit, useRegistrationDeposit } from "@/lib/mechanisms/useOperatorRegistry";
import { deriveProcessModelFromRuntime } from "@/lib/semantic/deriveProcessModelFromRuntime";
import { extractErrorMessage } from "@/lib/shared/errors";
import { CapabilityActionDescriptor, CapabilityExecutionInput, CapabilityModel, OrderNodeModel } from "@/lib/semantic/models";
import { buildResolutionCommitments } from "@/lib/core/commitmentStore";
import { executeTransactionCapabilityAction } from "@/lib/core/executeTransactionCapability";
import type { Hex } from "viem";

function collectRuntimeCapabilities(capabilities: CapabilityModel[]): CapabilityModel[] {
    const seen = new Set<string>();

    return capabilities.filter((capability) => {
        if (seen.has(capability.id)) return false;
        seen.add(capability.id);
        return true;
    }).sort((left, right) => (right.uiPriority ?? 0) - (left.uiPriority ?? 0));
}

interface Options {
    processId: string | null;
}

export function useSemanticProcessWorkspace({ processId }: Options) {
    const { address } = useAccount();
    const publicClient = usePublicClient();
    const isE2EMock = isE2EMockSession();
    const bumpProcessReload = useOrderStore((state) => state.bumpProcessReload);
    const walletProcesses = useWalletProcessIds(address);
    const effectiveProcessId = processId ?? walletProcesses[0]?.processId ?? null;
    const processOrders = useProcessOrders(effectiveProcessId);
    const selectedCurrency = processOrders[0]?.currency as `0x${string}` | undefined;
    const approvalTokenAddress = (selectedCurrency ?? CONTRACTS.mockToken) as `0x${string}`;
    const [executingCapabilityId, setExecutingCapabilityId] = useState<string | null>(null);
    const [activeActionLabel, setActiveActionLabel] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const lastFailedActionRef = useRef<{ capability: CapabilityModel; input?: CapabilityExecutionInput } | null>(null);
    const [selectedParentOrderIds, setSelectedParentOrderIds] = useState<Set<string>>(new Set());
    const [subOrderParent, setSubOrderParent] = useState<{ orderIds: string[]; currency?: `0x${string}` } | null>(null);
    const { resolveProcess, hash, isPending, mockIsSuccess } = useFigaroActions();
    const merchantProcessActions = useMerchantProcessActions();
    const courierProcessActions = useCourierProcessActions();
    const dutchAuctionActions = useDutchAuctionActions();
    const registerOperator = useRegisterOperator();
    const updateOperatorProfile = useUpdateProfile();
    const withdrawOperatorDeposit = useWithdrawDeposit();
    const registrationDeposit = useRegistrationDeposit();
    const ghgDisclosureActions = useGhgDisclosureActions();
    const {
        supportsPermit,
        needsApproval,
        approve,
        signPermitForTx,
        refetchAllowance,
    } = useTokenApproval({
        tokenAddress: approvalTokenAddress,
        owner: address as `0x${string}` | undefined,
        spender: CONTRACTS.core as `0x${string}`,
    });
    const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });
    const isActionPending = isPending
        || merchantProcessActions.isPending
        || courierProcessActions.isPending
        || dutchAuctionActions.isPending
        || registerOperator.isPending
        || updateOperatorProfile.isPending
        || withdrawOperatorDeposit.isPending
        || ghgDisclosureActions.isPending;
    const isActionConfirming = isConfirming
        || merchantProcessActions.isConfirming
        || courierProcessActions.isConfirming
        || dutchAuctionActions.isConfirming
        || registerOperator.isConfirming
        || updateOperatorProfile.isConfirming
        || withdrawOperatorDeposit.isConfirming
        || ghgDisclosureActions.isConfirming;
    const isActionSuccess = isSuccess
        || mockIsSuccess
        || merchantProcessActions.isSuccess
        || courierProcessActions.isSuccess
        || dutchAuctionActions.isSuccess
        || registerOperator.isSuccess
        || updateOperatorProfile.isSuccess
        || withdrawOperatorDeposit.isSuccess
        || ghgDisclosureActions.isSuccess;

    const selectedSummary = walletProcesses.find((summary) => summary.processId === effectiveProcessId) ?? null;
    const processModel = selectedSummary
        ? deriveProcessModelFromRuntime(
            selectedSummary,
            processOrders,
            address,
            selectedCurrency,
            isE2EMock
        )
        : null;

    const runtimeCapabilities = processModel
        ? collectRuntimeCapabilities([...processModel.capabilities, ...processModel.orders.flatMap((order) => order.capabilities)])
        : [];

    const executableCapabilityIds = useMemo(
        () => new Set(runtimeCapabilities.map((capability) => capability.id)),
        [runtimeCapabilities]
    );

    useEffect(() => {
        if (isActionSuccess) {
            if (isSuccess || mockIsSuccess) {
                bumpProcessReload();
            }
            setExecutingCapabilityId(null);
            setActionError(null);
        }
    }, [isActionSuccess, isSuccess, mockIsSuccess, bumpProcessReload]);

    useEffect(() => {
        setSelectedParentOrderIds(new Set());
        setSubOrderParent(null);
    }, [effectiveProcessId]);

    const waitForTransactionConfirmation = async (txHash?: `0x${string}`) => {
        if (isE2EMock || !publicClient || !txHash) return;
        await publicClient.waitForTransactionReceipt({ hash: txHash });
    };

    const resolveActiveProcess = async (targetProcessId: string) => {
        const activeOrders = processOrders.filter(
            (order) => order.processId === targetProcessId && order.state === OrderState.Active
        );
        if (activeOrders.length === 0) throw new Error("No active orders are available to resolve.");

        const commitments = buildResolutionCommitments(
            activeOrders.map((order) => ({
                id: order.id as Hex,
                processId: order.processId as Hex,
                buyer: order.buyer as Hex,
                seller: order.seller as Hex,
                currency: order.currency as Hex,
                payment: order.payment,
                cumulativeValue: order.cumulativeValue,
                agreementHash: order.agreementHash as Hex,
                salt: order.salt,
                deadline: order.deadline,
            })),
        );

        return resolveProcess(targetProcessId, commitments);
    };

    const executeCapabilityAction = async (
        action: CapabilityActionDescriptor,
        options?: { capabilityId?: string; label?: string },
        input?: CapabilityExecutionInput,
    ) => {
        setActionError(null);

        try {
            if (action.executionType === "runtime" && action.kind === "open-sub-order-composer") {
                if (action.parentOrderIds.length === 0) throw new Error("No parent orders selected.");
                setSubOrderParent({ orderIds: action.parentOrderIds, currency: action.currency });
                return;
            }

            if (action.executionType === "prototype") {
                throw new Error(`Prototype capability is not executable in the live workspace: ${action.kind}`);
            }

            if (isActionPending || isActionConfirming) return;

            setExecutingCapabilityId(options?.capabilityId ?? null);
            setActiveActionLabel(options?.label ?? null);
            await executeTransactionCapabilityAction(action, {
                waitForTransactionConfirmation,
                resolveProcess: resolveActiveProcess,
                registerOperator: (metadataURI) => registerOperator.register(metadataURI, (registrationDeposit.data as bigint | undefined) ?? 0n),
                updateOperatorProfile: (metadataURI) => updateOperatorProfile.updateProfile(metadataURI),
                withdrawOperatorDeposit: () => withdrawOperatorDeposit.withdraw(),
                submitDisclosureCommitment: ghgDisclosureActions.submitCommitmentForOrder,
                submitDisclosureInventory: ghgDisclosureActions.submitActualForOrder,
                submitMerchantProcessSignal: (orderHash, eventType, roleOrderHash) =>
                    merchantProcessActions.signal({ orderHash, eventType, roleOrderHash }),
                submitCourierProcessSignal: (orderHash, eventType, roleOrderHash) =>
                    courierProcessActions.signal({ orderHash, eventType, roleOrderHash }),
                submitCourierProcessSignalWithProof: (orderHash, eventType, proof, roleOrderHash) =>
                    courierProcessActions.signalWithProof({ orderHash, eventType, proof, roleOrderHash }),
                claimAuction: dutchAuctionActions.claim,
            }, input);
        } catch (error) {
            setActionError(extractErrorMessage(error, "Action failed."));
            setExecutingCapabilityId(null);
        }
    };

    const executeCapability = async (capability: CapabilityModel, input?: CapabilityExecutionInput) => {
        lastFailedActionRef.current = { capability, input };
        await executeCapabilityAction(capability.action, {
            capabilityId: capability.id,
            label: capability.label,
        }, input);
        // Clear on success (actionError is only set in catch)
        if (!actionError) lastFailedActionRef.current = null;
    };

    const retryLastAction = () => {
        const last = lastFailedActionRef.current;
        if (last) void executeCapability(last.capability, last.input);
    };

    const openSubOrderComposer = (order: OrderNodeModel) => {
        void executeCapabilityAction({
            executionType: "runtime",
            kind: "open-sub-order-composer",
            parentOrderIds: [order.orderId],
            currency: order.currency,
        });
    };

    const openSubOrderComposerFromTopology = (orderId: string, currency?: `0x${string}`) => {
        void executeCapabilityAction({
            executionType: "runtime",
            kind: "open-sub-order-composer",
            parentOrderIds: [orderId],
            currency,
        });
    };

    const toggleParentSelection = (orderId: string) => {
        setSelectedParentOrderIds((previous) => {
            const next = new Set(previous);
            if (next.has(orderId)) next.delete(orderId);
            else next.add(orderId);
            return next;
        });
    };

    const openMultiParentComposer = (orderIds: string[], currency?: `0x${string}`) => {
        if (orderIds.length === 0) return;
        void executeCapabilityAction({
            executionType: "runtime",
            kind: "open-sub-order-composer",
            parentOrderIds: orderIds,
            currency,
        });
    };

    const closeSubOrderComposer = () => {
        setSubOrderParent(null);
        setSelectedParentOrderIds(new Set());
    };

    return {
        effectiveProcessId,
        processModel,
        runtimeCapabilities,
        executableCapabilityIds,
        executingCapabilityId,
        activeActionLabel,
        actionError,
        isPending: isActionPending,
        isConfirming: isActionConfirming,
        isSuccess: isActionSuccess,
        mockIsSuccess,
        selectedParentOrderIds,
        subOrderParent,
        executeCapability,
        retryLastAction,
        isE2EMock,
        openSubOrderComposer,
        openSubOrderComposerFromTopology,
        toggleParentSelection,
        openMultiParentComposer,
        closeSubOrderComposer,
    };
}