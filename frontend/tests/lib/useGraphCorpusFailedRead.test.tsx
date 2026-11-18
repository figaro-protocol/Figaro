/**
 * useGraphCorpus over its reads' failed and resolved-empty answers
 * (docs/OPEN_WORLD.md § 1 "No fallbacks — absence is the representation").
 *
 * - A failed clause-registry read makes the corpus absent, not pending for
 *   ever: a surface renders nothing for it instead of a loading state for a
 *   read that is not in flight.
 * - Each sub-read of a pass resolving empty — the process registry (no
 *   assembly), an attestation's content (not recovered), a commit receipt (no
 *   funding leg), a token's symbol (an empty string) — leaves the corpus
 *   present, and every layer of `/data/explore` shows no loading line, no
 *   error text and no stand-in value in the place of what came back empty.
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import { orderCommittedLog, orderResolvedLog, word, type FixtureLog } from "./__fixtures__/coreLogs";

const m = vi.hoisted(() => ({
    SPECS: { version: 0, loaded: false, failed: true },
    NO_ASSEMBLIES: { read: { status: "present" as const, value: [] }, refetch: () => undefined },
    CORE: "0x1111111111111111111111111111111111111111",
    VENUE: "0x3333333333333333333333333333333333333333",
    COORDINATOR: "0x4444444444444444444444444444444444444444",
    logs: {} as Record<string, unknown[]>,
    attestations: [] as unknown[],
    view: "market",
    // The token answers: an empty symbol, and its decimals.
    CLIENT: {
        chain: { id: 31337 },
        readContract: async ({ functionName }: { functionName: string }) => (functionName === "symbol" ? "" : 18),
    },
}));
vi.mock("wagmi", () => ({
    useChainId: () => 31337,
    usePublicClient: () => ({ chain: { id: 31337 } }),
    useAccount: () => ({ address: undefined, isConnected: false }),
    useWatchContractEvent: () => undefined,
}));
vi.mock("@/lib/protocol/useClauseSpecs", () => ({ useClauseSpecs: () => m.SPECS }));
vi.mock("@/lib/protocol/assemblyChoices", () => ({ useAssemblyChoices: () => m.NO_ASSEMBLIES }));
vi.mock("@/lib/core/eventCache", () => ({
    cachedGetLogs: async (_c: unknown, _id: number, opts: { address: string; eventName: string }) =>
        opts.address === m.CORE ? (m.logs[opts.eventName] ?? []) : [],
    // Every commit receipt answers, carrying no venue transfer: no funding leg.
    cachedGetReceiptLogs: async () => [],
}));
vi.mock("@/lib/core/contracts", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/core/contracts")>()),
    CONTRACTS: { core: m.CORE },
}));
vi.mock("@/lib/shared/publicClient", () => ({ publicClient: m.CLIENT }));
vi.mock("@/lib/composition/indexer", () => ({ getAllAttestationRecords: async () => m.attestations }));
// No attestation's content is recovered.
vi.mock("@/lib/composition/witnessContent", () => ({ fetchWitnessContent: async () => null }));
vi.mock("@/lib/composition/contracts", () => ({
    getSwapRouter: () => m.VENUE,
    getWitnessSwapAndCommitCoordinator: () => m.COORDINATOR,
}));
vi.mock("next/navigation", () => ({
    usePathname: () => "/data/explore",
    useRouter: () => ({ replace: () => undefined, push: () => undefined }),
    useSearchParams: () => new URLSearchParams({ view: m.view, wallet: "0x00000000000000000000000000000000000000b1" }),
}));
vi.mock("@/hooks/useMounted", () => ({ useMounted: () => true }));
vi.mock("@/lib/data/analystEndpoint", () => ({ getAnalystUrl: () => null, readAnalystStatus: async () => null, askAnalyst: async () => null }));

import { useGraphCorpus } from "@/lib/data/graphCorpus";
import { DataExplorer } from "@/components/data/DataExplorer";
import { venuePosture } from "@/lib/data/explorer";

/** Words a page may not show in a read's place when the read failed or came back empty. */
const ERROR_TEXT = /\bfail(s|ed|ure)?\b|\berror\b|could ?n[o']t|unavailable|unable|unreachable/i;
/** What a value with nothing behind it prints as. */
const STAND_IN = /\bundefined\b|\bnull\b|\bNaN\b/;

describe("useGraphCorpus — a failed clause-spec read", () => {
    it("reads as absent, never as pending", async () => {
        m.SPECS = { version: 0, loaded: false, failed: true };
        const { result } = renderHook(() => useGraphCorpus());
        await waitFor(() => expect(result.current.status).toBe("absent"));
    });
});

describe("/data/explore — each sub-read of the corpus resolved empty", () => {
    const PROCESS = word(0xe1);
    const ORDER = word(0xe2);
    const BUYER = "0x00000000000000000000000000000000000000b1" as const;
    const SELLER = "0x00000000000000000000000000000000000000a1" as const;

    beforeEach(() => {
        m.SPECS = { version: 0, loaded: true, failed: false };
        m.logs = {
            OrderCommitted: [orderCommittedLog({ address: m.CORE, blockNumber: 4n, orderHash: ORDER, processId: PROCESS, buyer: BUYER, seller: SELLER, payment: 7n })],
            OrderResolved: [orderResolvedLog({ address: m.CORE, blockNumber: 9n, orderHash: ORDER, processId: PROCESS, sellerPayout: 21n, buyerPayout: 7n })],
        } as Record<string, FixtureLog[]>;
        // One attestation, under a clause no spec here describes.
        m.attestations = [{
            orderHash: ORDER, processId: PROCESS, attester: SELLER, clauseId: word(0xc1a5), stage: 1,
            contentRef: word(0xfeed), transactionHash: word(0xa001), blockNumber: 6,
        }];
    });

    it("the corpus is present and states each empty answer as the chain gave it", async () => {
        const { result } = renderHook(() => useGraphCorpus());
        await waitFor(() => expect(result.current.status).toBe("present"));
        if (result.current.status !== "present") return;
        const corpus = result.current.value;
        expect(corpus.substance).toEqual({ attempted: 1, recovered: 0, total: 1 });
        expect(venuePosture(corpus.venue, corpus.valueFlow.edges)).toEqual({ state: "no-legs", venue: m.VENUE });
        expect(corpus.market.unattributedProcessCount).toBe(1);
        expect([...corpus.tokenMeta.values()]).toEqual([{ symbol: "", decimals: 18 }]);
    });

    it.each(["market", "overlays", "value-flow", "wallet"])("the %s layer: no loading line, no error text, no stand-in value", async (view) => {
        m.view = view;
        const { container } = render(<DataExplorer />);
        await waitFor(() => expect(screen.queryByText(/Reading the data and projecting the graphs/)).toBeNull());
        await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
        const text = container.textContent ?? "";
        expect(text.length).toBeGreaterThan(0);
        expect(text).not.toMatch(ERROR_TEXT);
        expect(text).not.toMatch(STAND_IN);
    });
});
