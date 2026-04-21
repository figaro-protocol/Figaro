"use client";

import { useCallback, useState } from "react";
import { useAccount, useChainId, usePublicClient, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { activeChain } from "@/lib/shared/chains";
import type { Hex } from "viem";
import { CONTRACTS, ATTESTATION_COORDINATOR_ABI } from "@/lib/core/contracts";
import { loadOrFetchCommitment } from "@/lib/console/commitmentStore";
import { ZERO_BYTES32 as SHARED_ZERO_BYTES32 } from "@/lib/shared/evm";
import { extractErrorMessage } from "@/lib/shared/errors";

export const ZERO_BYTES32 = SHARED_ZERO_BYTES32;

type SellerAttestationInput = {
    orderHash: Hex;
    schemaId: Hex;
    stage: number;
    contentRef?: Hex;
    roleOrderHash?: Hex;
    failureMessage?: string;
};

type BuyerAttestationInput = {
    processId: Hex;
    orderHash: Hex;
    schemaId: Hex;
    stage: number;
    contentRef?: Hex;
    failureMessage?: string;
};

export function useAttestationCoordinatorActions() {
    const { address } = useAccount();
    const chainId = useChainId();
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

        return {
            account: address,
            coordinator,
        };
    }, [hasCoordinator, address, coordinator]);

    const resolveRoleCommitment = useCallback(async (orderHash: Hex, roleOrderHash?: Hex) => {
        ensureCoordinatorAccess();
        if (!publicClient) {
            const message = "Attestation coordinator unavailable for this wallet or network.";
            setError(message);
            throw new Error(message);
        }

        const effectiveRoleOrderHash = roleOrderHash ?? orderHash;
        const roleCommitment = await loadOrFetchCommitment(
            publicClient,
            publicClient.chain?.id ?? 31337,
            effectiveRoleOrderHash,
        );

        if (!roleCommitment) {
            const message = `Unable to reconstruct commitment for ${effectiveRoleOrderHash.slice(0, 10)}…`;
            setError(message);
            throw new Error(message);
        }

        return roleCommitment;
    }, [ensureCoordinatorAccess, publicClient]);

    const submitSellerAttestation = useCallback(async ({
        orderHash,
        schemaId,
        stage,
        contentRef = ZERO_BYTES32,
        roleOrderHash,
        failureMessage = "Transaction failed",
    }: SellerAttestationInput) => {
        const { account, coordinator: attestationCoordinator } = ensureCoordinatorAccess();
        const roleCommitment = await resolveRoleCommitment(orderHash, roleOrderHash);
        setError("");

        try {
            return await writeContractAsync({
                address: attestationCoordinator,
                abi: ATTESTATION_COORDINATOR_ABI,
                functionName: "attestAsSeller",
                args: [roleCommitment, orderHash, schemaId, stage, contentRef],
                account,
                chain,
            });
        } catch (cause: unknown) {
            const message = extractErrorMessage(cause, failureMessage);
            setError(message);
            throw new Error(message);
        }
    }, [ensureCoordinatorAccess, resolveRoleCommitment, writeContractAsync, chain]);

    const submitBuyerAttestation = useCallback(async ({
        processId,
        orderHash,
        schemaId,
        stage,
        contentRef = ZERO_BYTES32,
        failureMessage = "Transaction failed",
    }: BuyerAttestationInput) => {
        const { account, coordinator: attestationCoordinator } = ensureCoordinatorAccess();
        setError("");

        try {
            return await writeContractAsync({
                address: attestationCoordinator,
                abi: ATTESTATION_COORDINATOR_ABI,
                functionName: "attestAsBuyer",
                args: [processId, orderHash, schemaId, stage, contentRef],
                account,
                chain,
            });
        } catch (cause: unknown) {
            const message = extractErrorMessage(cause, failureMessage);
            setError(message);
            throw new Error(message);
        }
    }, [ensureCoordinatorAccess, writeContractAsync, chain]);

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