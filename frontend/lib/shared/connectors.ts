import { injected } from "wagmi/connectors";
import { getDefaultWallets } from "@rainbow-me/rainbowkit";

/**
 * Build the wagmi connector list.
 *
 * - Uses RainbowKit's `getDefaultWallets` when a real WalletConnect project id
 *   is configured, giving users MetaMask, Coinbase, Rainbow, etc.
 * - Falls back to a bare injected() connector when no project id is present
 *   (local dev / CI) so window.ethereum still works without a cloud account.
 * - Respects NEXT_PUBLIC_DISABLE_WALLET_CONNECTORS=1 for test isolation.
 */

const rawProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
// Real WalletConnect project IDs are 32-character hex strings.
// Reject placeholders (e.g. "localtestprojectid", "YOUR_PROJECT_ID") so that
// AppKit / Reown is never initialised without a valid cloud account — otherwise
// it calls api.web3modal.org, gets 403s, and opens the "unsupported network"
// modal for every local chain on every page load.
const projectId =
    rawProjectId && /^[0-9a-f]{32}$/i.test(rawProjectId)
        ? rawProjectId
        : undefined;

const disableConnectors =
    process.env.NEXT_PUBLIC_DISABLE_WALLET_CONNECTORS === "1";

if (disableConnectors) {
    // eslint-disable-next-line no-console
    console.warn(
        "RainbowKit connectors disabled via NEXT_PUBLIC_DISABLE_WALLET_CONNECTORS"
    );
}

function buildConnectors() {
    if (disableConnectors) {
        // In test/CI mode keep only the injected connector so window.ethereum
        // (our devShim or real MetaMask) can still connect.
        return [injected()];
    }

    // Without a real WalletConnect project id, skip getDefaultWallets entirely.
    // Passing a placeholder ID initialises AppKit, which then calls WalletConnect
    // cloud APIs (receiving 403s) and flags every local chain as "unsupported",
    // opening the chain-switch modal automatically on every page load.
    if (!projectId) {
        return [injected()];
    }

    const { connectors: rbConnectors } = getDefaultWallets({
        appName: "Figaro Protocol",
        projectId,
    });

    // Always include wagmi's built-in injected() connector so any window.ethereum
    // provider (including our devShim) can connect directly.
    const all = [...rbConnectors];
    if (!all.some((connector) => (connector as { id?: string } | undefined)?.id === "injected")) {
        all.push(injected());
    }
    return all;
}

export const connectors = buildConnectors();
