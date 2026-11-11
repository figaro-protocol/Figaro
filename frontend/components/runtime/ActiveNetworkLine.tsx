"use client";

/**
 * ActiveNetworkLine — one line in the wallet shell naming the chain the
 * wallet is on, so every wallet write on the page says where it goes.
 *
 * Every write (`simulateWriteVerify` in `lib/shared/contractWrite.ts`) runs
 * inside `<Providers>`, which mounts this line beside `ConfigurationBanner`.
 * The name and whether it is a test network come from viem's definition of
 * the chain, by id (`chainById`): "a test network" is said only when that
 * definition carries `testnet: true`. A missing flag is not read as mainnet,
 * since Ethereum mainnet, Polygon, Anvil and the devnet all carry none. A
 * chain viem does not know renders nothing.
 */

import { useConnection } from "wagmi";
import type { Chain } from "viem";
import { activeChain, chainById, pageDeployment } from "@/lib/shared/chains";
import { useMounted } from "@/hooks/useMounted";

/**
 * The chain the connected wallet is on, from wagmi's connection; with no
 * wallet connected, the page's chain. `useChainId()` is not the
 * wallet's chain: the wagmi config lists one chain (`lib/shared/wagmi.ts`),
 * so it always returns the page's chain whatever network the wallet is on.
 */
export function useWalletChain(): Chain | undefined {
    const { chainId } = useConnection();
    if (chainId !== undefined) return chainById(chainId);
    // An address naming an unlisted deployment shows no deployment: with no
    // wallet there is no chain to name (`PageDeploymentNotice` says why).
    return pageDeployment.kind === "unlisted" ? undefined : chainById(activeChain.id);
}

export function ActiveNetworkLine() {
    const chain = useWalletChain();
    // The server renders before wagmi restores the wallet's connection, so
    // the line waits for the client: a wallet on another chain would
    // otherwise render different text on each side (a hydration error).
    const mounted = useMounted();
    if (!mounted || !chain) return null;

    return (
        <p
            role="note"
            data-testid="active-network-line"
            className="border-b border-default bg-subtle px-4 py-1 text-center text-xs text-ink-muted"
        >
            {chain.testnet ? `${chain.name}, a test network` : chain.name}
        </p>
    );
}
