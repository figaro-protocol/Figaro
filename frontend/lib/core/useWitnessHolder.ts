/**
 * useWitnessHolder — whose kept private witness content a page reads and
 * writes (`WitnessHolder` in `./witnessContent`): the wallet connected, on
 * the chain the page shows. Null while no wallet is connected, so the page
 * reads no kept copy and keeps none.
 */
import { useMemo } from "react";
import { useAccount, useChainId } from "wagmi";
import type { WitnessHolder } from "@/lib/core/witnessContent";

// lint-allow-duplicate-symbol: the hook that returns the connected wallet's WitnessHolder
export function useWitnessHolder(): WitnessHolder | null {
    const { address } = useAccount();
    const chainId = useChainId();
    return useMemo(() => (address && chainId ? { address, chainId } : null), [address, chainId]);
}
