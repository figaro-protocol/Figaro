"use client";

import { useEffect, useState } from "react";
import { useAccount, useChainId, usePublicClient, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { activeChain } from "@/lib/shared/chains";
import { CONTRACTS, DUTCH_AUCTION_ABI } from "@/lib/core/contracts";
import { ZERO_ADDRESS } from "@/lib/shared/evm";
import { extractErrorMessage } from "@/lib/shared/errors";

/**
 * Minimal order shape needed by the auction hook.
 * Compatible with any order type that has id (bytes32 hash), currency, and payment.
 */
export interface AuctionOrder {
    id: string;
    currency: string;
    payment: bigint;
}

function getDutchAuction(): `0x${string}` | null {
    const addr = CONTRACTS.dutchAuction;
    return addr && addr.length === 42 ? addr : null;
}

export function useDutchAuctionActions() {
    const { address } = useAccount();
    const chainId = useChainId();
    const chain = activeChain;
    const auction = getDutchAuction();
    const { writeContractAsync: writeClaim, data: claimHash, isPending: isClaimPending } = useWriteContract();
    const { isLoading: isClaimConfirming, isSuccess: isClaimSuccess } = useWaitForTransactionReceipt({ hash: claimHash });
    const { writeContractAsync: writeCancel, data: cancelHash, isPending: isCancelPending } = useWriteContract();
    const { isLoading: isCancelConfirming, isSuccess: isCancelSuccess } = useWaitForTransactionReceipt({ hash: cancelHash });
    const [error, setError] = useState("");

    const claim = async (auctionId: string) => {
        if (!address || !auction) {
            const message = "Dutch auction unavailable for this wallet or network.";
            setError(message);
            throw new Error(message);
        }
        setError("");
        try {
            return await writeClaim({
                address: auction,
                abi: DUTCH_AUCTION_ABI,
                functionName: "claim",
                args: [auctionId as `0x${string}`],
                account: address,
                chain,
            });
        } catch (cause: unknown) {
            const message = extractErrorMessage(cause, "Claim failed");
            setError(message);
            throw new Error(message);
        }
    };

    const cancel = async (auctionId: string) => {
        if (!address || !auction) {
            const message = "Dutch auction unavailable for this wallet or network.";
            setError(message);
            throw new Error(message);
        }
        setError("");
        try {
            return await writeCancel({
                address: auction,
                abi: DUTCH_AUCTION_ABI,
                functionName: "cancel",
                args: [auctionId as `0x${string}`],
                account: address,
                chain,
            });
        } catch (cause: unknown) {
            const message = extractErrorMessage(cause, "Cancel failed");
            setError(message);
            throw new Error(message);
        }
    };

    return {
        claim,
        cancel,
        isPending: isClaimPending || isCancelPending,
        isConfirming: isClaimConfirming || isCancelConfirming,
        isSuccess: isClaimSuccess || isCancelSuccess,
        error,
        available: !!auction && !!address,
    };
}

export function useDutchAuction(order: AuctionOrder) {
    const { address } = useAccount();
    const publicClient = usePublicClient();
    const auction = getDutchAuction();
    const auctionId = order.id as `0x${string}`;
    const auctionActions = useDutchAuctionActions();

    // Live auction: read the full auction struct in one call
    const { data: auctionData, refetch: refetchAuction } = useReadContract({
        address: auction ?? undefined,
        abi: DUTCH_AUCTION_ABI,
        functionName: "auctions",
        args: auction ? [auctionId] : undefined,
        query: { enabled: !!auction },
    });

    // Destructure: (creator, startTime, maxPrice, provider, clearingPrice)
    const creator = (auctionData as readonly [string, bigint, bigint, string, bigint] | undefined)?.[0] ?? ZERO_ADDRESS;
    const startTime = (auctionData as readonly [string, bigint, bigint, string, bigint] | undefined)?.[1] ?? 0n;
    const maxPrice = (auctionData as readonly [string, bigint, bigint, string, bigint] | undefined)?.[2] ?? 0n;
    const providerAddr = (auctionData as readonly [string, bigint, bigint, string, bigint] | undefined)?.[3] ?? ZERO_ADDRESS;
    const clearingPrice = (auctionData as readonly [string, bigint, bigint, string, bigint] | undefined)?.[4] ?? 0n;

    const started = creator !== ZERO_ADDRESS && startTime > 0n;
    const isClaimed = providerAddr !== ZERO_ADDRESS;
    const isMyJob = !!address && isClaimed && providerAddr.toLowerCase() === address.toLowerCase();

    // Live auction: read the decaying price
    const { data: currentPrice, refetch: refetchPrice } = useReadContract({
        address: auction ?? undefined,
        abi: DUTCH_AUCTION_ABI,
        functionName: "getCurrentPrice",
        args: auction ? [auctionId] : undefined,
        query: { enabled: !!auction && started && !isClaimed },
    });

    const isPending = auctionActions.isPending;
    const isConfirming = auctionActions.isConfirming;

    // Refetch auction data after claim confirms
    const [wasConfirming, setWasConfirming] = useState(false);
    useEffect(() => {
        if (isConfirming) {
            setWasConfirming(true);
        } else if (wasConfirming) {
            setWasConfirming(false);
            refetchAuction?.();
            refetchPrice?.();
        }
    }, [isConfirming, wasConfirming, refetchAuction, refetchPrice]);

    // claim() — provider claims at the current decaying price.
    // No approval needed here — DutchAuction has no token handling.
    // The provider bonds directly in FigaroCore (commitSubOrder) after claiming.
    const claimJob = async () => {
        try {
            const txHash = await auctionActions.claim(auctionId);
            if (publicClient && txHash) {
                await publicClient.waitForTransactionReceipt({ hash: txHash });
            }
            refetchAuction?.();
            refetchPrice?.();
        } catch {
            return;
        }
    };

    // cancel() — creator cancels an unclaimed auction.
    const cancelAuction = async () => {
        try {
            const txHash = await auctionActions.cancel(auctionId);
            if (publicClient && txHash) {
                await publicClient.waitForTransactionReceipt({ hash: txHash });
            }
            refetchAuction?.();
        } catch {
            return;
        }
    };

    return {
        connected: !!address,
        started,
        currentPrice: isClaimed ? clearingPrice : (currentPrice as bigint | undefined),
        assignedProvider: isClaimed ? providerAddr : undefined,
        isClaimed,
        isMyJob,
        creator,
        maxPrice,
        clearingPrice: isClaimed ? clearingPrice : undefined,
        isPending,
        isConfirming,
        actionError: auctionActions.error,
        claimJob,
        cancelAuction,
    };
}
