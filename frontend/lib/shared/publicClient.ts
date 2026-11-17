/**
 * publicClient.ts — the page's standalone viem public client, and the RPC it reads.
 *
 * Reading needs an RPC, never a wallet: this module imports no wallet code
 * (no `wagmi`, no connector, no signer), so a marketing page reads the chain
 * through it without loading the wallet stack (docs/FRONTEND.md
 * § "Wallet-provider scope per route"). wagmi's config, which the app pages
 * mount, is built in `lib/shared/wagmi.ts` on the same `siteRpcUrl`.
 *
 * The one development shim that serves a read, the debug client
 * (`lib/shared/debugClient.ts`), attaches here, on every page that reads.
 */
import { createPublicClient } from "viem";
import { activeChain, pageRecord } from "./chains";
import { mockAwareHttp } from "./mockTransport";
import { readUserEndpoints } from "./userEndpoints";
import { attachDebugClient } from "./debugClient";

// The RPC transport points straight at the chain endpoint in every
// environment — the static export has no server to proxy through, and the
// browser reaches a CORS-permissive local Anvil / a public gateway directly.
// The page's deployment record names the DEFAULT endpoint (`rpcUrl`: a
// published deployment record's keyless public endpoint, or the build's own
// NEXT_PUBLIC_RPC_URL) —
// the user's runtime override for the page's chain (their own provider key)
// wins, so a hosted deploy never bills every visitor's reads to the operator's
// key. With neither, the chain's own default endpoint is read.
// The endpoint is read once at module load, so an override change applies on
// the next reload.

/** The viewer's own RPC override for the page's chain, if one is set. */
export const userRpcOverride = readUserEndpoints().rpcUrl;

/** The RPC this page reads: the viewer's own override for the page's chain, else its deployment's default. */
export const siteRpcUrl =
    userRpcOverride ??
    pageRecord()?.rpcUrl ??
    activeChain.rpcUrls.default.http[0];

export const publicClient = createPublicClient({
    chain: activeChain,
    transport: mockAwareHttp(siteRpcUrl),
});

// Browser-only, development builds only: window.figaroPublicClient and the
// RPC trace log. A no-op outside the browser and in a production build.
attachDebugClient(siteRpcUrl);
