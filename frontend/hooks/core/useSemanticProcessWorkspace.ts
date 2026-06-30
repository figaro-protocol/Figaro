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
import { getClauseSpec } from "@/lib/shared/clauseSpecSource";
import { useClauseSpecs } from "@/lib/core/useClauseSpecs";
import { encodeContentFromSpec } from "@figaro/core/clauses";
import { useDutchAuctionActions } from "@/lib/composition/useDutchAuction";
import { useAttestationCoordinatorActions } from "@/lib/composition/useAttestationCoordinatorActions";
import { useRegisterSeller, useUpdateProfile, useWithdrawDeposit, useRegistrationDeposit } from "@/lib/seller/useSellerRegistry";
import { deriveProcessModelFromRuntime } from "@/lib/semantic/deriveProcessModelFromRuntime";
import { restoreSignedProcessId } from "@/lib/core/signedCommitment";
import { getAttestationsByProcess, type RuntimeAttestation } from "@/lib/composition/indexer";
import { extractErrorMessage } from "@/lib/shared/errors";
import { CapabilityActionDescriptor, CapabilityExecutionInput, CapabilityModel, OrderNodeModel } from "@/lib/semantic/models";
import { executeTransactionCapabilityAction } from "@/lib/semantic/executeTransactionCapability";
import { toHex, type Hex } from "viem";
import { clauseIdHash } from "@/lib/shared/evm";

/** Per-attestation device witness for runtime PROOF clauses (e.g. proximity).
 *  The validator checks only nonce ≠ 0 and deviceSig length ∈ [65,512]; the real
 *  per-handoff witness comes from a device sensor (BLE/NFC/Wi-Fi) whose capture
 *  SDK is not built yet. This is the device-capture seam — a runtime VALUE
 *  provider, not clause knowledge. */
const PROXIMITY_DEVICE_SIG_PLACEHOLDER: Hex = `0x${"01".repeat(65)}`;
function deviceWitness(): { nonce: Hex; deviceSig: Hex } {
    return {
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
    // The active order's on-chain currency, or undefined — never a coined default.
    const approvalTokenAddress = selectedCurrency;
    const [executingCapabilityId, setExecutingCapabilityId] = useState<string | null>(null);
    const [activeActionLabel, setActiveActionLabel] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const lastFailedActionRef = useRef<{ capability: CapabilityModel; input?: CapabilityExecutionInput } | null>(null);
    const [selectedParentOrderIds, setSelectedParentOrderIds] = useState<Set<string>>(new Set());
    const [subOrderParent, setSubOrderParent] = useState<{ orderIds: string[]; currency?: `0x${string}` } | null>(null);
    const processReloadKey = useOrderStore((state) => state.processReloadKey);
    // Subscribe to the clause-spec warm: the generic capability deriver reads each
    // clause's spec (tier, ladder, attestation) from the chain→IPFS cache, so the
    // model must re-derive once a late-loading spec resolves. `version` bumps as
    // specs warm; reading it here re-renders + re-derives processModel below.
    const { version: clauseSpecsVersion } = useClauseSpecs();
    const { resolveProcess, hash, isPending } = useFigaroActions();
    const attestationActions = useAttestationCoordinatorActions();
    const dutchAuctionActions = useDutchAuctionActions();
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
        || dutchAuctionActions.isPending
        || registerSeller.isPending
        || updateSellerProfile.isPending
        || withdrawSellerDeposit.isPending;
    const isActionConfirming = isConfirming
        || attestationActions.isConfirming
        || dutchAuctionActions.isConfirming
        || registerSeller.isConfirming
        || updateSellerProfile.isConfirming
        || withdrawSellerDeposit.isConfirming;
    const isActionSuccess = isSuccess
        || attestationActions.isSuccess
        || dutchAuctionActions.isSuccess
        || registerSeller.isSuccess
        || updateSellerProfile.isSuccess
        || withdrawSellerDeposit.isSuccess;

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
            if (action.executionType === "runtime" && action.kind === "open-sub-order-composer") {
                if (action.parentOrderHashes.length === 0) throw new Error("No parent orders selected.");
                setSubOrderParent({ orderIds: action.parentOrderHashes, currency: action.currency });
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
                // ONE generic attestation path — the clause spec drives the on-chain
                // content (enum ladder, or a proof's band) and who attests (party,
                // from block.attestation). Names no clause; a permissionless clause
                // attests through here unchanged. Proof clauses get the device witness.
                // A hand-off stage carries `pairedProof`: one user action, two
                // attestations — the stage, then the proximity proof on the order
                // that carries it (roleOrderHash = own order when the carrier is a
                // sibling: the coordinator's same-process cross-order witness).
                submitClauseAttestation: async (action) => {
                    const spec = getClauseSpec(action.clauseId);
                    if (!spec) throw new Error(`Clause spec not loaded: ${action.clauseId}`);
                    const fields: Record<string, unknown> = { [action.ladderField]: action.eventCode };
                    if (action.isProof) Object.assign(fields, deviceWitness());
                    const args = {
                        orderHash: action.orderHash as Hex,
                        clauseId: clauseIdHash(action.clauseId, spec.version),
                        stage: action.stage,
                        content: encodeContentFromSpec(spec, fields),
                        failureMessage: `${action.clauseId} ${action.eventCode} attestation failed`,
                    };
                    const stageTx = await (action.party === "buyer"
                        ? attestationActions.submitBuyerAttestation(args)
                        : attestationActions.submitSellerAttestation({ ...args, roleOrderHash: action.roleOrderHash as Hex | undefined }));
                    if (!action.pairedProof || action.party !== "seller") return stageTx;
                    // Confirm the stage tx before the paired proof so the two
                    // writes never race a shared wallet nonce.
                    await waitForTransactionConfirmation(stageTx as Hex | undefined);
                    const proofSpec = getClauseSpec(action.pairedProof.clauseId);
                    if (!proofSpec) throw new Error(`Clause spec not loaded: ${action.pairedProof.clauseId}`);
                    return attestationActions.submitSellerAttestation({
                        orderHash: action.pairedProof.orderHash as Hex,
                        clauseId: clauseIdHash(action.pairedProof.clauseId, proofSpec.version),
                        stage: action.pairedProof.stage,
                        content: encodeContentFromSpec(proofSpec, {
                            [action.pairedProof.ladderField]: action.pairedProof.eventCode,
                            ...deviceWitness(),
                        }),
                        roleOrderHash: action.pairedProof.orderHash !== action.orderHash
                            ? (action.orderHash as Hex)
                            : undefined,
                        failureMessage: `${action.pairedProof.clauseId} ${action.pairedProof.eventCode} paired witness failed`,
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
            parentOrderHashes: [order.orderId],
            currency: order.currency,
        });
    };

    const openSubOrderComposerFromTopology = (orderId: string, currency?: `0x${string}`) => {
        void executeCapabilityAction({
            executionType: "runtime",
            kind: "open-sub-order-composer",
            parentOrderHashes: [orderId],
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
            parentOrderHashes: orderIds,
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