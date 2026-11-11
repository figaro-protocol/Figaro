/**
 * ChainGuard reads the chain the WALLET is on, not the chain wagmi's config
 * holds. The config lists one chain (`lib/shared/wagmi.ts`, `chains:
 * [activeChain]`), so `useChainId()` always returns the page's chain whatever
 * network the wallet is on; only the connection carries the wallet's own.
 * The mock below behaves the same way: `useChainId()` is pinned to the build's
 * chain while the connection reports the wallet's.
 *
 * The guard is a notice, never a gate: reading needs no wallet, and the write
 * itself refuses the wrong chain (`contractWriteChain.test.ts`).
 *
 * - wallet on another chain: a notice naming both chains, with the switch
 *   action, and the page stays interactive;
 * - wallet on a chain the build lists a deployment on: the notice also offers
 *   to show that deployment, a navigation naming it in the URL;
 * - wallet on a chain other than the page's that a development build once
 *   accepted (1337): the same notice — only the page's chain is right;
 * - wallet on the page's chain: no notice;
 * - no wallet: no notice.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { activeChain } from "@/lib/shared/chains";

const MAINNET_ID = 1;

const SEPOLIA_ID = 11155111;

const mocks = vi.hoisted(() => ({
    connection: { isConnected: false, chainId: undefined as number | undefined },
    switchChain: vi.fn(),
    showDeployment: vi.fn(),
}));

vi.mock("@/lib/shared/chains", async (original) => ({
    ...(await original<typeof import("@/lib/shared/chains")>()),
    showDeployment: mocks.showDeployment,
    // The suite's build is the devnet, which lists no published record; the
    // guard is given one deployment, on Sepolia.
    deploymentOn: (chainId: number) =>
        chainId === 11155111 ? { chainId, figaroCore: `0x${"5e".repeat(20)}` } : null,
}));

vi.mock("wagmi", async () => {
    const { activeChain: build } = await import("@/lib/shared/chains");
    return {
        useConnection: () => mocks.connection,
        useAccount: () => mocks.connection,
        // wagmi never moves its own chain state to an unconfigured chain.
        useChainId: () => build.id,
        useSwitchChain: () => ({ switchChain: mocks.switchChain }),
    };
});

import { ChainGuard } from "@/components/runtime/ChainGuard";

const pageAction = vi.fn();

function renderGuard() {
    return render(
        <ChainGuard>
            <p>the page</p>
            <button type="button" onClick={pageAction}>read more</button>
        </ChainGuard>,
    );
}

beforeEach(() => {
    mocks.connection = { isConnected: false, chainId: undefined };
    mocks.switchChain = vi.fn();
    mocks.showDeployment.mockClear();
    pageAction.mockClear();
});

describe("ChainGuard — the wallet's own chain", () => {
    it("names the wallet's chain and the page's, offers the switch, and leaves the page interactive", async () => {
        mocks.connection = { isConnected: true, chainId: MAINNET_ID };
        renderGuard();
        const notice = screen.getByRole("status");
        expect(notice).toHaveTextContent("Your wallet is on Ethereum.");
        expect(notice).toHaveTextContent(`This page writes to ${activeChain.name} only`);

        await userEvent.click(screen.getByRole("button", { name: `Switch to ${activeChain.name}` }));
        expect(mocks.switchChain).toHaveBeenCalledWith({ chainId: activeChain.id });

        // Not blurred, not disabled: the page's own controls still act.
        await userEvent.click(screen.getByRole("button", { name: "read more" }));
        expect(pageAction).toHaveBeenCalledTimes(1);
    });

    it("shows the notice for a wallet on 1337, a chain other than the page's", () => {
        mocks.connection = { isConnected: true, chainId: 1337 };
        renderGuard();
        expect(screen.getByRole("status")).toHaveTextContent(`This page writes to ${activeChain.name} only`);
    });

    it("offers to show the deployment the build lists on the wallet's chain", async () => {
        mocks.connection = { isConnected: true, chainId: SEPOLIA_ID };
        renderGuard();
        await userEvent.click(screen.getByRole("button", { name: "Show Sepolia" }));
        expect(mocks.showDeployment).toHaveBeenCalledTimes(1);
        expect(mocks.showDeployment.mock.calls[0][0]).toMatchObject({ chainId: SEPOLIA_ID });
        expect(mocks.switchChain).not.toHaveBeenCalled();
    });

    it("offers only the switch for a wallet on a chain the build lists no deployment on", () => {
        mocks.connection = { isConnected: true, chainId: MAINNET_ID };
        renderGuard();
        expect(screen.getByRole("button", { name: `Switch to ${activeChain.name}` })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /^Show / })).toBeNull();
    });

    it("shows no notice for a wallet on the page's chain", () => {
        mocks.connection = { isConnected: true, chainId: activeChain.id };
        renderGuard();
        expect(screen.getByText("the page")).toBeInTheDocument();
        expect(screen.queryByRole("status")).toBeNull();
    });

    it("shows no notice when no wallet is connected", () => {
        renderGuard();
        expect(screen.getByText("the page")).toBeInTheDocument();
        expect(screen.queryByRole("status")).toBeNull();
    });
});
