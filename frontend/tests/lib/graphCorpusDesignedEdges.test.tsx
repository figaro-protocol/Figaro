/**
 * `/data/explore` shows a process's designed edges, on either path.
 *
 * A fan-out process design is loaded from the registry read: a root and two
 * entries that each follow it. A process of three commits is linked to it in
 * one of two ways, each on its own path:
 *
 *  - direct path: `FigaroCore` emits the three `OrderCommitted`, and the
 *    buyer's attestation of the provenance leaf at `AttestationCoordinator`
 *    names the process design;
 *  - batch path: `FigaroBatchVerifier` emits the three `OrderCommitted`, and
 *    `UsageCounter` emits a `UsageRecorded` of the process design naming the
 *    process (the counter emits it for a counted use on either path).
 *
 * The logs are the bytes a node returns, read through the real order reader,
 * the real corpus hook (`useGraphCorpus`) and the real page (`DataExplorer`).
 * Each case asserts the corpus's edges (the design's, matched to the commits
 * by position) and the page's line, which names them the design and never
 * what the parties signed. A process with neither link keeps the linear view
 * and carries no such line, and a failed `UsageRecorded` read links nothing.
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, renderHook, screen, waitFor } from "@testing-library/react";
import { PROVENANCE_LEAF_KEY, USAGE_KIND_CLAUSE, USAGE_KIND_PROCESS, provenanceContentRef } from "@figaro-protocol/sdk";
import { attestationLog, orderCommittedLog, word, type FixtureLog } from "./__fixtures__/coreLogs";

const { cachedGetLogsMock, usageEventsMock, CORE, COORDINATOR, VERIFIER, COUNTER, CLIENT, CHOICES, SPECS, params } = vi.hoisted(() => ({
    cachedGetLogsMock: vi.fn(),
    usageEventsMock: vi.fn(),
    CORE: "0x1111111111111111111111111111111111111111",
    COORDINATOR: "0x3333333333333333333333333333333333333333",
    VERIFIER: "0x2222222222222222222222222222222222222222",
    COUNTER: "0x4444444444444444444444444444444444444444",
    CLIENT: { chain: { id: 31337 }, readContract: async () => { throw new Error("no token"); } },
    CHOICES: { current: null as unknown },
    SPECS: { version: 0, loaded: true },
    params: { current: new URLSearchParams("view=market") },
}));

vi.mock("@/lib/core/eventCache", () => ({
    cachedGetLogs: (...args: unknown[]) => cachedGetLogsMock(...args),
    cachedGetContractEvents: (...args: unknown[]) => usageEventsMock(...args),
    cachedGetReceiptLogs: vi.fn(),
}));
vi.mock("@/lib/core/contracts", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/core/contracts")>()),
    CONTRACTS: { core: CORE, batchVerifier: VERIFIER },
    getAttestationCoordinator: () => COORDINATOR,
    getBatchVerifier: () => VERIFIER,
}));
vi.mock("@/lib/rewards/contracts", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/rewards/contracts")>()),
    getUsageCounter: () => COUNTER,
}));
vi.mock("@/lib/composability/contracts", () => ({
    getSwapRouter: () => null,
    getWitnessSwapAndCommitCoordinator: () => null,
}));
vi.mock("@/lib/core/witnessContent", () => ({ fetchWitnessContent: async () => null }));
vi.mock("@/lib/shared/publicClient", () => ({ publicClient: CLIENT }));
vi.mock("@/lib/registries/useClauseSpecs", () => ({ useClauseSpecs: () => SPECS }));
vi.mock("@/lib/registries/assemblyChoices", () => ({ useAssemblyChoices: () => CHOICES.current }));
vi.mock("@/lib/data/analystEndpoint", () => ({ getAnalystUrl: () => null, readAnalystStatus: async () => null, askAnalyst: async () => null }));
vi.mock("next/navigation", () => ({
    useSearchParams: () => params.current,
    useRouter: () => ({ push: () => undefined, replace: () => undefined }),
    usePathname: () => "/data/explore",
}));
vi.mock("wagmi", () => ({
    useAccount: () => ({ address: undefined, isConnected: false, status: "disconnected" }),
    useChainId: () => 31337,
    usePublicClient: () => CLIENT,
}));

import { useGraphCorpus, type GraphCorpus } from "@/lib/data/graphCorpus";
import { DataExplorer } from "@/components/data/DataExplorer";

const DESIGN = word(0xa55);
const AGREEMENT = word(0xa6e);
const PROCESS = word(0xf00);
const BUYER = "0x00000000000000000000000000000000000000b1" as const;
const SELLER = "0x00000000000000000000000000000000000000a1" as const;
const [ROOT, LEFT, RIGHT] = [word(0x01), word(0x02), word(0x03)];

/** The registry read answers one loaded fan-out process design: two entries follow the root. */
function fanOutLoaded() {
    CHOICES.current = {
        read: {
            status: "present" as const,
            value: [{
                processDesignHash: DESIGN, name: "Fan-out", state: "loaded",
                hydratedAssembly: {
                    assembly: {
                        agreements: [
                            { id: "left", agreementHash: AGREEMENT, clauses: {}, follows: ["root"] },
                            { id: "root", agreementHash: AGREEMENT, clauses: {}, follows: [] },
                            { id: "right", agreementHash: AGREEMENT, clauses: {}, follows: ["root"] },
                        ],
                    },
                    agreements: { [AGREEMENT]: { clauses: {} } },
                },
            }],
        },
        refetch: () => undefined,
    };
}

