/**
 * wagmi.ts — wagmi config and viem public client.
 *
 * Chain definitions  → lib/shared/chains.ts
 * Wallet connectors  → lib/shared/connectors.ts
 * Dev/test shims     → lib/shared/devShims.ts
 */
import { createConfig } from "wagmi";
import { createPublicClient } from "viem";
import { localAnvil, hardhat, activeChain, chains } from "./chains";
import { connectors } from "./connectors";
import { mockAwareHttp } from "./mockTransport";
import { readUserEndpoints } from "./userEndpoints";
import {
    attachDebugClient,
    attachDevProvider,
    attachTestSigner,
} from "./devShims";

// Re-export chain primitives so existing imports from this module keep working.
export {   activeChain,  };
// localAnvil (id=31337) supersedes the standalone hardhat export for local dev.

// ---------------------------------------------------------------------------
// Viem public client — used directly by hooks and window.figaroPublicClient
// ---------------------------------------------------------------------------

// The RPC transport points straight at the chain endpoint in every
// environment — the static export has no server to proxy through (the former
// dev `/rpc` rewrite is gone), and the browser reaches a CORS-permissive local
// Anvil / a public gateway directly. NEXT_PUBLIC_RPC_URL is only the DEFAULT —
// the user's runtime override (their own provider key, /settings) wins, so a
// hosted deploy never bills every visitor's reads to the operator's key.
// wagmi's config is created once at module load, so an override change
// applies on the next reload.
const rpcUrl =
    readUserEndpoints().rpcUrl ??
    process.env.NEXT_PUBLIC_RPC_URL ??
    activeChain.rpcUrls.default.http[0];

export const publicClient = createPublicClient({
    chain: activeChain,
    transport: mockAwareHttp(rpcUrl),
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
        [activeChain.id]: mockAwareHttp(rpcUrl, { batch: false }),
    } as Record<number, ReturnType<typeof mockAwareHttp>>,
    connectors,
    // EIP-6963 multi-injected-provider discovery. Default in wagmi v2 is `true`;
    // setting explicitly because multiple call sites (ClientInit, the order commitment flow)
    // assume discovery is happening. Disabling it would silently break MetaMask /
    // Rabby / Frame side-by-side selection.
    multiInjectedProviderDiscovery: true,
    // NOT ssr:true — deferring wallet restore to post-mount broke flows that
    // assume synchronous reconnect (seller-edit, chain scenarios; verified by
    // e2e regression 2026-07-04). Hydration safety is handled at the render
    // layer instead: connection-branching UI gates on useMounted().
});


// ---------------------------------------------------------------------------
// Browser-only dev/test shims — call as side effects on module load.
// These are no-ops outside the browser and when env vars are absent.
// ---------------------------------------------------------------------------
attachDebugClient(rpcUrl);
attachDevProvider();
attachTestSigner();
