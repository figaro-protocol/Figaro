"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAccount, usePublicClient, useWaitForTransactionReceipt } from "wagmi";
import { useWalletProcessIds } from "@/hooks/useWalletProcessIds";
import type { ProcessSummary } from "@/lib/kernel/walletProcessQueries";
import { useProcessOrders } from "@/hooks/useProcessOrders";
import { useProcessAgreements } from "@/hooks/useProcessAgreements";
import useTokenApproval from "@/hooks/useTokenApproval";
import { CONTRACTS } from "@/lib/kernel/contracts";
import { OrderState, useOrderStore } from "@/lib/kernel/store";
import { useFigaroActions } from "@/lib/kernel/useFigaroActions";
import { useUsageRecorder } from "@/lib/protocol/useUsageRecorder";
import { isE2EMockSession } from "@/lib/shared/e2e";
import { useClauseSpecs } from "@/lib/protocol/useClauseSpecs";
import { useAttestationCoordinatorActions } from "@/lib/composition/useAttestationCoordinatorActions";
import { useRegisterMember, useUpdateProfile, useWithdrawDeposit, useRegistrationDeposit } from "@/lib/member/useMembersRegistry";
import { deriveProcessModelFromRuntime } from "@/lib/semantic/deriveProcessModelFromRuntime";
import { createCapabilityExecutors } from "@/lib/semantic/createCapabilityExecutors";
import { getAttestationsByProcess, type RuntimeAttestation } from "@/lib/composition/indexer";
import { extractErrorMessage } from "@/lib/shared/errors";
import { CapabilityActionDescriptor, CapabilityExecutionInput, CapabilityModel } from "@/lib/semantic/models";
import { executeTransactionCapabilityAction } from "@/lib/semantic/executeTransactionCapability";

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
    // The active order's on-chain currency, or undefined — never a coined default.
    const approvalTokenAddress = selectedCurrency;
    const [executingCapabilityId, setExecutingCapabilityId] = useState<string | null>(null);
    const [activeActionLabel, setActiveActionLabel] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const lastFailedActionRef = useRef<{ capability: CapabilityModel; input?: CapabilityExecutionInput } | null>(null);
    const processReloadKey = useOrderStore((state) => state.processReloadKey);
    // Subscribe to the clause-spec warm: the generic capability deriver reads each
    // clause's spec (tier, ladder, attestation) from the chain→IPFS cache, so the
    // model must re-derive once a late-loading spec resolves. `version` bumps as
    // specs warm; reading it here re-renders + re-derives processModel below.
    const { version: clauseSpecsVersion } = useClauseSpecs();
    const { resolveProcess, hash, isPending } = useFigaroActions();
    const { recordClauseUsage, recordAssemblyUsage } = useUsageRecorder();
    const attestationActions = useAttestationCoordinatorActions();
    const registerMember = useRegisterMember();
    const updateMemberProfile = useUpdateProfile();
    const withdrawMemberDeposit = useWithdrawDeposit();
    const registrationDeposit = useRegistrationDeposit();
    const {
        needsApproval,
        approve,
        refetchAllowance,
    } = useTokenApproval({
        tokenAddress: approvalTokenAddress,
        owner: address as `0x${string}` | undefined,
        spender: CONTRACTS.core as `0x${string}`,
    });
    const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });
    const isActionPending = isPending
        || attestationActions.isPending
        || registerMember.isPending
        || updateMemberProfile.isPending
        || withdrawMemberDeposit.isPending;
    const isActionConfirming = isConfirming
        || attestationActions.isConfirming
        || registerMember.isConfirming
        || updateMemberProfile.isConfirming
        || withdrawMemberDeposit.isConfirming;
    const isActionSuccess = isSuccess
        || attestationActions.isSuccess
        || registerMember.isSuccess
        || updateMemberProfile.isSuccess
        || withdrawMemberDeposit.isSuccess;

    const selectedSummary = walletProcesses.find((summary) => summary.processId === effectiveProcessId) ?? null;

    // Spectator path: wallet isn't a participant in this process, but
    // the process exists on-chain (event log says processOrders is
    // non-empty). Build a synthetic summary so deriveProcessModelFromRuntime
    // can still produce a model. Without this, /orders/view?process=<processId>
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
            orders: processOrders.map((order) => ({ id: order.orderHash, state: order.state })),
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

    // `clauseSpecsVersion` is read so this inline derivation re-runs once a
    // late-loading clause spec resolves (the generic deriver needs each clause's
    // spec to surface its capability).
    void clauseSpecsVersion;
    const processModel = effectiveSummary
        ? deriveProcessModelFromRuntime(
            effectiveSummary,
            processOrders,
            processAgreements,
            address,
            selectedCurrency,
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

    // The WRITE half — built by the executor factory (lib/semantic), with
    // the UI-edge dialogs' copy living HERE, at the UI edge.
    const { executorCallbacks } = createCapabilityExecutors({
        isE2EMock,
        publicClient,
        processOrders,
        processAgreements,
        resolveProcess,
        recordClauseUsage,
        recordAssemblyUsage,
        submitBuyerAttestation: attestationActions.submitBuyerAttestation,
        submitSellerAttestation: attestationActions.submitSellerAttestation,
        registerMember: (metadataURI) => registerMember.register(metadataURI, (registrationDeposit.data as bigint | undefined) ?? 0n),
        updateMemberProfile: (metadataURI) => updateMemberProfile.updateProfile(metadataURI),
        withdrawMemberDeposit: () => withdrawMemberDeposit.withdraw(),
        confirmResolve: () => window.confirm("This will settle the entire process and release all bonds. Continue?"),
        confirmWithdraw: () => window.confirm("Leave the registry for this address? You are de-listed from discovery straight away and can register again at once — but the deposit is released only after the cooldown, so coming back costs a fresh one."),
    });

    const executeCapabilityAction = async (
        action: CapabilityActionDescriptor,
        options?: { capabilityId?: string; label?: string },
        input?: CapabilityExecutionInput,
    ) => {
        setActionError(null);

        try {
            if (action.executionType === "prototype") {
                throw new Error(`Prototype capability is not executable in the live workspace: ${action.kind}`);
            }

            if (isActionPending || isActionConfirming) return;

            setExecutingCapabilityId(options?.capabilityId ?? null);
            setActiveActionLabel(options?.label ?? null);
            await executeTransactionCapabilityAction(action, executorCallbacks, input);
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
        executeCapability,
        retryLastAction,
    };
}