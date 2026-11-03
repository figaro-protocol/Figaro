"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAccount, usePublicClient, useWaitForTransactionReceipt } from "wagmi";
import { useWalletProcessIds } from "@/hooks/useWalletProcessIds";
import type { ProcessSummary } from "@/lib/kernel/walletProcessQueries";
import { useProcessOrders } from "@/hooks/useProcessOrders";
import { useProcessAgreements } from "@/hooks/useProcessAgreements";
import useTokenApproval from "@/hooks/useTokenApproval";
import useTokenDecimals from "@/hooks/useTokenDecimals";
import { calculateResolution } from "@figaro-protocol/sdk";
import { tokenFigure } from "@/lib/shared/utils";
import { CONTRACTS } from "@/lib/kernel/contracts";
import { OrderState, useOrderStore, type Order } from "@/lib/kernel/store";
import { useFigaroActions } from "@/lib/kernel/useFigaroActions";
import { useUsageRecorder } from "@/lib/protocol/useUsageRecorder";
import { fetchAssemblyByHash } from "@/lib/protocol/useAssemblyRegistry";
import { isE2EMockSession } from "@/lib/shared/e2e";
import { useClauseSpecs } from "@/lib/protocol/useClauseSpecs";
import { useAttestationCoordinatorActions } from "@/lib/composition/useAttestationCoordinatorActions";
import { useRegisterMember, useUpdateProfile, useWithdrawDeposit, useWithdrawalCooldown } from "@/lib/member/useMembersRegistry";
import { cooldownPhrase } from "@/lib/member/cooldownPhrase";
import { deriveProcessModelFromRuntime } from "@/lib/semantic/deriveProcessModelFromRuntime";
import { createCapabilityExecutors } from "@/lib/semantic/createCapabilityExecutors";
import { getAttestationsByProcess, type RuntimeAttestation } from "@/lib/composition/indexer";
import { extractErrorMessage } from "@/lib/shared/errors";
import { CapabilityActionDescriptor, CapabilityExecutionInput, CapabilityModel } from "@/lib/semantic/models";
import { executeTransactionCapabilityAction } from "@/lib/semantic/executeTransactionCapability";
import { ABSENT, PENDING, present, readNetwork, type NetworkRead } from "@/lib/shared/networkRead";

/** The orders an absent or pending read stands for in the executors' inputs —
 *  no model and no capability is derived from it (`processModel` is null). */
const NO_ORDERS: Order[] = [];

function collectRuntimeCapabilities(capabilities: CapabilityModel[]): CapabilityModel[] {
    const seen = new Set<string>();

    return capabilities.filter((capability) => {
        if (seen.has(capability.id)) return false;
        seen.add(capability.id);
        return true;
    }).sort((left, right) => (right.uiPriority ?? 0) - (left.uiPriority ?? 0));
}

/**
 * What resolving pays, stated in the resolve confirm: one line per committed
 * order naming its seller and what that seller receives (the payment and its
 * bond back, 2 × cumulative value + payment), then what comes back to the
 * buyer (the rest of its bonds after the payments). Every figure is the SDK's
 * `calculateResolution` over the committed order structs.
 */
