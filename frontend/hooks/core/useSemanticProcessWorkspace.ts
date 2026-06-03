"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAccount, usePublicClient, useWaitForTransactionReceipt } from "wagmi";
import { useWalletProcessIds, type ProcessSummary } from "@/hooks/core/useWalletProcessIds";
import { useProcessOrders } from "@/hooks/core/useProcessOrders";
import { useProcessAgreements } from "@/hooks/core/useProcessAgreements";
import useTokenApproval from "@/hooks/core/useTokenApproval";
import { CONTRACTS, CORE_ABI } from "@/lib/core/contracts";
import { OrderState, useOrderStore } from "@/lib/core/store";
import { useFigaroActions } from "@/lib/core/useFigaroActions";
import { isE2EMockSession } from "@/lib/shared/e2e";
import { useMerchantProcessActions } from "@/lib/mechanisms/useMerchantProcess";
import { useCourierProcessActions, encodeProximityProofContent, PROXIMITY_CLAUSE_ID, type ProximityProof } from "@/lib/mechanisms/useCourierProcess";
import { useDutchAuctionActions } from "@/lib/mechanisms/useDutchAuction";
import { useGhgDisclosureActions } from "@/lib/mechanisms/useGHGDisclosure";
import { useAttestationCoordinatorActions } from "@/lib/mechanisms/useAttestationCoordinatorActions";
import { useRegisterSeller, useUpdateProfile, useWithdrawDeposit, useRegistrationDeposit } from "@/lib/mechanisms/useSellerRegistry";
import { deriveProcessModelFromRuntime } from "@/lib/semantic/deriveProcessModelFromRuntime";
import { getAttestationsByProcess, type RuntimeAttestation } from "@/lib/core/indexer";
import { extractErrorMessage } from "@/lib/shared/errors";
import { CapabilityActionDescriptor, CapabilityExecutionInput, CapabilityModel, OrderNodeModel } from "@/lib/semantic/models";
import { buildResolutionCommitments } from "@/lib/core/commitmentStore";
import { executeTransactionCapabilityAction } from "@/lib/core/executeTransactionCapability";
import { toHex, type Hex } from "viem";

/** Structural device-signature placeholder for proximity proofs. The
 *  figaro-proximity-proof-v1 validator checks only deviceSig length ∈ [65,512];
 *  the real per-handoff witness comes from a device sensor (BLE/NFC/Wi-Fi)
 *  whose capture SDK is not built yet. (Moved out of the order page — the page
 *  names no clause; the integration seam mints the proof from the band the
 *  builder read off the agreement.) */
const PROXIMITY_DEVICE_SIG_PLACEHOLDER: Hex = `0x${"01".repeat(65)}`;

