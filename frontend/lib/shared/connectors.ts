import type { Connector } from "wagmi";
// Scoped subpath, NOT the "wagmi/connectors" barrel: that barrel re-exports
// every connector type (`porto`, `tempoWallet`, `walletConnect`, ...), each
// of which statically imports its own peer package. We install none of
// those peers (injected-only), so webpack's module-graph resolution fails
// hard on the barrel even though only `injected` is used — verified during
// Task 7.2's production build. `wagmi/connectors/injected` is isolated
// (re-exports `injected` from `@wagmi/core` only).
import { injected } from "wagmi/connectors/injected";

/**
 * The wagmi connector list — injected-only.
 *
 * wagmi v3 moved every wallet SDK (WalletConnect, Coinbase, MetaMask's own
 * connect SDK, ...) to optional peer dependencies, and RainbowKit — the
 * prior multi-wallet connect UI — has no wagmi-3 support (open discussion
 * rainbow-me/rainbowkit#2575; the latest RainbowKit still peers
 * `wagmi ^2.9.0` as of 2026-08-03). The ratified fallback (Task 7.2,
 * RELEASE_READINESS.md § Task 7) is: drop RainbowKit and WalletConnect
 * entirely and connect through wagmi's bare `injected()` connector only.
 *
 * Any EIP-1193 browser-extension wallet (MetaMask, Rabby, Frame, Coinbase
 * extension, ...) still connects via `window.ethereum` / EIP-6963
 * discovery — `multiInjectedProviderDiscovery` in `wagmi.ts` surfaces each
 * one as its own connector. WalletConnect-only mobile wallets (no browser
 * extension) are no longer reachable from this frontend.
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