/** The three commits of the process at `address`, the running total rising 10, 30, 60. */
function commits(address: string, block: (i: number) => bigint): FixtureLog[] {
    return [ROOT, LEFT, RIGHT].map((orderHash, i) => orderCommittedLog({
        address, blockNumber: block(i), orderHash, processId: PROCESS, buyer: BUYER, seller: SELLER,
        payment: BigInt(10 * (i + 1)), runningTotal: [10n, 30n, 60n][i],
    }));
}

const provenance = attestationLog({
    address: COORDINATOR, blockNumber: 5n, orderHash: ROOT, processId: PROCESS, attester: BUYER,
    clauseId: PROVENANCE_LEAF_KEY, contentRef: provenanceContentRef(AGREEMENT, DESIGN),
});

/** Each address answers its own logs by event name; every other read answers nothing. */
function chainAnswers(logs: { at: string; event: string; rows: FixtureLog[] }[]) {
    cachedGetLogsMock.mockImplementation(async (_c: unknown, _id: number, opts: { address: string; eventName: string }) =>
        logs.filter((l) => l.at === opts.address.toLowerCase() && l.event === opts.eventName).flatMap((l) => l.rows));
}

async function readCorpus(): Promise<GraphCorpus> {
    const { result } = renderHook(() => useGraphCorpus());
    await waitFor(() => expect(result.current.status).toBe("present"));
    if (result.current.status !== "present") throw new Error("corpus not present");
    return result.current.value;
}

const designedEdges = new Map([[ROOT, []], [LEFT, [ROOT]], [RIGHT, [ROOT]]]);

describe("/data/explore — a process's designed edges, direct path, linked by the provenance attestation", () => {
    beforeEach(() => {
        fanOutLoaded();
        usageEventsMock.mockReset().mockResolvedValue([]);
        chainAnswers([
            { at: CORE, event: "OrderCommitted", rows: commits(CORE, (i) => BigInt(2 + i)) },
            { at: COORDINATOR, event: "Attestation", rows: [provenance] },
        ]);
    });

    it("the corpus takes the process design's edges, matched to the commits by position", async () => {
        const corpus = await readCorpus();
        const edges = corpus.edgesByProcess.get(PROCESS.toLowerCase())!;
        expect(edges.source).toBe("design");
        expect(edges.processDesignHash).toBe(DESIGN);
        expect(new Map(edges.follows)).toEqual(designedEdges);
        // The market's shape is the design's: two orders beside each other under the root.
        expect(corpus.market.groups.get(DESIGN.toLowerCase())!.shapes).toEqual([{ orderCount: 3, depth: 1, maxWidth: 2, processCount: 1 }]);
    });

    it("the page labels them as the design, never as what the parties signed", async () => {
        params.current = new URLSearchParams("view=market");
        render(<DataExplorer />);
        const line = await screen.findByTestId(`process-designed-edges-${PROCESS.toLowerCase()}`);
        expect(line.textContent).toMatch(/The design.s edges, not what the parties signed/);
        expect(line.textContent).toContain("order 2 follows order 1; order 3 follows order 1");
        expect(line.textContent).toContain("Fan-out");
        expect(document.body.textContent).toContain("1× 3 orders, depth 1, width 2");
    });
});

