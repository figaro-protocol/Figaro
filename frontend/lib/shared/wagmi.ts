/**
 * wagmi.ts — wagmi config and viem public client.
 *
 * Chain definitions  → lib/shared/chains.ts
 * Wallet connectors  → lib/shared/connectors.ts
 * Dev/test shims     → lib/shared/devShims.ts
 */
import { createConfig } from "wagmi";
import { createPublicClient } from "viem";
import { activeChain, pageRecord } from "./chains";
import { connectors } from "./connectors";
import { mockAwareHttp, connectorFirstTransport } from "./mockTransport";
import { readUserEndpoints } from "./userEndpoints";
import {
    attachDebugClient,
    attachDevProvider,
    attachTestSigner,
} from "./devShims";

// Re-export chain primitives so existing imports from this module keep working.
export {   activeChain,  };

// ---------------------------------------------------------------------------
// Viem public client — used directly by hooks and window.figaroPublicClient
// ---------------------------------------------------------------------------

// The RPC transport points straight at the chain endpoint in every
// environment — the static export has no server to proxy through, and the
// browser reaches a CORS-permissive local Anvil / a public gateway directly.
// The page's deployment record names the DEFAULT endpoint (`rpcUrl`: a
// published deployment record's keyless public endpoint, or the build's own
// NEXT_PUBLIC_RPC_URL) —
// the user's runtime override for the page's chain (their own provider key)
// wins, so a hosted deploy never bills every visitor's reads to the operator's
// key. With neither, the chain's own default endpoint is read.
// wagmi's config is created once at module load, so an override change
// applies on the next reload.
const userRpcOverride = readUserEndpoints().rpcUrl;
/** The RPC this page reads: the viewer's own override for the page's chain, else its deployment's default. */
export const siteRpcUrl =
    userRpcOverride ??
    pageRecord()?.rpcUrl ??
    activeChain.rpcUrls.default.http[0];

export const publicClient = createPublicClient({
    chain: activeChain,
    transport: mockAwareHttp(siteRpcUrl),
});

// ---------------------------------------------------------------------------
// wagmi config
// ---------------------------------------------------------------------------
// One chain, the page's deployment's (`lib/shared/chains.ts`): every hook
// that reads wagmi's chain reads that one, whatever network the wallet is on.
export const config = createConfig({
    chains: [activeChain],
    transports: {
        // Disable batch multicall: multicall3 may not be deployed on the target
        // chain, so wagmi's default batching (which uses multicall3) could cause
        // readContract calls to fail with "Cannot decode zero data".
        //
        // Read-cost precedence: an EXPLICIT user RPC override is the
        // user's deliberate pick and wins outright; otherwise a CONNECTED
        // wallet's own EIP-1193 provider serves reads first (the wallet's
        // infrastructure, not the operator's endpoint), with the http default
        // as fallback. e2e sessions short-circuit to the http/mock leg inside
        // the transport — the devnet suite never touches the wallet leg.
        [activeChain.id]: userRpcOverride
            ? mockAwareHttp(siteRpcUrl, { batch: false })
            : connectorFirstTransport(siteRpcUrl, { batch: false }),
    } as Record<number, ReturnType<typeof mockAwareHttp>>,
    connectors,
    // EIP-6963 multi-injected-provider discovery. Default in wagmi v2 is `true`;
    // setting explicitly because multiple call sites (ClientInit, the order commitment flow)
    // assume discovery is happening. Disabling it would silently break MetaMask /
    // Rabby / Frame side-by-side selection.
    multiInjectedProviderDiscovery: true,
    // NOT ssr:true — deferring wallet restore to post-mount broke flows that
    // assume synchronous reconnect (/members/edit/*, chain scenarios; verified by
    // e2e). Hydration safety is handled at the render
    // layer instead: connection-branching UI gates on useMounted().
});


// ---------------------------------------------------------------------------
// Browser-only dev/test shims — call as side effects on module load.
// These are no-ops outside the browser and when env vars are absent.
// ---------------------------------------------------------------------------
attachDebugClient(siteRpcUrl);
attachDevProvider();
attachTestSigner();
