import { defineChain } from "viem";
import { hardhat as _hardhat } from "wagmi/chains";
import { baseSepolia } from "viem/chains";

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
    id: 31337,
    name: "Localhost",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: {
        default: { http: ["http://127.0.0.1:8545"] },
    },
});

// Re-export wagmi's built-in hardhat chain unchanged.
export const hardhat = _hardhat;
export { baseSepolia };

/**
 * Active chain selection — controlled by NEXT_PUBLIC_CHAIN env var.
 *
 *   NEXT_PUBLIC_CHAIN=base-sepolia  → Base Sepolia testnet
 *   (default / unset)               → local Anvil
 *
 * The /rpc proxy in next.config.js must point at the matching RPC endpoint.
 */
export const activeChain =
    process.env.NEXT_PUBLIC_CHAIN === "base-sepolia" ? baseSepolia : localAnvil;

/** All chains supported by the dapp, in preference order. */
export const chains = [activeChain, hardhat] as const;
