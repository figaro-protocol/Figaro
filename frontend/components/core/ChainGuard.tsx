/**
 * Chain Validation Guard Component
 * Addresses AUDIT FINDING WEB3-1: No Chain Validation
 * 
 * Ensures users are connected to the correct network before interacting with contracts
 */

"use client";

import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { AlertTriangle } from "lucide-react";
import { showWarning } from "@/lib/shared/toast";
import { useEffect, useState } from "react";
import { activeChain } from "@/lib/shared/chains";

const DEV_CHAIN_IDS = process.env.NODE_ENV === "production" ? [] : [31337, 1337];
const SUPPORTED_CHAIN_IDS = [activeChain.id, ...DEV_CHAIN_IDS];
const CHAIN_NAMES: Record<number, string> = { [activeChain.id]: activeChain.name };
if (process.env.NODE_ENV !== "production") {
    CHAIN_NAMES[31337] = "Figaro Development";
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
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
                <div className="bg-slate-800 border-2 border-yellow-500 rounded-lg p-8 max-w-md mx-4">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="bg-yellow-500/20 p-3 rounded-lg">
                            <AlertTriangle className="w-8 h-8 text-yellow-500" />
                        </div>
                        <h2 className="text-2xl font-bold text-white">Wrong Network</h2>
                    </div>

                    <p className="text-slate-300 mb-4">
                        You&apos;re connected to the wrong network.
                        <br />
                        Please switch to continue:
                    </p>

                    <div className="bg-slate-900/50 rounded-lg p-4 mb-6">
                        <ul className="space-y-2">
                            {SUPPORTED_CHAIN_IDS.map((id) => (
                                <li key={id} className="flex items-center gap-2 text-slate-300">
                                    <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                                    <span className="font-semibold">{CHAIN_NAMES[id] || `Network ${id}`}</span>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {switchChain && (
                        <button
                            onClick={() => switchChain({ chainId: SUPPORTED_CHAIN_IDS[0] })}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
                        >
                            Switch to {CHAIN_NAMES[SUPPORTED_CHAIN_IDS[0]] || 'Figaro Network'}
                        </button>
                    )}

                    <p className="text-xs text-slate-500 text-center mt-4">
                        Your wallet needs to be on the correct network to use Figaro.
                    </p>
                </div>
            </div>
        </div>
    );
}

/**
 * Hook to validate chain before contract interactions
 * Throws error if on wrong chain
 */
export function useChainValidation() {
    const chainId = useChainId();
    const { isConnected } = useAccount();

    const validateChain = () => {
        if (!isConnected) {
            throw new Error("Wallet not connected");
        }

        if (!SUPPORTED_CHAIN_IDS.includes(chainId)) {
            throw new Error(
                `Wrong network. Please switch to ${CHAIN_NAMES[SUPPORTED_CHAIN_IDS[0]]} (chain ID: ${SUPPORTED_CHAIN_IDS[0]})`
            );
        }
    };

    return {
        isCorrectChain: SUPPORTED_CHAIN_IDS.includes(chainId),
        validateChain,
        currentChainId: chainId,
        supportedChainIds: SUPPORTED_CHAIN_IDS,
    };
}
