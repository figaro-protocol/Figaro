/**
 * wagmi.ts — wagmi config, for the pages that mount the wallet stack.
 *
 * Chain definitions       → lib/shared/chains.ts
 * Standalone public client → lib/shared/publicClient.ts (imports no wallet code)
 * Wallet connectors       → lib/shared/connectors.ts
 * Wallet dev/test shims   → lib/shared/devShims.ts
 *
 * Only `app/providers.tsx` imports this module, so no marketing page loads it
 * (docs/FRONTEND.md § "Wallet-provider scope per route").
 */
import { createConfig } from "wagmi";
import { activeChain } from "./chains";
import { connectors, connectorFirstTransport } from "./connectors";
import { mockAwareHttp } from "./mockTransport";
import { siteRpcUrl, userRpcOverride } from "./publicClient";
import { attachDevProvider, attachTestSigner } from "./devShims";

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
// Browser-only dev/test wallet shims — call as side effects on module load.
// These are no-ops outside the browser and when env vars are absent. The
// debug client attaches with the public client (lib/shared/publicClient.ts).
// ---------------------------------------------------------------------------
attachDevProvider();
attachTestSigner();