export function resolvePayoutLines(
    orders: ReadonlyArray<Pick<Order, "seller" | "payment" | "sellerBond" | "buyerBond">>,
    figure: (amount: bigint) => string,
): string[] {
    if (orders.length === 0) return [];
    let buyerPayout = 0n;
    let buyerBonds = 0n;
    let payments = 0n;
    const lines = orders.map((order) => {
        const resolution = calculateResolution(order.payment, order.sellerBond, order.buyerBond);
        buyerPayout += resolution.buyerPayout;
        buyerBonds += order.buyerBond;
        payments += order.payment;
        return `Seller ${order.seller} receives ${figure(resolution.sellerPayout)}: the payment ${figure(order.payment)} and its bond ${figure(order.sellerBond)} back.`;
    });
    lines.push(`You receive ${figure(buyerPayout)}: the rest of your bonds ${figure(buyerBonds)} after the payments ${figure(payments)}.`);
    return lines;
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
    const ordersRead = useProcessOrders(effectiveProcessId);
    // The orders the model is derived from — read only through `ordersRead`;
    // no model exists until the read is present (see `processModel`).
    const processOrders = ordersRead.status === "present" ? ordersRead.value : NO_ORDERS;
    const checkoutHashes = useMemo(
        () => processOrders.map((order) => order.checkoutHash).filter((hash): hash is string => Boolean(hash)),
        [processOrders],
    );
    const processAgreements = useProcessAgreements(checkoutHashes);
    const selectedCurrency = processOrders[0]?.currency as `0x${string}` | undefined;
    // The active order's on-chain currency, or undefined — never a coined default.
    const approvalTokenAddress = selectedCurrency;
    // A token figure only once `decimals()` is read; the raw integer until then.
    const { decimals } = useTokenDecimals(selectedCurrency);
    const figure = (amount: bigint) => tokenFigure(amount, decimals);
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
    const usageRecorder = useUsageRecorder();
    const attestationActions = useAttestationCoordinatorActions();
    const registerMember = useRegisterMember();
    const updateMemberProfile = useUpdateProfile();
    const withdrawMemberDeposit = useWithdrawDeposit();
    const { data: withdrawalCooldown } = useWithdrawalCooldown();
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
    const fallbackSummary: ProcessSummary | null = (!selectedSummary && effectiveProcessId && ordersRead.status === "present" && processOrders.length > 0)
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
    // action lands (processReloadKey bumps). A failed read is absent: never
    // `[]`, which would show every stage unattested and offer attest/resolve.
    const [attestationsRead, setAttestationsRead] = useState<NetworkRead<RuntimeAttestation[]>>(PENDING);
    useEffect(() => {
        if (!publicClient || !effectiveProcessId) {
            setAttestationsRead(PENDING);
            return;
        }
        let canceled = false;
        const chainId = publicClient.chain?.id ?? 0;
        void readNetwork("useSemanticProcessWorkspace.attestations", () =>
            getAttestationsByProcess(publicClient, chainId, effectiveProcessId),
        ).then((next) => { if (!canceled) setAttestationsRead(next); });
        return () => { canceled = true; };
    }, [publicClient, effectiveProcessId, processReloadKey]);
    const processAttestations = attestationsRead.status === "present" ? attestationsRead.value : null;

    // `clauseSpecsVersion` is read so this inline derivation re-runs once a
    // late-loading clause spec resolves (the generic deriver needs each clause's
    // spec to surface its capability).
    void clauseSpecsVersion;
    // No model — and so no capability — until both the orders and the
    // attestation log are present.
    const processModel = effectiveSummary && ordersRead.status === "present" && processAttestations
        ? deriveProcessModelFromRuntime(
            effectiveSummary,
            processOrders,
            processAgreements,
            address,
            selectedCurrency,
            processAttestations,
        )
        : null;

    // The model as a read: pending while either read is in flight, absent
    // when either failed, present(null) when the chain holds no order under
    // this process id.
    const processModelRead: NetworkRead<typeof processModel> =
        ordersRead.status === "absent" || attestationsRead.status === "absent"
            ? ABSENT
            : processModel
                ? present(processModel)
                : ordersRead.status === "present" && !effectiveSummary
                    ? present(null)
                    : PENDING;

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
        fetchUsageClaimContext: usageRecorder.fetchClaimContext,
        readAssembly: fetchAssemblyByHash,
        simulateUsage: usageRecorder.simulateUsage,
        recordUsage: usageRecorder.recordUsage,
        submitAttestation: attestationActions.submitAttestation,
        registerMember: (metadataURI) => registerMember.register(metadataURI),
        updateMemberProfile: (metadataURI) => updateMemberProfile.updateProfile(metadataURI),
        withdrawMemberDeposit: () => withdrawMemberDeposit.withdraw(),
        confirmResolve: (plannedUsageWrites) => window.confirm([
            "This resolves the whole process: every seller is paid and every bond is refunded at once, and it cannot be undone.",
            ...resolvePayoutLines(processOrders, figure),
            ...(plannedUsageWrites > 0
                ? [`Your wallet then signs up to ${plannedUsageWrites} more ${plannedUsageWrites === 1 ? "transaction" : "transactions"} that count which clauses and which assembly this trade used, so their designers are rewarded.`]
                : []),
            "Continue?",
        ].join("\n")),
        confirmWithdraw: () => window.confirm(`Leave the registry for this address? You are de-listed from discovery straight away and can register again at once — but the stake is released ${cooldownPhrase(withdrawalCooldown as bigint | undefined)}, so coming back costs a fresh one.`),
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
            // The executor returns once its transaction is confirmed — or at
            // once, with no transaction and no error, when the person declined
            // the confirm dialog. The landed case is also cleared by the
            // success effect below; the declined case is cleared by nothing
            // else, and left the button reading "Processing..." for good.
            setExecutingCapabilityId(null);
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
        processModelRead,
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