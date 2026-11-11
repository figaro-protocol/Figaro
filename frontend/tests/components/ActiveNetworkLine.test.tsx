/**
 * The network line in the wallet shell: every page that writes through the
 * wallet mounts it, beside the configuration banner. It names the chain the
 * wallet is on, read from wagmi's connection (never `useChainId()`, which the
 * one-chain wagmi config pins to the page's chain), and with no wallet
 * connected the page's chain. The name comes from viem's definition
 * of the chain, by id, and the line says it is a test network only when that
 * definition carries `testnet: true`. A missing flag is not read as mainnet:
 * Ethereum mainnet, Polygon and the devnet carry none. A chain viem does not
 * know renders nothing.
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

let walletChainId: number | undefined;
// `useChainId` is the page's chain (the devnet in this suite); the line must not read it.
vi.mock("wagmi", () => ({ useConnection: () => ({ chainId: walletChainId }), useChainId: () => 31337 }));

let unlisted = false;
vi.mock("@/lib/shared/chains", async (original) => {
    const real = await original<typeof import("@/lib/shared/chains")>();
    return {
        ...real,
        get pageDeployment() {
            return unlisted ? { kind: "unlisted" as const, chainId: 137, core: null } : real.pageDeployment;
        },
    };
});

import { ActiveNetworkLine } from "@/components/runtime/ActiveNetworkLine";

const line = () => screen.getByTestId("active-network-line");

describe("ActiveNetworkLine — the wallet's chain, named", () => {
    beforeEach(() => {
        walletChainId = undefined;
        unlisted = false;
    });

    it("names no chain, with no wallet, on a page whose address names an unlisted deployment", () => {
        unlisted = true;
        const { container } = render(<ActiveNetworkLine />);
        expect(container).toBeEmptyDOMElement();
    });

    it("still names a wallet's chain on such a page", () => {
        unlisted = true;
        walletChainId = 11155111;
        render(<ActiveNetworkLine />);
        expect(line()).toHaveTextContent(/^Sepolia, a test network$/);
    });

    it("names a wallet's test network and says it is one", () => {
        walletChainId = 11155111;
        render(<ActiveNetworkLine />);
        expect(line()).toHaveTextContent(/^Sepolia, a test network$/);
        expect(line()).toHaveAttribute("role", "note");
    });

    it("names a wallet's chain without the flag and adds nothing to its name", () => {
        for (const [id, name] of [[1, "Ethereum"], [137, "Polygon"]] as const) {
            walletChainId = id;
            const { unmount } = render(<ActiveNetworkLine />);
            expect(line()).toHaveTextContent(new RegExp(`^${name}$`));
            unmount();
        }
    });

    it("names a wallet on the devnet chain by the name this site gives it, with nothing added", () => {
        walletChainId = 31337;
        render(<ActiveNetworkLine />);
        expect(line()).toHaveTextContent(/^Localhost$/);
    });

    it("renders nothing for a wallet on a chain viem does not know", () => {
        walletChainId = 424242;
        const { container } = render(<ActiveNetworkLine />);
        expect(container).toBeEmptyDOMElement();
    });

    it("names the page's chain when no wallet is connected", () => {
        render(<ActiveNetworkLine />);
        expect(line()).toHaveTextContent(/^Localhost$/);
    });
});