function buildProximityProof(band: number): ProximityProof {
    return {
        band,
        nonce: toHex(crypto.getRandomValues(new Uint8Array(32))),
        deviceSig: PROXIMITY_DEVICE_SIG_PLACEHOLDER,
    };
}

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
    const agreementHashes = useMemo(
        () => processOrders.map((order) => order.agreementHash).filter((hash): hash is string => Boolean(hash)),
        [processOrders],
    );
    const processAgreements = useProcessAgreements(agreementHashes);
    const selectedCurrency = processOrders[0]?.currency as `0x${string}` | undefined;
    const approvalTokenAddress = (selectedCurrency ?? CONTRACTS.mockToken) as `0x${string}`;
    const [executingCapabilityId, setExecutingCapabilityId] = useState<string | null>(null);
    const [activeActionLabel, setActiveActionLabel] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const lastFailedActionRef = useRef<{ capability: CapabilityModel; input?: CapabilityExecutionInput } | null>(null);
    const [selectedParentOrderIds, setSelectedParentOrderIds] = useState<Set<string>>(new Set());
    const [subOrderParent, setSubOrderParent] = useState<{ orderIds: string[]; currency?: `0x${string}` } | null>(null);
    const processReloadKey = useOrderStore((state) => state.processReloadKey);
    const { resolveProcess, hash, isPending, mockIsSuccess } = useFigaroActions();
    const merchantProcessActions = useMerchantProcessActions();
    const courierProcessActions = useCourierProcessActions();
    const attestationActions = useAttestationCoordinatorActions();
    const dutchAuctionActions = useDutchAuctionActions();
    const registerSeller = useRegisterSeller();
    const updateSellerProfile = useUpdateProfile();
    const withdrawSellerDeposit = useWithdrawDeposit();
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
        || attestationActions.isPending
        || dutchAuctionActions.isPending
        || registerSeller.isPending
        || updateSellerProfile.isPending
        || withdrawSellerDeposit.isPending
        || ghgDisclosureActions.isPending;
    const isActionConfirming = isConfirming
        || merchantProcessActions.isConfirming
        || courierProcessActions.isConfirming
        || attestationActions.isConfirming
        || dutchAuctionActions.isConfirming
        || registerSeller.isConfirming
        || updateSellerProfile.isConfirming
        || withdrawSellerDeposit.isConfirming
        || ghgDisclosureActions.isConfirming;
    const isActionSuccess = isSuccess
        || mockIsSuccess
        || merchantProcessActions.isSuccess
        || courierProcessActions.isSuccess
        || attestationActions.isSuccess
        || dutchAuctionActions.isSuccess
        || registerSeller.isSuccess
        || updateSellerProfile.isSuccess
        || withdrawSellerDeposit.isSuccess
        || ghgDisclosureActions.isSuccess;

    const selectedSummary = walletProcesses.find((summary) => summary.processId === effectiveProcessId) ?? null;

    // Spectator path: wallet isn't a participant in this process, but
    // the process exists on-chain (event log says processOrders is
    // non-empty). Build a synthetic summary so deriveProcessModelFromRuntime
    // can still produce a model. Without this, /orders/<processId>
    // stays in perpetual "Loading…" for any wallet that didn't witness
    // the order — auditors, journalists, counterparty researchers, etc.
    // The event log is public; the page should follow.
    //
    // deriveProcessModelFromRuntime only reads `summary.processId` from
    // the summary it receives (lines 532-556 of that file), so a minimal
    // synthetic ProcessSummary suffices; the participant-specific role
    // discrimination happens downstream against `address`.
    const fallbackSummary: ProcessSummary | null = (!selectedSummary && effectiveProcessId && processOrders.length > 0)
        ? {
            processId: effectiveProcessId,
            orderCount: processOrders.length,
            hasActive: processOrders.some((order) => order.state === OrderState.Active),
            createdAt: 0,
            orders: processOrders.map((order) => ({ id: order.id, state: order.state })),
        }
        : null;
    const effectiveSummary = selectedSummary ?? fallbackSummary;

    // The process's attestation log, read clause-agnostically (one read; the
    // builder buckets it by clause to gate lifecycle/handoff capabilities, and
    // the order page renders it as a generic timeline). Re-fetched whenever an
    // action lands (processReloadKey bumps).
    const [processAttestations, setProcessAttestations] = useState<RuntimeAttestation[]>([]);
    useEffect(() => {
        if (!publicClient || !effectiveProcessId) {
            setProcessAttestations([]);
            return;
        }
        let cancelled = false;
        const chainId = publicClient.chain?.id ?? 0;
        getAttestationsByProcess(publicClient, chainId, effectiveProcessId)
            .then((logs) => { if (!cancelled) setProcessAttestations(logs); })
            .catch(() => { if (!cancelled) setProcessAttestations([]); });
        return () => { cancelled = true; };
    }, [publicClient, effectiveProcessId, processReloadKey]);

    const processModel = effectiveSummary
        ? deriveProcessModelFromRuntime(
            effectiveSummary,
            processOrders,
            processAgreements,
            address,
            selectedCurrency,
            isE2EMock,
            processAttestations,
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
            // Any landed action re-reads process state + the attestation log so
            // the next capability surfaces (a merchant signal advances the
            // ladder, a proximity proof retires the handoff capability).
            bumpProcessReload();
            setExecutingCapabilityId(null);
            setActionError(null);
        }
    }, [isActionSuccess, bumpProcessReload]);

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
                registerSeller: (metadataURI) => registerSeller.register(metadataURI, (registrationDeposit.data as bigint | undefined) ?? 0n),
                updateSellerProfile: (metadataURI) => updateSellerProfile.updateProfile(metadataURI),
                withdrawSellerDeposit: () => withdrawSellerDeposit.withdraw(),
                submitDisclosureCommitment: ghgDisclosureActions.submitCommitmentForOrder,
                submitDisclosureInventory: ghgDisclosureActions.submitActualForOrder,
                submitMerchantProcessSignal: (orderHash, eventType, roleOrderHash) =>
                    merchantProcessActions.signal({ orderHash, eventType, roleOrderHash }),
                submitMerchantProcessSignalWithProof: (orderHash, proximityTargetOrderHash, band) =>
                    merchantProcessActions.signalWithProof({
                        merchantOrderHash: orderHash,
                        proximityTargetOrderHash,
                        eventType: "handed-off",
                        proof: buildProximityProof(band),
                    }),
                submitCourierProcessSignal: (orderHash, eventType, roleOrderHash) =>
                    courierProcessActions.signal({ orderHash, eventType, roleOrderHash }),
                submitCourierProcessSignalWithProof: (orderHash, eventType, band, roleOrderHash) =>
                    courierProcessActions.signalWithProof({ orderHash, eventType, proof: buildProximityProof(band), roleOrderHash }),
                submitBuyerProximityProof: (orderHash, band) => {
                    const proof = buildProximityProof(band);
                    return attestationActions.submitBuyerAttestation({
                        orderHash: orderHash as Hex,
                        clauseId: PROXIMITY_CLAUSE_ID,
                        stage: band,
                        content: encodeProximityProofContent(proof),
                        failureMessage: "Buyer proximity proof failed",
                    });
                },
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
        processAgreements,
        processAttestations,
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