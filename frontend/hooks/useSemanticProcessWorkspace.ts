"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAccount, usePublicClient, useWaitForTransactionReceipt } from "wagmi";
import { useWalletProcessIds } from "@/hooks/useWalletProcessIds";
import type { ProcessSummary } from "@/lib/kernel/walletProcessQueries";
import { useProcessOrders } from "@/hooks/useProcessOrders";
import { useProcessAgreements } from "@/hooks/useProcessAgreements";
import useTokenApproval from "@/hooks/useTokenApproval";
import { CONTRACTS, CORE_ABI } from "@/lib/kernel/contracts";
import { OrderState, useOrderStore } from "@/lib/kernel/store";
import { useFigaroActions } from "@/lib/kernel/useFigaroActions";
import { isE2EMockSession } from "@/lib/shared/e2e";
import { clauseHandoffStages, clauseWitnessStages, deriveStageValuesFromCommitted, getClauseSpec } from "@/lib/shared/clauseSpecSource";
import { useClauseSpecs } from "@/lib/protocol/useClauseSpecs";
import { encodeContentFromSpec, validateContent } from "@figaro/sdk/clauses";
import { useAttestationCoordinatorActions } from "@/lib/composition/useAttestationCoordinatorActions";
import { useRegisterSeller, useUpdateProfile, useWithdrawDeposit, useRegistrationDeposit } from "@/lib/seller/useSellerRegistry";
import { deriveProcessModelFromRuntime } from "@/lib/semantic/deriveProcessModelFromRuntime";
import { restoreSignedProcessId } from "@/lib/kernel/signedCommitment";
import { getAttestationsByProcess, type RuntimeAttestation } from "@/lib/composition/indexer";
import { extractErrorMessage } from "@/lib/shared/errors";
import { CapabilityActionDescriptor, CapabilityExecutionInput, CapabilityModel } from "@/lib/semantic/models";
import { executeTransactionCapabilityAction } from "@/lib/semantic/executeTransactionCapability";
import { type Hex } from "viem";
import { computeClauseKey } from "@figaro/sdk";

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
    const attestationActions = useAttestationCoordinatorActions();
    const registerSeller = useRegisterSeller();
    const updateSellerProfile = useUpdateProfile();
    const withdrawSellerDeposit = useWithdrawDeposit();
    const registrationDeposit = useRegistrationDeposit();
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
        || attestationActions.isPending
        || registerSeller.isPending
        || updateSellerProfile.isPending
        || withdrawSellerDeposit.isPending;
    const isActionConfirming = isConfirming
        || attestationActions.isConfirming
        || registerSeller.isConfirming
        || updateSellerProfile.isConfirming
        || withdrawSellerDeposit.isConfirming;
    const isActionSuccess = isSuccess
        || attestationActions.isSuccess
        || registerSeller.isSuccess
        || updateSellerProfile.isSuccess
        || withdrawSellerDeposit.isSuccess;

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

    const waitForTransactionConfirmation = async (txHash?: `0x${string}`) => {
        if (isE2EMock || !publicClient || !txHash) return;
        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
        // A mined-but-reverted tx must surface as a failure, not flow on as
        // success — otherwise the capability sticks in its in-flight state
        // with no error (the publish-flow rule: receipt + status check).
        if (receipt.status !== "success") {
            throw new Error("Transaction reverted on-chain.");
        }
    };

    const resolveActiveProcess = async (targetProcessId: string) => {
        const activeOrders = processOrders.filter(
            (order) => order.processId === targetProcessId && order.state === OrderState.Active
        );
        if (activeOrders.length === 0) throw new Error("No active orders are available to resolve.");

        // Reconstruct each order's Commitment from its indexer event record —
        // resolveProcess needs the full Commitment[] to settle the process
        // atomically. expectedCumulativeValue is the order's committed cumulativeValue.
        // resolveProcess recomputes each order's hash from hashStruct(commitment),
        // so the SIGNED commitment is required — restore the root's processId 0
        // (the event/store carries the derived processId).
        const chainId = publicClient?.chain?.id ?? 31337;
        const commitments = activeOrders.map((order) => restoreSignedProcessId({
            processId: order.processId as Hex,
            buyer: order.buyer as Hex,
            seller: order.seller as Hex,
            currency: order.currency as Hex,
            payment: order.payment,
            expectedCumulativeValue: order.cumulativeValue,
            agreementHash: order.agreementHash as Hex,
            salt: order.salt,
            deadline: order.deadline,
        }, chainId));

        return resolveProcess(targetProcessId, commitments);
    };

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
            await executeTransactionCapabilityAction(action, {
                waitForTransactionConfirmation,
                // Confirm dialogs are UI copy and live HERE, at the UI edge — the
                // semantic executor dispatches, it never speaks to the user.
                resolveProcess: async (processId) => {
                    if (!window.confirm("This will settle the entire process and release all bonds. Continue?")) return;
                    return resolveActiveProcess(processId);
                },
                registerSeller: (metadataURI) => registerSeller.register(metadataURI, (registrationDeposit.data as bigint | undefined) ?? 0n),
                updateSellerProfile: (metadataURI) => updateSellerProfile.updateProfile(metadataURI),
                withdrawSellerDeposit: () => {
                    if (!window.confirm("Withdraw your seller deposit and clear the registry binding for this address? You'll need to re-register (with a fresh deposit and a new lock period) to operate again.")) return Promise.resolve(undefined);
                    return withdrawSellerDeposit.withdraw();
                },
                // ONE generic attestation path — the clause spec drives the on-chain
                // content (enum ladder or a declared witness stage) and who attests
                // (party). Names no clause; a permissionless clause attests through
                // here unchanged.
                submitClauseAttestation: async (action, values) => {
                    const spec = getClauseSpec(action.clauseId);
                    if (!spec) throw new Error(`Clause spec not loaded: ${action.clauseId}`);
                    const isLadder = action.ladderField !== undefined && action.eventCode !== undefined;
                    let content: Hex;
                    if (isLadder) {
                        content = encodeContentFromSpec(spec, { [action.ladderField!]: action.eventCode });
                    } else {
                        // WITNESS: values from the rail's generic form, gated by the
                        // same Layer-A validator that gates every sign point.
                        const witnessValues = values ?? {};
                        const validation = validateContent(witnessValues, spec, { stage: action.stage });
                        if (!validation.ok) {
                            throw new Error(validation.errors.map((e) => `${e.path}: ${e.message}`).join("; "));
                        }
                        content = encodeContentFromSpec(spec, witnessValues, { stage: action.stage });
                    }
                    const args = {
                        orderHash: action.orderHash as Hex,
                        clauseId: computeClauseKey(action.clauseId, spec.version),
                        stage: action.stage,
                        content,
                        failureMessage: `${action.clauseId} ${action.eventCode ?? `stage-${action.stage}`} attestation failed`,
                    };
                    const submit = (a: typeof args) => action.party === "buyer"
                        ? attestationActions.submitBuyerAttestation(a)
                        : attestationActions.submitSellerAttestation(a);
                    const txHash = await submit(args);

                    // HAND-OFF PAIRING (one action, two attestations): a ladder
                    // stage the clause declares in block.handoffStages pairs the
                    // witness stage of any co-composed clause nesting under
                    // `handoff` on the SAME order — when the witness's required
                    // values derive unambiguously from the committed content (a
                    // single committed band). Ambiguous → the standalone witness
                    // capability (with its form) carries the choice instead.
                    let lastTx = txHash;
                    if (isLadder && clauseHandoffStages(action.clauseId).includes(action.eventCode!)) {
                        const order = processOrders.find((o) => o.orderHash.toString() === action.orderHash);
                        const agreement = order?.agreementHash ? processAgreements.get(order.agreementHash) : undefined;
                        for (const section of agreement?.sections ?? []) {
                            const witnessSpec = getClauseSpec(section.clause, section.version);
                            // Field-name vocabulary, not a clause name: the witness
                            // clause declares it REFINES the `handoff` field.
                            if (witnessSpec?.block?.nestsUnder !== "handoff") continue;
                            for (const witness of clauseWitnessStages(section.clause, section.version)) {
                                const derived = deriveStageValuesFromCommitted(
                                    section.clause,
                                    witness.stage,
                                    section.data as Record<string, unknown> | undefined,
                                    section.version,
                                );
                                if (!derived) continue;
                                await waitForTransactionConfirmation(lastTx as Hex | undefined);
                                lastTx = await submit({
                                    orderHash: action.orderHash as Hex,
                                    clauseId: computeClauseKey(section.clause, witnessSpec.version),
                                    stage: witness.stage,
                                    content: encodeContentFromSpec(witnessSpec, derived, { stage: witness.stage }),
                                    failureMessage: `${section.clause} stage-${witness.stage} paired witness failed`,
                                });
                            }
                        }
                    }
                    return lastTx;
                },
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