/**
 * useWitnessHolder — whose kept private witness content a page reads and
 * writes (`WitnessHolder` in `./witnessContent`): the wallet connected, on
 * the chain the page shows. Null while no wallet is connected, so the page
 * reads no kept copy and keeps none.
 */
import { useMemo } from "react";
import { useAccount, useChainId } from "wagmi";
import type { WitnessHolder } from "@/lib/composition/witnessContent";

export function useWitnessHolder(): WitnessHolder | null {
    const { address } = useAccount();
    const chainId = useChainId();
    return useMemo(() => (address && chainId ? { address, chainId } : null), [address, chainId]);
}
