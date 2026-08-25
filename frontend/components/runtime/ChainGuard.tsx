/**
 * Chain Validation Guard Component
 * Addresses AUDIT FINDING WEB3-1: No Chain Validation
 * 
 * Ensures users are connected to the correct network before interacting with contracts
 */

"use client";

import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { showWarning } from "@/components/ui/toast";
import { useEffect, useState } from "react";
import { activeChain, DEVNET_CHAIN_ID } from "@/lib/shared/chains";

const DEV_CHAIN_IDS = process.env.NODE_ENV === "production" ? [] : [DEVNET_CHAIN_ID, 1337];
const SUPPORTED_CHAIN_IDS = [activeChain.id, ...DEV_CHAIN_IDS];
const CHAIN_NAMES: Record<number, string> = { [activeChain.id]: activeChain.name };
if (process.env.NODE_ENV !== "production") {
    CHAIN_NAMES[DEVNET_CHAIN_ID] = "Figaro Development";
    CHAIN_NAMES[1337] = "Figaro Development";
}

export function ChainGuard({ children }: { children: React.ReactNode }) {
    const { isConnected } = useAccount();
    const chainId = useChainId();
    const { switchChain } = useSwitchChain();
    const [hasShownWarning, setHasShownWarning] = useState(false);

    const isCorrectChain = SUPPORTED_CHAIN_IDS.includes(chainId);

    useEffect(() => {
        if (isConnected && !isCorrectChain && !hasShownWarning) {
            showWarning(
                `Wrong network detected. Please switch to ${CHAIN_NAMES[SUPPORTED_CHAIN_IDS[0]] || 'Hardhat'}.`
            );
            setHasShownWarning(true);
        }

        if (isCorrectChain) {
            setHasShownWarning(false);
        }
    }, [isConnected, isCorrectChain, hasShownWarning]);

    // If not connected or on correct chain, render children normally
    if (!isConnected || isCorrectChain) {
        return <>{children}</>;
    }

    // Show warning overlay if on wrong chain
    return (
        <div className="relative">
            {/* Blur content */}
            <div className="filter blur-sm pointer-events-none">
                {children}
            </div>

            {/* Warning overlay */}
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-primary/40">
                <div className="bg-paper border-2 border-warning rounded-lg p-8 max-w-md mx-4">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="bg-warning/20 p-3 rounded-lg">
                            <AlertTriangle className="w-8 h-8 text-warning" />
                        </div>
                        <h2 className="text-2xl font-bold text-ink-heading">Wrong Network</h2>
                    </div>

                    <p className="text-ink-body mb-4">
                        You&apos;re connected to the wrong network.
                        <br />
                        Please switch to continue:
                    </p>

                    <div className="bg-subtle rounded-lg p-4 mb-6">
                        <ul className="space-y-2">
                            {SUPPORTED_CHAIN_IDS.map((id) => (
                                <li key={id} className="flex items-center gap-2 text-ink-body">
                                    <div className="w-2 h-2 bg-ink-muted rounded-full"></div>
                                    <span className="font-semibold">{CHAIN_NAMES[id] || `Network ${id}`}</span>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {switchChain && (
                        <Button
                            onClick={() => switchChain({ chainId: SUPPORTED_CHAIN_IDS[0] })}
                            className="w-full font-semibold py-3 px-6"
                        >
                            Switch to {CHAIN_NAMES[SUPPORTED_CHAIN_IDS[0]] || 'Figaro Network'}
                        </Button>
                    )}

                    <p className="text-xs text-ink-muted text-center mt-4">
                        Your wallet needs to be on the correct network to use Figaro.
                    </p>
                </div>
            </div>
        </div>
    );
}