describe("/data/explore — a process's designed edges, batch path, linked by UsageRecorded", () => {
    beforeEach(() => {
        fanOutLoaded();
        // The verifier lands all three commits in one block; no provenance attestation is read.
        chainAnswers([{ at: VERIFIER, event: "OrderCommitted", rows: commits(VERIFIER, () => 9n) }]);
        usageEventsMock.mockReset().mockImplementation(async (_c: unknown, _id: number, opts: { address: string; eventName: string }) =>
            opts.address === COUNTER && opts.eventName === "UsageRecorded"
                ? [{ args: { kind: USAGE_KIND_PROCESS, clauseOrProcess: DESIGN, period: 0, processId: PROCESS } }]
                : []);
    });

    it("the corpus takes the process design's edges from the counted use alone", async () => {
        const corpus = await readCorpus();
        expect(corpus.attributionByProcess.size).toBe(0);
        const edges = corpus.edgesByProcess.get(PROCESS.toLowerCase())!;
        expect(edges.source).toBe("design");
        expect(new Map(edges.follows)).toEqual(designedEdges);
    });

    it("the page shows the design's line under the unattributed process", async () => {
        params.current = new URLSearchParams("view=market");
        render(<DataExplorer />);
        const line = await screen.findByTestId(`process-designed-edges-${PROCESS.toLowerCase()}`);
        expect(line.textContent).toContain("order 2 follows order 1; order 3 follows order 1");
    });

    it("a use of a clause, not of a process design, links nothing: the linear view", async () => {
        usageEventsMock.mockResolvedValue([{ args: { kind: USAGE_KIND_CLAUSE, clauseOrProcess: DESIGN, period: 0, processId: PROCESS } }]);
        const corpus = await readCorpus();
        expect(corpus.edgesByProcess.get(PROCESS.toLowerCase())!.source).toBe("linear");
    });

    it("a failed UsageRecorded read links nothing, and the corpus still lands", async () => {
        vi.spyOn(console, "warn").mockImplementation(() => undefined);
        usageEventsMock.mockRejectedValue(new Error("fetch failed"));
        const corpus = await readCorpus();
        const edges = corpus.edgesByProcess.get(PROCESS.toLowerCase())!;
        expect(edges.source).toBe("linear");
        expect(new Map(edges.follows)).toEqual(new Map([[ROOT, []], [LEFT, [ROOT]], [RIGHT, [LEFT]]]));
    });
});

describe("/data/explore — a process with no link keeps the linear view", () => {
    beforeEach(() => {
        fanOutLoaded();
        usageEventsMock.mockReset().mockResolvedValue([]);
        chainAnswers([{ at: CORE, event: "OrderCommitted", rows: commits(CORE, (i) => BigInt(2 + i)) }]);
    });

    it("no design line on the page, and the shape is FigaroCore's chain", async () => {
        const corpus = await readCorpus();
        expect(corpus.edgesByProcess.get(PROCESS.toLowerCase())!.source).toBe("linear");
        params.current = new URLSearchParams("view=market");
        render(<DataExplorer />);
        await screen.findByTestId(`process-row-${PROCESS.toLowerCase()}`);
        expect(screen.queryByTestId(`process-designed-edges-${PROCESS.toLowerCase()}`)).toBeNull();
    });
});
