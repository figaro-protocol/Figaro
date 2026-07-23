import { defineChain } from "viem";
import { hardhat as _hardhat } from "wagmi/chains";
import { sepolia } from "viem/chains";

/** Anvil's default chainId — the single source for the devnet chain id. */
export const DEVNET_CHAIN_ID = 31337;

/**
 * Local Anvil chain — uses chainId 31337 to exactly match Anvil's default
 * and MetaMask's built-in "Hardhat" entry.  This prevents MetaMask v11+
 * from routing wallet_switchEthereumChain through the Snaps
 * network-management dialog, which would ask the user to authorise sending
 * information to third parties.  We name the chain "Localhost" so the
 * RainbowKit UI displays it that way, while the underlying chainId matches
 * the MetaMask preset — no custom chain add required.
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
