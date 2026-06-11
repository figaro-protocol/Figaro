"use client";

import { useCallback, useState } from "react";
import { useAccount, usePublicClient, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { activeChain } from "@/lib/shared/chains";
import type { Hex } from "viem";
import { CONTRACTS, ATTESTATION_COORDINATOR_ABI } from "@/lib/core/contracts";
import { loadOrFetchCommitment } from "@/lib/core/commitmentStore";
import { extractErrorMessage } from "@/lib/shared/errors";
import { hydrateAgreement } from "@/lib/core/agreementStore";
import {
    buildSectionInclusionProof,
    getSectionById,
    getSectionDataBytes,
} from "@/lib/core/agreement";

type SellerAttestationInput = {
    /** The order being attested — its `agreementHash` anchors the inclusion proof. */
    orderHash: Hex;
    clauseId: Hex;
    stage: number;
    /**
     * ABI-encoded content per the clause's encoding. Omit to default to the
     * committed `sectionData` — correct for Category-2 clauses (handoff, geo,
     * modality, ghg-disclosure, commerce) whose validators enforce
     * `keccak256(content) == keccak256(sectionData)`. Supply an explicit value
     * for Category-1 clauses (merchant-process, courier-process, proximity,
     * measurement) whose content shape differs from the committed clause.
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
    const coordinator = CONTRACTS.attestationCoordinator;
    const hasCoordinator = !!coordinator && coordinator.length === 42;
    const { writeContractAsync, data: hash, isPending } = useWriteContract();
    const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });
    const [error, setError] = useState("");

    const ensureCoordinatorAccess = useCallback(() => {
        if (!hasCoordinator || !address) {
            const message = "Attestation coordinator unavailable for this wallet or network.";
            setError(message);
            throw new Error(message);
        }
        return { account: address, coordinator };
    }, [hasCoordinator, address, coordinator]);

    const loadCommitment = useCallback(async (orderHash: Hex) => {
        if (!publicClient) {
            const message = "Attestation coordinator unavailable for this wallet or network.";
            setError(message);
            throw new Error(message);
        }
        const c = await loadOrFetchCommitment(
            publicClient,
            publicClient.chain?.id ?? 31337,
            orderHash,
        );
        if (!c) {
            const message = `Unable to reconstruct commitment for ${orderHash.slice(0, 10)}…`;
            setError(message);
            throw new Error(message);
        }
        return c;
    }, [publicClient]);

    /**
     * Build the `sectionData` + inclusion `proof` arguments for an attestation
     * against a target order's `agreementHash`. Hydrates the signed agreement
     * assemblyDoc (from localStorage or IPFS), finds the clause for `clauseId`,
     * and produces the merkle inclusion proof the coordinator verifies.
     */
    const buildReceipt = useCallback(async (targetAgreementHash: Hex, clauseId: Hex) => {
        const agreement = await hydrateAgreement(targetAgreementHash);
        if (!agreement) {
            const message = `Agreement assemblyDoc unavailable for ${targetAgreementHash.slice(0, 10)}… — `
                + `cannot generate inclusion proof`;
            setError(message);
            throw new Error(message);
        }
        const section = getSectionById(agreement, clauseId);
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