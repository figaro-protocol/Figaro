"use client";

import { useCallback, useState } from "react";
import { useAccount, usePublicClient, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { activeChain } from "@/lib/shared/chains";
import type { Hex } from "viem";
import { CONTRACTS, ATTESTATION_COORDINATOR_ABI } from "@/lib/core/contracts";
import { loadOrFetchCommitment } from "@/lib/console/commitmentStore";
import { ZERO_BYTES32 as SHARED_ZERO_BYTES32 } from "@/lib/shared/evm";
import { extractErrorMessage } from "@/lib/shared/errors";
import { hydrateAgreement } from "@/lib/core/agreementStore";
import {
    buildSectionInclusionProof,
    getSectionById,
    getSectionDataBytes,
} from "@/lib/core/agreementManifest";

export const ZERO_BYTES32 = SHARED_ZERO_BYTES32;

type SellerAttestationInput = {
    /** The order being attested — its `agreementHash` anchors the inclusion proof. */
    orderHash: Hex;
    schemaId: Hex;
    stage: number;
    /**
     * ABI-encoded content per the schema's encoding. Omit to default to the
     * committed `sectionData` — correct for Category-2 schemas (handoff, geo,
     * fulfilment, ghg-disclosure, commerce) whose validators enforce
     * `keccak256(content) == keccak256(sectionData)`. Supply an explicit value
     * for Category-1 schemas (merchant-process, courier-process, proximity,
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
    schemaId: Hex;
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
     * manifest (from localStorage or IPFS), finds the clause for `schemaId`,
     * and produces the merkle inclusion proof the coordinator verifies.
     */
    const buildReceipt = useCallback(async (targetAgreementHash: Hex, schemaId: Hex) => {
        const agreement = await hydrateAgreement(targetAgreementHash);
        if (!agreement) {
            const message = `Agreement manifest unavailable for ${targetAgreementHash.slice(0, 10)}… — `
                + `cannot generate inclusion proof`;
            setError(message);
            throw new Error(message);
        }
        const section = getSectionById(agreement, schemaId);
        if (!section) {
            const message = `Schema ${schemaId.slice(0, 10)}… not committed in the signed agreement`;
            setError(message);
            throw new Error(message);
        }
        const sectionData = getSectionDataBytes(section);
        const { proof } = buildSectionInclusionProof(agreement, section.schema);
        return { sectionData, proof };
    }, []);

    const submitSellerAttestation = useCallback(async ({
        orderHash,
        schemaId,
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
            const { sectionData, proof } = await buildReceipt(target.agreementHash as Hex, schemaId);

            return await writeContractAsync({
                address: attestationCoordinator,
                abi: ATTESTATION_COORDINATOR_ABI,
                functionName: "attestAsSeller",
                args: [role, target, schemaId, stage, sectionData, proof, content ?? sectionData],
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
        schemaId,
        stage,
        content,
        failureMessage = "Transaction failed",
    }: BuyerAttestationInput) => {
        const { account, coordinator: attestationCoordinator } = ensureCoordinatorAccess();
        setError("");
        try {
            const target = await loadCommitment(orderHash);
            const { sectionData, proof } = await buildReceipt(target.agreementHash as Hex, schemaId);

            return await writeContractAsync({
                address: attestationCoordinator,
                abi: ATTESTATION_COORDINATOR_ABI,
                functionName: "attestAsBuyer",
                args: [target, schemaId, stage, sectionData, proof, content ?? sectionData],
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
        isPending,
        isConfirming,
        isSuccess,
        error,
        isAvailable: hasCoordinator && !!address,
    };
}