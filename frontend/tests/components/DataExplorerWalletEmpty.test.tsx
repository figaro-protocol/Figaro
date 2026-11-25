/**
 * /data/explore, wallet layer, over a graph corpus that resolved empty for a
 * typed address (docs/OPEN_WORLD.md § 1 "No fallbacks — absence is the
 * representation"). The page may say the chain answered with nothing; it shows
 * no loading line and no error text. The harness and the error-text pattern
 * are `AppPagesReadStates.test.tsx`'s.
 */
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { projectProcessGraph, projectResolutionGraph } from "@figaro-protocol/sdk/derive";
import { present } from "@/lib/shared/networkRead";
import type { GraphCorpus } from "@/lib/data/graphCorpus";

const WALLET = "0x70997970c51812dc3a010c7d01b50e0d17dc79c8";
const NO_EVENTS = { orderCommitted: [], orderResolved: [], processResolved: [] };
const EMPTY_CORPUS = {
    chainId: 31337,
    process: projectProcessGraph(NO_EVENTS),
    resolution: projectResolutionGraph(NO_EVENTS),
    overlays: [],
    valueFlow: { boundary: "composition-derived", nodes: [], edges: [] },
    market: { boundary: "protocol-derived", groups: new Map(), unattributedProcessCount: 0 },
    substance: { attempted: 0, recovered: 0, total: 0 },
    tokenMeta: new Map(),
    venue: null,
    assemblyNames: new Map(),
    attributionByProcess: new Map(),
    contestedProcesses: new Set(),
} as unknown as GraphCorpus;

vi.mock("next/navigation", () => ({
    useSearchParams: () => new URLSearchParams({ view: "wallet", wallet: "0x70997970c51812dc3a010c7d01b50e0d17dc79c8" }),
    useRouter: () => ({ push: () => undefined, replace: () => undefined }),
    usePathname: () => "/data/explore",
}));
vi.mock("@/hooks/useMounted", () => ({ useMounted: () => true }));
vi.mock("@/lib/data/graphCorpus", () => ({ useGraphCorpus: () => present(EMPTY_CORPUS) }));
vi.mock("@/lib/data/analystEndpoint", () => ({ getAnalystUrl: () => null, readAnalystStatus: async () => null, askAnalyst: async () => null }));

import { DataExplorer } from "@/components/data/DataExplorer";

/** Words a page may not show in a read's place when the read failed or came back empty. */
const ERROR_TEXT = /\bfail(s|ed|ure)?\b|\berror\b|could ?n[o']t|unavailable|unable|unreachable/i;

/** Let the page's effects run and its read's promise resolve. */
async function flush() {
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
}

describe("/data/explore (wallet): a corpus that resolved empty", () => {
    it("the read resolves empty: absence, no loading line, no error text", async () => {
        const { container } = render(<DataExplorer />);
        await flush();
        const text = container.textContent ?? "";
        expect(text).toMatch(new RegExp(`No orders for ${WALLET.slice(0, 6)}`));
        expect(text).not.toMatch(/Reading the data and projecting the graphs/);
        expect(text).not.toMatch(ERROR_TEXT);
    });
});
