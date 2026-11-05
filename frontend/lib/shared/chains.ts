import { defineChain, type Chain } from "viem";
import * as viemChains from "viem/chains";
import { hardhat as _hardhat } from "wagmi/chains";
import { sepolia } from "viem/chains";

/** Anvil's default chainId — the single source for the devnet chain id. */
export const DEVNET_CHAIN_ID = 31337;

/**
 * Local Anvil chain — uses chainId 31337 to exactly match Anvil's default
 * and MetaMask's built-in "Hardhat" entry.  This prevents MetaMask v11+
 * from routing wallet_switchEthereumChain through the Snaps
 * network-management dialog, which would ask the user to authorize sending
 * information to third parties.  We name the chain "Localhost" so wallet UI
 * (and this app's own ChainGuard) displays it that way, while the underlying
 * chainId matches the MetaMask preset — no custom chain add required.
 */
export const localAnvil = defineChain({
    id: DEVNET_CHAIN_ID,
    name: "Localhost",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: {
        default: { http: ["http://127.0.0.1:8545"] },
    },
});

// Re-export wagmi's built-in hardhat chain unchanged.
export const hardhat = _hardhat;
;

/**
 * Active chain selection — controlled by NEXT_PUBLIC_CHAIN env var.
 *
 *   NEXT_PUBLIC_CHAIN=sepolia       → Ethereum Sepolia testnet
 *   (default / unset)               → local Anvil
 *
 * The wagmi transport (lib/shared/wagmi.ts) points straight at this chain's
 * RPC endpoint — there is no server-side proxy (the static export has no
 * server).
 */
export const activeChain =
    process.env.NEXT_PUBLIC_CHAIN === "sepolia" ? sepolia : localAnvil;

/** All chains supported by the dapp, in preference order. */
export const chains = [activeChain, hardhat] as const;

/**
 * The chain a wallet is on, read from viem's registry of EVM networks by its
 * id: its name and whether it is a test network come from that definition
 * (`testnet: true` on Sepolia, Polygon Amoy and every other test network viem
 * knows), never from a list this build keeps. The devnet (31337) is the local
 * chain above. A chain the registry does not know resolves to nothing, and a
 * surface then says nothing about it.
 */
export function chainById(id: number): Chain | undefined {
    if (id === DEVNET_CHAIN_ID) return localAnvil;
    for (const c of Object.values(viemChains)) {
        if (typeof c === "object" && c !== null && "id" in c && (c as Chain).id === id) return c as Chain;
    }
    return undefined;
}
