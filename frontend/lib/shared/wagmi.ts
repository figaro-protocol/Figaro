/**
 * wagmi.ts — wagmi config and viem public client.
 *
 * Chain definitions  → lib/shared/chains.ts
 * Wallet connectors  → lib/shared/connectors.ts
 * Dev/test shims     → lib/shared/devShims.ts
 */
import { createConfig } from "wagmi";
import { createPublicClient, http } from "viem";
import { localAnvil, hardhat, activeChain, chains } from "./chains";
import { connectors } from "./connectors";
import {
    attachDebugClient,
    attachDevProvider,
    attachTestSigner,
} from "./devShims";

// Re-export chain primitives so existing imports from this module keep working.
export { localAnvil, hardhat, activeChain, chains };
// localAnvil (id=31337) supersedes the standalone hardhat export for local dev.

// ---------------------------------------------------------------------------
// Viem public client — used directly by hooks and window.figaroPublicClient
// ---------------------------------------------------------------------------

// In development the Next.js dev server proxies /rpc → local Anvil (same-origin,
// no CORS). In production builds set NEXT_PUBLIC_RPC_URL to a real provider
// endpoint (Alchemy, Infura, etc).
const rpcUrl =
    process.env.NEXT_PUBLIC_RPC_URL ??
    (process.env.NODE_ENV === "production" ? activeChain.rpcUrls.default.http[0] : "/rpc");

export const publicClient = createPublicClient({
    chain: activeChain,
    transport: http(rpcUrl),
});

// ---------------------------------------------------------------------------
// wagmi config
// ---------------------------------------------------------------------------
// activeChain.id is a type union (localAnvil | baseSepolia) — TS can't narrow
// computed property keys from unions, so the transports record appears incomplete.
export const config = createConfig({
    chains: [activeChain],
    transports: {
        // Disable batch multicall: multicall3 may not be deployed on the target
        // chain, so wagmi's default batching (which uses multicall3) could cause
        // readContract calls to fail with "Cannot decode zero data".
        [activeChain.id]: http(rpcUrl, { batch: false }),
    } as Record<number, ReturnType<typeof http>>,
    connectors,
});

export default config;

// ---------------------------------------------------------------------------
// Browser-only dev/test shims — call as side effects on module load.
// These are no-ops outside the browser and when env vars are absent.
// ---------------------------------------------------------------------------
attachDebugClient();
attachDevProvider();
attachTestSigner();
