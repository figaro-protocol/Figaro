import { unstable_connector, type Connector } from "wagmi";
import type { HttpTransportConfig, Transport } from "viem";
// Scoped subpath, NOT the "wagmi/connectors" barrel: that barrel re-exports
// every connector type (`porto`, `tempoWallet`, `walletConnect`, ...), each
// of which statically imports its own peer package. We install none of
// those peers (injected-only), so webpack's module-graph resolution fails
// hard on the barrel even though only `injected` is used.
// `wagmi/connectors/injected` is isolated (re-exports `injected` from
// `@wagmi/core` only).
import { injected } from "wagmi/connectors/injected";
import { mockAwareHttp } from "./mockTransport";
import { isE2EMockSession, isE2EDevnetSession } from "./e2e";

/**
 * The wagmi connector list — injected-only.
 *
 * wagmi v3 treats every wallet SDK (WalletConnect, Coinbase, MetaMask's own
 * connect SDK, ...) as an optional peer dependency, and RainbowKit — a
 * multi-wallet connect UI — has no wagmi-3 support. We install none of those
 * peers and connect through wagmi's bare `injected()` connector only.
 *
 * Any EIP-1193 browser-extension wallet (MetaMask, Rabby, Frame, Coinbase
 * extension, ...) still connects via `window.ethereum` / EIP-6963
 * discovery — `multiInjectedProviderDiscovery` in `wagmi.ts` surfaces each
 * one as its own connector. WalletConnect-only mobile wallets (no browser
 * extension) are not reachable from this frontend.
 */
export const connectors = [injected()];

/**
 * Pick an injected-type connector out of a live connector list. Matches the
 * bare `window.ethereum` connector as well as every EIP-6963-discovered
 * wallet wagmi's `injected()` shims in as its own connector (MetaMask,
 * Rabby, Frame, ...) — each keeps `type === "injected"` with a distinct
 * `id` (the provider's rdns). Shared by ClientInit's devnet auto-connect
 * and `useConnectInjected` (the header/CTA connect affordance).
 */
export function findInjectedConnector(
    connectorList: readonly Connector[],
): Connector | undefined {
    return connectorList.find((connector) => connector.type === "injected");
}

/**
 * Transport that routes a CONNECTED wallet's reads through its own EIP-1193
 * provider, falling back to `mockAwareHttp` — so a participant's reads ride
 * the infrastructure their wallet already pays for (MetaMask's RPC, etc.),
 * never the operator's default endpoint.
 *
 * Per-request policy, decided at this one chokepoint (same discipline as
 * `mockAwareHttp`'s mock short-circuit):
 *  - e2e sessions (`?e2e=mock` / `?e2e=devnet`) go straight to the http leg —
 *    byte-identical to today; the dev/test `window.ethereum` shims serve only
 *    account/sign methods and must never be asked to read.
 *  - Otherwise the wallet leg is tried first. wagmi's `unstable_connector`
 *    guards the two hazards itself: no connected injected connector →
 *    ProviderDisconnectedError; wallet on a different chain than the request →
 *    ChainDisconnectedError (verified against @wagmi/core: it checks
 *    `eth_chainId` before forwarding). ANY wallet-leg failure falls through to
 *    http — the http leg is the arbiter, so a revert re-raised there still
 *    propagates with its payload (mockAwareHttp's rule), and a wallet that
 *    doesn't serve a method (e.g. eth_sendRawTransaction on MetaMask) costs
 *    one rejected attempt, never a broken call.
 *
 * The injected connector type covers bare `injected()` and every EIP-6963
 * discovered wallet — the only connector kind this app registers
 * (this module's `connectors` is injected-only, with no
 * RainbowKit/WalletConnect); any other connector type would simply fall
 * through to http.
 *
 * `walletTransport` is injectable for tests only — the default is the real
 * wagmi connector transport.
 */
export function connectorFirstTransport(
    url: string,
    config?: HttpTransportConfig,
    walletTransport: Transport = unstable_connector(injected, { retryCount: 0 }),
): Transport {
    const viaHttp = mockAwareHttp(url, config);
    return (opts) => {
        const walletInstance = walletTransport(opts);
        const httpInstance = viaHttp(opts);
        return {
            ...httpInstance,
            request: async (args) => {
                if (isE2EMockSession() || isE2EDevnetSession()) {
                    return httpInstance.request(args);
                }
                try {
                    return await walletInstance.request(args);
                } catch {
                    return httpInstance.request(args);
                }
            },
        };
    };
}
