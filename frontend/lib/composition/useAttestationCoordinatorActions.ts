"use client";

import { useCallback, useState } from "react";
import { useAccount, usePublicClient, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { activeChain } from "@/lib/shared/chains";
import type { Hex } from "viem";
import { ATTESTATION_COORDINATOR_ABI } from "@figaro/core";
import { getAttestationCoordinator } from "@/lib/composition/contracts";
import { extractErrorMessage } from "@/lib/shared/errors";
import { fetchAgreement } from "@/lib/kernel/agreementFetch";
import { getAllOrderCommitted, getStringArg } from "@/lib/kernel/indexer";
import { restoreSignedProcessId } from "@/lib/kernel/signedCommitment";
import { computeClauseKey } from "@figaro/core";
import { hexEqual } from "@/lib/shared/evm";
import { buildSectionInclusionProof, getSectionDataBytes, type Commitment } from "@figaro/core";

type SellerAttestationInput = {
    /** The order being attested — its `agreementHash` anchors the inclusion proof. */
    orderHash: Hex;
    clauseId: Hex;
    stage: number;
    /**
     * ABI-encoded content per the clause's encoding. Omit to default to the
     * committed `sectionData` — correct when the attestation RE-ASSERTS the
     * committed section (content == sectionData; e.g. handoff, geo, modality,
     * emissions-disclosure). Supply an explicit value when the runtime witness DIFFERS
     * from the committed section (merchant-process / courier-process ladders,
     * proximity proof, measurement). Either way the attestation is merkle-bound
     * to the committed clause under `agreementHash` — that binding is the check,
     * uniform across both; there is no "cross-checked" vs "runtime" clause tier.
     */
    content?: Hex;
    /** Optional — defaults to `orderHash` for same-order attestation. Supply
     *  a different order to attest cross-order (e.g. a driver's sub-order
     *  commitment as role, the root order as target). Must be in the same process. */
    roleOrderHash?: Hex;
    failureMessage?: string;
};

type BuyerAttestationInput = {
    /** The order being attested. Caller must equal `c.buyer` (which equals
     *  the process's rootBuyer by commit invariant). */
    orderHash: Hex;
    clauseId: Hex;
    stage: number;
    /** See `SellerAttestationInput.content`. Omit to default to sectionData. */
    content?: Hex;
    failureMessage?: string;
};

export function useAttestationCoordinatorActions() {
    const { address } = useAccount();
    const publicClient = usePublicClient();
    const chain = activeChain;
    const coordinator = getAttestationCoordinator();
    const hasCoordinator = !!coordinator;
    const { writeContractAsync, data: hash, isPending } = useWriteContract();
    const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });
    const [error, setError] = useState("");

    const ensureCoordinatorAccess = useCallback(() => {
        if (!coordinator || !address) {
            const message = "Attestation coordinator unavailable for this wallet or network.";
            setError(message);
            throw new Error(message);
        }
        return { account: address, coordinator };
    }, [coordinator, address]);

    const loadCommitment = useCallback(async (orderHash: Hex) => {
        if (!publicClient) {
            const message = "Attestation coordinator unavailable for this wallet or network.";
            setError(message);
            throw new Error(message);
        }
        // Reconstruct the target Commitment from its OrderCommitted event — the
        // indexer is the source, no commitment store.
        const chainId = publicClient.chain?.id ?? 31337;
        const log = (await getAllOrderCommitted(publicClient, chainId))
            .find((l) => getStringArg(l, "orderHash") === orderHash);
        if (!log) {
            const message = `Unable to reconstruct commitment for ${orderHash.slice(0, 10)}…`;
            setError(message);
            throw new Error(message);
        }
        const args = (log as { args?: Record<string, unknown> }).args ?? {};
        const c: Commitment = {
            processId: String(args.processId) as Hex,
            buyer: String(args.buyer) as Hex,
            seller: String(args.seller) as Hex,
            currency: String(args.currency) as Hex,
            payment: BigInt((args.payment as bigint | string | number) ?? 0),
            expectedCumulativeValue: BigInt((args.cumulativeValue as bigint | string | number) ?? 0),
            agreementHash: String(args.agreementHash) as Hex,
            salt: BigInt((args.salt as bigint | string | number) ?? 0),
            deadline: BigInt((args.deadline as bigint | string | number) ?? 0),
        };
        // The coordinator recomputes orderHash from hashStruct(commitment), so it
        // needs the SIGNED commitment — restore the root's processId 0.
        return restoreSignedProcessId(c, chainId);
    }, [publicClient]);

    /**
     * Build the `sectionData` + inclusion `proof` arguments for an attestation
     * against a target order's `agreementHash`. Hydrates the signed agreement
     * assemblyTemplate (from localStorage or IPFS), finds the clause for `clauseId`,
     * and produces the merkle inclusion proof the coordinator verifies.
     */
    const buildReceipt = useCallback(async (targetAgreementHash: Hex, clauseId: Hex) => {
        const agreement = await fetchAgreement(targetAgreementHash);
        if (!agreement) {
            const message = `Agreement assemblyTemplate unavailable for ${targetAgreementHash.slice(0, 10)}… — `
                + `cannot generate inclusion proof`;
            setError(message);
            throw new Error(message);
        }
        // The clauseId here is a runtime value (the clause being attested), not a
        // hardcoded literal — find its section by matching the on-chain id.
        const section = agreement.sections.find((s) => hexEqual(computeClauseKey(s.clause, s.version), clauseId));
        if (!section) {
            const message = `Clause ${clauseId.slice(0, 10)}… not committed in the signed agreement`;
            setError(message);
            throw new Error(message);
        }
        const sectionData = getSectionDataBytes(section);
        const { proof } = buildSectionInclusionProof(agreement, section.clause);
        return { sectionData, proof };
    }, []);

    const submitSellerAttestation = useCallback(async ({
        orderHash,
        clauseId,
        stage,
        content,
        roleOrderHash,
        failureMessage = "Transaction failed",
    }: SellerAttestationInput) => {
        const { account, coordinator: attestationCoordinator } = ensureCoordinatorAccess();
        setError("");
        try {
            const target = await loadCommitment(orderHash);
            const role = (roleOrderHash && roleOrderHash !== orderHash)
                ? await loadCommitment(roleOrderHash)
                : target;
            const { sectionData, proof } = await buildReceipt(target.agreementHash as Hex, clauseId);

            return await writeContractAsync({
                address: attestationCoordinator,
                abi: ATTESTATION_COORDINATOR_ABI,
                functionName: "attestAsSeller",
                args: [role, target, clauseId, stage, sectionData, proof, content ?? sectionData],
                account,
                chain,
            });
        } catch (cause: unknown) {
            const message = extractErrorMessage(cause, failureMessage);
            setError(message);
            throw new Error(message);
        }
    }, [ensureCoordinatorAccess, loadCommitment, buildReceipt, writeContractAsync, chain]);

    const submitBuyerAttestation = useCallback(async ({
        orderHash,
        clauseId,
        stage,
        content,
        failureMessage = "Transaction failed",
    }: BuyerAttestationInput) => {
        const { account, coordinator: attestationCoordinator } = ensureCoordinatorAccess();
        setError("");
        try {
            const target = await loadCommitment(orderHash);
            const { sectionData, proof } = await buildReceipt(target.agreementHash as Hex, clauseId);

            return await writeContractAsync({
                address: attestationCoordinator,
                abi: ATTESTATION_COORDINATOR_ABI,
                functionName: "attestAsBuyer",
                args: [target, clauseId, stage, sectionData, proof, content ?? sectionData],
                account,
                chain,
            });
        } catch (cause: unknown) {
            const message = extractErrorMessage(cause, failureMessage);
            setError(message);
            throw new Error(message);
        }
    }, [ensureCoordinatorAccess, loadCommitment, buildReceipt, writeContractAsync, chain]);

    return {
        submitSellerAttestation,
        submitBuyerAttestation,
        // Composable building blocks — a custom attestation surface can
        // reconstruct the commitment and build the inclusion receipt without
        // re-implementing either step.
        loadCommitment,
        buildReceipt,
        isPending,
        isConfirming,
        isSuccess,
        error,
        isAvailable: hasCoordinator && !!address,
    };
}