/**
 * The app's pages over a network read that fails, resolves empty, or is still
 * in flight (docs/OPEN_WORLD.md § 1 "No fallbacks — absence is the
 * representation"). One table, one row per page; each row renders the page's
 * view with its read mocked at the hook the page calls, in three states:
 *
 * - failed: the read's place is empty. No empty-state sentence (the chain
 *   was not read, so nothing is known to be absent), no loading line, no
 *   figure, no name, no badge, and no error text.
 * - resolved empty: the page may say that the chain answered with nothing;
 *   it shows no loading line and no error text.
 * - in flight: the loading line, and nothing else for the read's place.
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ProcessTimeline } from "@/lib/audit/processTimeline";
import { ABSENT, PENDING, present, type NetworkRead } from "@/lib/shared/networkRead";

const WALLET = "0x70997970c51812dc3a010c7d01b50e0d17dc79c8" as const;
const PROCESS = `0x${"5e".repeat(32)}` as const;

type ReadCase = "failed" | "empty" | "pending";

const m = vi.hoisted(() => ({
    params: new URLSearchParams(),
    client: { chain: { id: 31337 } },
    agreements: new Map(),
    // Set per case in beforeEach; one object per case, as the hooks keep theirs.
    workspaceRead: undefined as unknown,
    listingsRead: undefined as unknown,
    rewardsRead: undefined as unknown,
    balanceRead: undefined as unknown,
    decimals: undefined as number | undefined,
    ordersRead: undefined as unknown,
    timeline: (async () => undefined) as () => Promise<unknown>,
}));

vi.mock("wagmi", () => ({
    useAccount: () => ({ address: WALLET, isConnected: true }),
    useChainId: () => 31337,
    usePublicClient: () => m.client,
    useReadContract: () => ({ data: undefined, isLoading: false }),
}));
vi.mock("next/navigation", () => ({
    useSearchParams: () => m.params,
    useRouter: () => ({ push: () => undefined, replace: () => undefined }),
}));
vi.mock("@/hooks/useMounted", () => ({ useMounted: () => true }));
vi.mock("@/lib/shared/viewedWallet", () => ({ useViewedWallet: (connected: unknown) => connected }));
vi.mock("@/lib/protocol/useClauseSpecs", () => ({ useClauseSpecs: () => ({ version: 0, loaded: true }) }));

// /orders/view
vi.mock("@/hooks/useSemanticProcessWorkspace", () => ({
    useSemanticProcessWorkspace: () => {
        const processModelRead = m.workspaceRead as NetworkRead<unknown>;
        return {
            processModelRead,
            processModel: processModelRead.status === "present" ? processModelRead.value : null,
            runtimeCapabilities: [],
            executableCapabilityIds: new Set(),
            executingCapabilityId: null,
            executeCapability: async () => undefined,
            actionError: null,
        };
    },
}));
vi.mock("@/hooks/useProcessResolveCapacity", () => ({ default: () => null }));
vi.mock("@/lib/member/useMemberListings", () => ({ useMemberListings: () => ({ read: m.listingsRead }) }));

// /rewards
vi.mock("@/lib/composition/useRpgfRewards", () => ({
    useRpgfRewards: () => ({ available: true, account: WALLET, read: m.rewardsRead, claim: async () => undefined, refresh: () => undefined }),
}));
vi.mock("@/hooks/useTokenDecimals", () => ({ default: () => ({ decimals: m.decimals, ready: m.decimals !== undefined, loading: false }) }));
vi.mock("@/hooks/useTokenBalance", () => ({ default: () => ({ read: m.balanceRead, refetch: () => undefined }) }));

// /audit and /audit/view
vi.mock("@/hooks/useProcessOrders", () => ({
    useProcessOrders: () => m.ordersRead,
    useWalletOrders: () => m.ordersRead,
}));
vi.mock("@/hooks/useProcessAgreements", () => ({ useProcessAgreements: () => m.agreements }));

// /evidence-display
vi.mock("@/lib/audit/processTimeline", () => ({ buildProcessTimeline: () => m.timeline() }));

import { OrderTimelineView } from "@/app/(app)/orders/_components/OrderTimelineView";
import { RewardsView } from "@/app/(app)/rewards/_components/RewardsView";
import { ProcessAuditClient } from "@/app/(app)/audit/view/ProcessAuditClient";
import { HashVerifier } from "@/app/(app)/audit/_components/HashVerifier";
import EvidenceDisplayPage from "@/app/(app)/evidence-display/page";

/** Words a page may not show in a read's place when the read failed or came back empty. */
const ERROR_TEXT = /\bfail(s|ed|ure)?\b|\berror\b|could ?n[o']t|unavailable|unable|unreachable/i;

const EMPTY_TIMELINE: ProcessTimeline = {
    processId: PROCESS,
    chainId: 31337,
    coreAddress: "0x0000000000000000000000000000000000000c0e",
    coordinatorAddress: null,
    batchVerifierAddress: null,
    scannedFromBlock: 0n,
    generatedAt: "2000-01-01T00:00:00.000Z",
    events: [],
    participants: [],
    summary: { orderCount: 0, resolvedCount: 0, totalPayment: "0", totalSellerPayout: "0", totalBuyerPayout: "0" },
} as unknown as ProcessTimeline;

function setReads(c: ReadCase) {
    const read = <T,>(value: T): NetworkRead<T> => (c === "failed" ? ABSENT : c === "pending" ? PENDING : present(value));
    m.workspaceRead = read(null);
    m.listingsRead = read([]);
    m.rewardsRead = read({ periods: [], memberLive: null });
    m.balanceRead = read(0n);
    m.decimals = c === "empty" ? 18 : undefined;
    m.ordersRead = read([]);
    m.timeline = c === "failed"
        ? async () => { throw new Error("fetch failed: RPC unreachable"); }
        : c === "pending"
            ? () => new Promise(() => undefined)
            : async () => EMPTY_TIMELINE;
}

/** Let the page's effects run and its read's promise resolve. */
async function flush() {
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
}

interface PageRow {
    route: string;
    view: () => React.ReactElement;
    /** Search parameters the route's page reads. */
    params?: Record<string, string>;
    /** Steps a reader takes before the read's place shows (a tab, a typed value). */
    open?: () => void;
    /** What the page says once the chain has answered with nothing. */
    emptyState: RegExp;
    /** The page's line for a read in flight, or null when the page shows none. */
    loading: RegExp | null;
    /** When the view is the read's whole place, a failed read leaves it with no text at all. */
    viewIsThePlace: boolean;
    /** The page's own frame, which stands whatever the read: proof the page rendered. */
    frame?: string;
    /** Elements that carry a figure, a name or a badge from the read. */
    readTestIds: string[];
}

const PAGES: PageRow[] = [
    {
        route: "/orders/view",
        view: () => <OrderTimelineView processId={PROCESS} />,
        emptyState: /No order is committed under process/,
        loading: /Loading/,
        viewIsThePlace: true,
        readTestIds: ["order-status-pill", "order-process-capacity", "order-modality", "order-timeline"],
    },
    {
        route: "/rewards",
        view: () => <RewardsView />,
        emptyState: /No reward periods exist on this network yet/,
        loading: /Reading periods and your accrual/,
        viewIsThePlace: false,
        frame: "rewards-page",
        readTestIds: ["florin-balance", "rewards-no-periods", "rewards-loading", "rewards-error"],
    },
    {
        route: "/audit/view",
        view: () => <ProcessAuditClient />,
        params: { process: PROCESS },
        emptyState: /No orders found for this process/,
        loading: /Loading/,
        viewIsThePlace: false,
        frame: "audit-page",
        readTestIds: ["financials-view", "audit-clause-evidence", "audit-dispute-section"],
    },
    {
        route: "/audit (hash search)",
        view: () => <HashVerifier />,
        open: () => {
            fireEvent.click(screen.getByTestId("verify-mode-search"));
            fireEvent.change(screen.getByTestId("verify-search-input"), { target: { value: PROCESS } });
        },
        emptyState: /No match in locally-loaded orders/,
        // The search shows no loading line: in flight, it shows nothing.
        loading: null,
        viewIsThePlace: false,
        frame: "verify-search-mode",
        readTestIds: ["verify-search-results"],
    },
    {
        route: "/evidence-display",
        view: () => <EvidenceDisplayPage />,
        params: { processId: PROCESS, arbitrableJsonRpcUrl: "http://localhost:8545" },
        emptyState: /No lifecycle events found for this process/,
        loading: /Loading process timeline/,
        viewIsThePlace: true,
        readTestIds: [],
    },
];

async function renderPage(row: PageRow) {
    m.params = new URLSearchParams(row.params ?? {});
    const utils = render(row.view());
    await flush();
    row.open?.();
    await flush();
    if (row.frame) expect(screen.getByTestId(row.frame)).toBeTruthy();
    return utils;
}

describe("app pages: a failed or empty read leaves its place empty", () => {
    beforeEach(() => {
        vi.spyOn(console, "warn").mockImplementation(() => undefined);
    });

    it.each(PAGES.map((p) => [p.route, p] as const))("%s — the read fails: nothing for the read, no error text", async (_route, row) => {
        setReads("failed");
        const { container } = await renderPage(row);
        const text = container.textContent ?? "";
        if (row.viewIsThePlace) expect(text).toBe("");
        expect(text).not.toMatch(row.emptyState);
        if (row.loading) expect(text).not.toMatch(row.loading);
        expect(text).not.toMatch(ERROR_TEXT);
        for (const id of row.readTestIds) expect(screen.queryByTestId(id)).toBeNull();
    });

    it.each(PAGES.map((p) => [p.route, p] as const))("%s — the read resolves empty: absence, no loading line, no error text", async (_route, row) => {
        setReads("empty");
        const { container } = await renderPage(row);
        const text = container.textContent ?? "";
        expect(text).toMatch(row.emptyState);
        if (row.loading) expect(text).not.toMatch(row.loading);
        expect(text).not.toMatch(ERROR_TEXT);
    });

    it.each(PAGES.map((p) => [p.route, p] as const))("%s — the read is in flight: the loading line, no empty state", async (_route, row) => {
        setReads("pending");
        const { container } = await renderPage(row);
        const text = container.textContent ?? "";
        if (row.loading) expect(text).toMatch(row.loading);
        expect(text).not.toMatch(row.emptyState);
        expect(text).not.toMatch(ERROR_TEXT);
        for (const id of row.readTestIds.filter((id) => !/loading/.test(id))) expect(screen.queryByTestId(id)).toBeNull();
    });
});
