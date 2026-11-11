/**
 * The page's deployment in the address bar and in the page.
 *
 * `PageDeploymentUrl` keeps the address naming the deployment the page shows,
 * and lets the wallet the browser restores at entry name it when the address
 * named none. `PageDeploymentNotice` says when the address names a deployment
 * the build does not list, and which deployments the build lists.
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DeploymentRecord } from "@/lib/shared/deploymentRecords";
import type { PageDeployment } from "@/lib/shared/chains";

const OWN: DeploymentRecord = { chainId: 31337, figaroCore: `0x${"aa".repeat(20)}` };
const SEPOLIA: DeploymentRecord = { chainId: 11155111, figaroCore: `0x${"5e".repeat(20)}` };

const mocks = vi.hoisted(() => ({
    page: { kind: "build", named: false } as unknown,
    record: null as unknown,
    listed: [] as unknown[],
    connection: { status: "disconnected", chainId: undefined as number | undefined },
    showDeployment: vi.fn(),
    replace: vi.fn(),
}));

vi.mock("@/lib/shared/chains", async (original) => {
    const real = await original<typeof import("@/lib/shared/chains")>();
    return {
        ...real,
        get pageDeployment() {
            return mocks.page as PageDeployment;
        },
        pageRecord: () => mocks.record as DeploymentRecord | null,
        listedDeployments: () => mocks.listed as DeploymentRecord[],
        deploymentOn: (chainId: number) => (mocks.listed as DeploymentRecord[]).find((r) => r.chainId === chainId) ?? null,
        showDeployment: mocks.showDeployment,
    };
});
vi.mock("wagmi", () => ({ useConnection: () => mocks.connection }));
vi.mock("next/navigation", () => ({ usePathname: () => window.location.pathname, useSearchParams: () => new URLSearchParams(window.location.search) }));

import { PageDeploymentNotice, PageDeploymentUrl } from "@/components/runtime/PageDeployment";

beforeEach(() => {
    mocks.page = { kind: "build", named: false };
    mocks.record = OWN;
    mocks.listed = [OWN, SEPOLIA];
    mocks.connection = { status: "disconnected", chainId: undefined };
    mocks.showDeployment.mockClear();
    mocks.replace.mockClear();
    window.history.replaceState(null, "", "/orders/view/?process=0x01");
    // jsdom's `location` cannot navigate; this one reads the document's
    // address live and records a `replace`.
    const location = Object.create(Object.getPrototypeOf(window.location));
    for (const part of ["pathname", "search", "hash"] as const) {
        Object.defineProperty(location, part, { get: () => new URL(document.URL)[part] });
    }
    location.replace = mocks.replace;
    Object.defineProperty(window, "location", { configurable: true, value: location });
});

describe("PageDeploymentUrl — the address names the page's deployment", () => {
    it("adds the chain id and the Core to an address naming none, keeping its parameters", () => {
        render(<PageDeploymentUrl />);
        expect(document.URL).toContain(`/orders/view/?process=0x01&chainID=31337&coreAddress=${OWN.figaroCore}`);
    });

    it("leaves an address alone when the page has no deployment to name", () => {
        mocks.page = { kind: "unlisted", chainId: 137, core: null };
        mocks.record = null;
        window.history.replaceState(null, "", "/orders/?chainID=137");
        render(<PageDeploymentUrl />);
        expect(new URL(document.URL).search).toBe("?chainID=137");
    });
});

describe("PageDeploymentUrl — the wallet's say at entry", () => {
    it("moves to the deployment on the restored wallet's chain when the address named none", () => {
        mocks.connection = { status: "reconnecting", chainId: undefined };
        const { rerender } = render(<PageDeploymentUrl />);
        mocks.connection = { status: "connected", chainId: SEPOLIA.chainId };
        act(() => rerender(<PageDeploymentUrl />));
        expect(mocks.replace).toHaveBeenCalledTimes(1);
        expect(mocks.replace.mock.calls[0][0]).toContain(`chainID=11155111&coreAddress=${SEPOLIA.figaroCore}`);
    });

    it("stays when the address named the deployment", () => {
        mocks.page = { kind: "build", named: true };
        mocks.connection = { status: "connected", chainId: SEPOLIA.chainId };
        render(<PageDeploymentUrl />);
        expect(mocks.replace).not.toHaveBeenCalled();
    });

    it("stays when the visitor connects the wallet: a connection the visitor makes never moves the page", () => {
        const { rerender } = render(<PageDeploymentUrl />);
        mocks.connection = { status: "connecting", chainId: undefined };
        act(() => rerender(<PageDeploymentUrl />));
        mocks.connection = { status: "connected", chainId: SEPOLIA.chainId };
        act(() => rerender(<PageDeploymentUrl />));
        expect(mocks.replace).not.toHaveBeenCalled();
    });

    it("stays on /evidence-display: its link is a forum's, and names what the page reads", () => {
        window.history.replaceState(null, "", "/evidence-display/?processId=0x01&arbitrableJsonRpcUrl=https%3A%2F%2Frpc.example.com");
        mocks.connection = { status: "connected", chainId: SEPOLIA.chainId };
        render(<PageDeploymentUrl />);
        expect(mocks.replace).not.toHaveBeenCalled();
    });

    it("stays when the restored wallet is on a chain the build lists no deployment on, or on the page's own", () => {
        mocks.connection = { status: "connected", chainId: 137 };
        const { unmount } = render(<PageDeploymentUrl />);
        unmount();
        mocks.connection = { status: "connected", chainId: 31337 };
        render(<PageDeploymentUrl />);
        expect(mocks.replace).not.toHaveBeenCalled();
    });
});

describe("PageDeploymentNotice", () => {
    it("says an address names a deployment the build does not list, and that nothing is read or signed", () => {
        mocks.page = { kind: "unlisted", chainId: 137, core: `0x${"cc".repeat(20)}` };
        mocks.record = null;
        render(<PageDeploymentNotice />);
        const notice = screen.getByTestId("unlisted-deployment-notice");
        expect(notice).toHaveTextContent("This address names a deployment this site does not list (chain 137, Core 0x" + "cc".repeat(20) + ").");
        expect(notice).toHaveTextContent("Nothing is read from it here, and nothing can be signed on it.");
        expect(notice).toHaveTextContent("This site lists: Localhost, Sepolia.");
    });

    it("names a Core the address carries without a chain id", () => {
        mocks.page = { kind: "unlisted", chainId: null, core: `0x${"cc".repeat(20)}` };
        mocks.record = null;
        render(<PageDeploymentNotice />);
        expect(screen.getByTestId("unlisted-deployment-notice")).toHaveTextContent(
            "does not list (Core 0x" + "cc".repeat(20) + ").",
        );
    });

    it("says nothing on /evidence-display, which reads the deployment its link names", () => {
        window.history.replaceState(null, "", "/evidence-display/?processId=0x01&chainID=137");
        mocks.page = { kind: "unlisted", chainId: 137, core: null };
        mocks.record = null;
        const { container } = render(<PageDeploymentNotice />);
        expect(container).toBeEmptyDOMElement();
    });

    it("tells two listed deployments on one chain apart by the head of their Core", () => {
        const second = { chainId: 11155111, figaroCore: `0x${"7f".repeat(20)}` as `0x${string}` };
        mocks.listed = [OWN, SEPOLIA, second];
        render(<PageDeploymentNotice />);
        expect(screen.getByTestId("listed-deployments-line")).toHaveTextContent(
            "This site lists: Sepolia (Core 0x5e5e5e5e…), Sepolia (Core 0x7f7f7f7f…).",
        );
    });

    it("lists the other deployments of the build, each a link that shows it", async () => {
        render(<PageDeploymentNotice />);
        const line = screen.getByTestId("listed-deployments-line");
        expect(line).toHaveTextContent("This page shows Localhost. This site lists: Sepolia.");
        await userEvent.click(screen.getByRole("link", { name: "Sepolia" }));
        expect(mocks.showDeployment).toHaveBeenCalledWith(SEPOLIA);
    });

    it("renders nothing when the build lists the page's deployment alone", () => {
        mocks.listed = [OWN];
        const { container } = render(<PageDeploymentNotice />);
        expect(container).toBeEmptyDOMElement();
    });
});
