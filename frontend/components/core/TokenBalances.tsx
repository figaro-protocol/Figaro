"use client";

import { useAccount, useBalance, useWatchBlockNumber } from "wagmi";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { CONTRACTS } from "@/lib/core/contracts";
import Coins from "@/components/icons/Coins";
import Wallet from "@/components/icons/Wallet";
import RefreshCw from "@/components/icons/RefreshCw";
import { useEffect, useRef } from "react";
import { useMockTokenMint } from "@/hooks/core/useMockTokenMint";
import { useMounted } from "@/hooks/core/useMounted";


export function TokenBalances() {
    const mounted = useMounted();

    const { address, isConnected } = useAccount();
    const contractAddress = CONTRACTS.core;
    const tokenAddress = CONTRACTS.mockToken;
    const mintAction = useMockTokenMint();

    // User balance — declared before the mint-watcher effect so refetchUserBalance is in scope
    const { data: userBalance, refetch: refetchUserBalance } = useBalance({
        address,
        token: tokenAddress as `0x${string}`,
        query: {
            enabled: !!address && !!tokenAddress,
        },
    });

    // T-C: auto-refetch wallet balance when mint completes
    const prevMintingRef = useRef(false);
    const isMinting = mintAction.isPending || mintAction.isConfirming;
    useEffect(() => {
        if (prevMintingRef.current && !isMinting) {
            refetchUserBalance();
        }
        prevMintingRef.current = isMinting;
    }, [isMinting, refetchUserBalance]);

    // T-D: auto-refetch on every new block so balances update immediately after
    // any on-chain transaction (accept, resolve, cancel, bond lock/unlock, etc.).
    // Anvil mines one block per transaction, so this fires within ~100 ms.
    useWatchBlockNumber({
        onBlockNumber: () => {
            refetchUserBalance();
            refetchContractBalance();
        },
        enabled: !!address,   // only poll once a wallet is connected
    });

    // Contract balance (Liquidity Check)
    const { data: contractBalance, refetch: refetchContractBalance } = useBalance({
        address: contractAddress as `0x${string}`,
        token: tokenAddress as `0x${string}`,
        query: {
            enabled: !!contractAddress && !!tokenAddress,
        },
    });

    // TODO: Total active/locked bonds: activeBondSum is not directly readable from FigaroCore.
    // Track per-order bonds in Zustand once Order.currency field is added.

    const handleRefresh = () => {
        refetchUserBalance();
        refetchContractBalance();
    };

    return (
        <Card className="p-6">
            <div className="flex items-center justify-between mb-8">
                <h2 className="text-xl font-bold text-black flex items-center gap-2">
                    <Coins className="w-5 h-5 text-black" />
                    Token Balances
                </h2>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRefresh}
                    className="h-8 w-8 p-0"
                    aria-label="Refresh balances"
                    data-testid="btn-refresh-balances"
                >
                    <RefreshCw className="w-4 h-4" />
                </Button>
            </div>

            <div className="space-y-6">
                {/* User Wallet */}
                <div className="bg-white border border-gray-200 rounded-lg p-6 flex flex-col gap-2">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                            <Wallet className="w-4 h-4 text-black" />
                            <span className="text-sm text-black">Your Wallet</span>
                        </div>
                        <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-xs"
                            data-testid="btn-mint-tokens"
                            onClick={async () => {
                                try {
                                    const hash = await mintAction.mint("100");
                                    console.log("[mint] tx hash:", hash);
                                } catch (err: unknown) {
                                    console.error("[mint] error:", err);
                                }
                            }}
                            disabled={!mounted || isMinting || !mintAction.available}
                        >
                            {isMinting ? "Minting..." : "Mint 100"}
                        </Button>
                    </div>
                    <hr className="my-2 border-gray-100" />
                    <div className="text-xl font-mono text-black" data-testid="wallet-balance" suppressHydrationWarning>
                        {userBalance
                            ? `${parseFloat(userBalance.formatted).toFixed(4)} ${userBalance.symbol}`
                            : address ? "—" : "0.0000 TOKEN"
                        }
                    </div>
                    {mounted && address && (
                        <div className="text-xs text-gray-500 mt-2 font-mono truncate">
                            {address}
                        </div>
                    )}
                    {mintAction.error && (
                        <div className="text-xs text-red-600 mt-2 break-all" data-testid="mint-error">
                            Mint failed: {mintAction.error}
                        </div>
                    )}
                </div>

                {/* Protocol TVL */}
                <div className="bg-white border border-gray-200 rounded-lg p-6 flex flex-col gap-2">
                    <div className="flex items-center gap-2 mb-2">
                        <Coins className="w-4 h-4 text-black" />
                        <span className="text-sm text-black">MockToken Balance (Core)</span>
                    </div>
                    <hr className="my-2 border-gray-100" />
                    <div className="text-xl font-mono text-black" data-testid="contract-balance" suppressHydrationWarning>
                        {contractBalance
                            ? `${parseFloat(contractBalance.formatted).toFixed(4)} ${contractBalance.symbol}`
                            : "—"
                        }
                    </div>
                    <div className="text-xs text-gray-500 mt-2 font-mono truncate">
                        {contractAddress}
                    </div>
                </div>

                {mounted && !isConnected && (
                    <div className="text-center text-sm text-gray-500 bg-gray-100 p-3 rounded">
                        Connect wallet to view balances
                    </div>
                )}
            </div>
        </Card>
    );
}
