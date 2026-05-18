// Core Hook for V5 Protocol Actions (Unified Commit, Commitment[] Resolution)

import { useState, useEffect } from "react";
import { useWriteContract, useWaitForTransactionReceipt, useAccount, useChainId, usePublicClient } from "wagmi";
import { CORE_ABI, ERC20_ABI, CONTRACTS } from "@/lib/core/contracts";
import { TEST_HELPERS_ENABLED, windowSafe } from '@/lib/core/testHelpers';
import { activeChain } from "@/lib/shared/chains";
import { ZERO_PROCESS_ID } from "@/lib/shared/evm";
import { useOrderStore, generateProcessId, OrderState, Order } from "@/lib/core/store";
import { isE2EMockSession } from "@/lib/shared/e2e";
import {
    mockEmitOrder,
    mockResolveProcess,
} from "@/lib/core/mockEventStore";
import type { Commitment } from "@figaro/core";
import { calculateBonds } from "@figaro/core";

// Re-export for existing consumers
export type { Commitment };

export const useFigaroActions = () => {
    // E2E mock mode: enable by visiting URL with `?e2e=mock` in development.
    // Canonical `isE2EMockSession` carries the window + production guards.
    const isE2EMock = isE2EMockSession();

    const orderStore = useOrderStore();

    // Call wagmi/react hooks unconditionally to satisfy Rules of Hooks
    const { writeContractAsync, data: hash, isPending } = useWriteContract();
    const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash });
    const { address: account } = useAccount();
    const chainId = useChainId();
    const publicClient = usePublicClient();

    // C6: track mock success so OrderControls can trigger form-reset and modal in E2E mode
    const [mockIsSuccess, setMockIsSuccess] = useState(false);
    useEffect(() => {
        if (mockIsSuccess) {
            const t = setTimeout(() => setMockIsSuccess(false), 3000);
            return () => clearTimeout(t);
        }
    }, [mockIsSuccess]);

    if (isE2EMock) {
        // Mock implementations that update local Zustand store and resolve immediately
        const commit = async (
            commitment: Commitment,
            _buyerSig?: `0x${string}`,
            _sellerSig?: `0x${string}`,
        ): Promise<`0x${string}`> => {
            const isRoot = commitment.processId === ZERO_PROCESS_ID;
            const processId = isRoot ? generateProcessId() : commitment.processId;
            if (isRoot) orderStore.setViewedProcessId(processId);
            const orderHash = `0x${BigInt(Date.now()).toString(16).padStart(64, '0')}`;
            const bonds = calculateBonds(commitment.expectedCumulativeValue, commitment.payment);
            const order: Order = {
                id: orderHash,
                processId,
                buyer: String(commitment.buyer),
                seller: String(commitment.seller),
                currency: String(commitment.currency),
                agreementHash: commitment.agreementHash,
                cumulativeValue: commitment.expectedCumulativeValue,
                payment: commitment.payment,
                state: OrderState.Active,
                sellerBond: bonds.sellerBond,
                buyerBond: bonds.buyerBond,
                salt: commitment.salt,
                deadline: commitment.deadline,
                timestamp: Date.now(),
            };
            mockEmitOrder(order);
            setMockIsSuccess(true);
            return Promise.resolve(("0x" + BigInt(Date.now()).toString(16)) as `0x${string}`);
        };

        const resolveProcess = async (processId: string, _commitments: Commitment[]): Promise<`0x${string}`> => {
            mockResolveProcess(processId);
            setMockIsSuccess(true);
            return Promise.resolve(("0x" + BigInt(Date.now()).toString(16)) as `0x${string}`);
        };

        const approveToken = async () => Promise.resolve({ mock: true });

        return {
            approveToken,
            commit,
            resolveProcess,
            hash: undefined,
            isPending: false,
            mockIsSuccess,
        };
    }

    // Use activeChain so wallets that enforce chain-matching
    // (Coinbase Wallet, WalletConnect v2) don't reject the call.
    const chainConfig = activeChain;

    // Token Approval: Approve ERC20 for Core contract
    const approveToken = async (
        tokenAddress: `0x${string}`,
        amount: bigint
    ) => {
        return writeContractAsync({
            address: tokenAddress,
            abi: ERC20_ABI,
            functionName: "approve",
            args: [CONTRACTS.core as `0x${string}`, amount],
            account,
            chain: chainConfig,
        });
    };

    // V5: Unified commit (root and sub-orders use the same function)
    // Root orders: processId = 0x00...00, expectedCumulativeValue = payment
    // Sub-orders: processId = existing process, expectedCumulativeValue = prev + payment
    const commit = async (
        commitment: Commitment,
        buyerSig: `0x${string}`,
        sellerSig: `0x${string}`,
    ): Promise<`0x${string}`> => {
        // Pre-flight dry-run via eth_call. Catches: wrong contract address
        // (no method match), insufficient ERC20 allowance, invalid sig, any
        // kernel revert path — all BEFORE the wallet prompt opens. If a
        // browser extension swapped calldata between simulate and write,
        // simulate would still have used clean data, so the simulate-pass
        // is a strong "this would work" signal even if the write differs.
        if (publicClient) {
            await publicClient.simulateContract({
                address: CONTRACTS.core as `0x${string}`,
                abi: CORE_ABI,
                functionName: "commit",
                args: [commitment, buyerSig, sellerSig],
                account,
            });
        }
        return writeContractAsync({
            address: CONTRACTS.core as `0x${string}`,
            abi: CORE_ABI,
            functionName: "commit",
            args: [commitment, buyerSig, sellerSig],
            account,
            chain: chainConfig,
        });
    };

    // V5: Resolve Process — takes full Commitment[] (kernel re-derives orderHash from each)
    const resolveProcess = async (
        processId: string,
        commitments: Commitment[]
    ): Promise<`0x${string}`> => {
        if (publicClient) {
            await publicClient.simulateContract({
                address: CONTRACTS.core as `0x${string}`,
                abi: CORE_ABI,
                functionName: "resolveProcess",
                args: [processId as `0x${string}`, commitments],
                account,
            });
        }
        return writeContractAsync({
            address: CONTRACTS.core as `0x${string}`,
            abi: CORE_ABI,
            functionName: "resolveProcess",
            args: [processId as `0x${string}`, commitments],
            account,
            chain: chainConfig,
        });
    };

    return {
        // Token approval
        approveToken,

        // Core actions (V5: unified commit, Commitment[] resolution)
        commit,
        resolveProcess,

        // Transaction state
        hash,
        isPending,
        isConfirming,
        isConfirmed,
        mockIsSuccess,
    };
};
