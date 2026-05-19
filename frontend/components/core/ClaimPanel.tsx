"use client";

import React, { useState, useEffect } from "react";
import { useAccount, usePublicClient, useWalletClient, useChainId } from "wagmi";
import { getRpgfMinterClaimStatus } from "@/lib/core/indexer";
import { safeJsonFromResponse } from "@/lib/shared/safeJson";
import {
    RPGF_MINTER_ABI,
    getRpgfMinter,
} from "@/lib/mechanisms/contracts";
import { extractErrorMessage } from "@/lib/shared/errors";

/**
 * Per-stage allocation file shape. Indexers / airdrop generators should produce
 * a `/fig-claims-y{2,5,9}.json` lookup keyed by lowercase address, with each
 * entry carrying the amount and merkle proof for that stage.
 */
type AllocationEntry = {
    amount: string; // decimal string in wei
    proof: `0x${string}`[];
};

const STAGE_LABELS = ["Year 2 (30%)", "Year 5 (20%)", "Year 9 (10%)"];
const STAGE_FILES = [
    "/fig-claims-y2.json",
    "/fig-claims-y5.json",
    "/fig-claims-y9.json",
];

async function fetchAllocation(
    stageIndex: number,
    address: string,
): Promise<AllocationEntry | null> {
    const file = STAGE_FILES[stageIndex];
    if (!file) return null;
    try {
        const res = await fetch(file);
        const data = await safeJsonFromResponse<Record<string, AllocationEntry>>(res);
        if (!data) return null;
        return data[address.toLowerCase()] ?? null;
    } catch {
        return null;
    }
}

export default function ClaimPanel({ stageIndex = 0 }: { stageIndex?: number }) {
    const { address } = useAccount();
    const [allocation, setAllocation] = useState<AllocationEntry | null>(null);
    const [claimed, setClaimed] = useState<boolean | null>(null);
    const [loading, setLoading] = useState(false);
    const [txStatus, setTxStatus] = useState<string>("");
    const publicClient = usePublicClient();
    const { data: walletClient } = useWalletClient();
    const chainId = useChainId();
    const airdropAddr = getRpgfMinter();

    useEffect(() => {
        if (!address || !publicClient || !chainId) return;
        setLoading(true);
        fetchAllocation(stageIndex, address).then(setAllocation);
        getRpgfMinterClaimStatus(publicClient, chainId, stageIndex, address)
            .then(setClaimed)
            .finally(() => setLoading(false));
    }, [address, publicClient, chainId, stageIndex]);

    if (!address) return <div>Connect your wallet to check your claim.</div>;
    if (loading) return <div>Loading...</div>;
    if (!allocation) return <div>No FIG allocation found for this address at {STAGE_LABELS[stageIndex]}.</div>;

    const handleClaim = async () => {
        if (!walletClient || !airdropAddr) return;
        setTxStatus("Submitting...");
        try {
            const tx = await walletClient.writeContract({
                address: airdropAddr,
                abi: RPGF_MINTER_ABI,
                functionName: "claim",
                args: [stageIndex, BigInt(allocation.amount), allocation.proof],
            });
            setTxStatus("Waiting for confirmation...");
            if (!publicClient) throw new Error("No public client available");
            await publicClient.waitForTransactionReceipt({ hash: tx });
            setTxStatus("Claim successful!");
            setClaimed(true);
        } catch (err: unknown) {
            const msg = extractErrorMessage(err, "Claim failed");
            setTxStatus(msg);
        }
    };

    return (
        <div>
            <h2>FIG Claim — {STAGE_LABELS[stageIndex]}</h2>
            <div>Amount: {allocation.amount}</div>
            <div>Status: {claimed ? "Claimed" : "Unclaimed"}</div>
            {txStatus && <div>{txStatus}</div>}
            {!claimed && (
                <button className="mt-4 px-4 py-2 bg-blue-600 text-white rounded" onClick={handleClaim}>
                    Claim FIG
                </button>
            )}
        </div>
    );
}
