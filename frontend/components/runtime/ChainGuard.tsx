/**
 * ChainGuard — a notice, never a gate, when the wallet is on another chain.
 *
 * It reads the chain the WALLET is on (`useConnection().chainId`). wagmi's
 * config lists one chain (`lib/shared/wagmi.ts`), so `useChainId()` always
 * returns the page's chain, whatever network the wallet is on.
 *
 * Reading needs no wallet (`docs/FRONTEND.md` § "Wallet-provider scope per
 * route"), so the page is never blurred or disabled: reads go to the page's
 * chain over http whatever the wallet is on. What refuses a write on the wrong
 * chain is the write itself: every write names `chainId: activeChain.id`
 * (`lib/shared/contractWrite.ts`), and a mismatch is refused in the page,
 * before the wallet prompt. This notice names both chains and offers the
 * switch. When the build lists a deployment on the wallet's chain it also
 * offers to show that deployment: the page shows one deployment for its
 * whole life (`lib/shared/chains.ts`), so that is a navigation, taken only
 * on the visitor's word. With no wallet connected it shows nothing, and it
 * shows nothing on a page whose address names an unlisted deployment, where
 * nothing is written (`PageDeploymentNotice` says so).
 */

"use client";

import { useConnection, useSwitchChain } from "wagmi";
import { Button } from "@/components/ui/Button";
import { activeChain, chainById, deploymentOn, pageDeployment, showDeployment } from "@/lib/shared/chains";

export function ChainGuard({ children }: { children: React.ReactNode }) {
    const { isConnected, chainId } = useConnection();
    const { switchChain } = useSwitchChain();

    const onOtherChain =
        pageDeployment.kind !== "unlisted" && isConnected && chainId !== undefined && chainId !== activeChain.id;
    const walletDeployment = onOtherChain ? deploymentOn(chainId) : null;
    // A chain viem's registry does not know is not named (`chainById`).
    const walletChain = onOtherChain ? chainById(chainId)?.name ?? "another network" : null;

    return (
        <>
            {onOtherChain && (
                // The `RpcBanner` tokens (an ocher rule and the `-fg` text
                // channel on canvas), in the page flow so it covers nothing.
                <div
                    role="status"
                    className="bg-canvas border-y border-warning text-warning-fg text-sm py-2 px-4 flex flex-wrap items-center justify-center gap-3"
                >
                    <span>
                        Your wallet is on {walletChain}. This page writes to {activeChain.name} only;
                        a transaction is refused until the wallet is on {activeChain.name}.
                    </span>
                    <Button size="compact" variant="outline" onClick={() => switchChain({ chainId: activeChain.id })}>
                        Switch to {activeChain.name}
                    </Button>
                    {walletDeployment && (
                        <Button size="compact" variant="outline" onClick={() => showDeployment(walletDeployment)}>
                            Show {walletChain}
                        </Button>
                    )}
                </div>
            )}
            {children}
        </>
    );
}
