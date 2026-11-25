/**
 * `/data/explore` names no edge between orders, and shows a linked process
 * design's own edges between its entries, on either path.
 *
 * A process design is loaded from the registry read: r; a follows r; b follows
 * r; c follows a. A process of four commits lands R, A, C, B: C's seller
 * accepted before B's, which FigaroCore allows, since it fixes no order among
 * sibling orders. Matching commits to the design by position would state
 * "C follows R" and "B follows A", both false. The process is linked to the
 * design in one of two ways, each on its own path:
 *
 *  - direct path: `FigaroCore` emits the four `OrderCommitted`, and the
 *    buyer's attestation of the provenance leaf at `AttestationCoordinator`
 *    names the process design;
 *  - batch path: `FigaroBatchVerifier` emits the four `OrderCommitted`, and
 *    `UsageCounter` emits a `UsageRecorded` of the process design naming the
 *    process (the counter emits it for a counted use on either path).
 *
 * The logs are the bytes a node returns, read through the real order reader,
 * the real corpus hook (`useGraphCorpus`) and the real page (`DataExplorer`).
 * The page holds no agreement, so no order's edges are known: the market
 * counts the process as unshaped, and the page's line names the design's
 * entries and never an order. A process with neither link carries no such
 * line, and a failed `UsageRecorded` read links nothing.
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
vi.mock("@/lib/core/contracts", async (importOriginal) =>
    (await import("../support/contractsMock")).contractsMock(await importOriginal<typeof import("@/lib/core/contracts")>(), { contracts: { core: CORE, batchVerifier: VERIFIER }, coordinator: () => COORDINATOR, batchVerifier: () => VERIFIER }));
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
vi.mock("wagmi", async () => (await import("../support/wagmiMock")).wagmiMock({ client: () => CLIENT }));

import { useGraphCorpus, type GraphCorpus } from "@/lib/data/graphCorpus";
import { DataExplorer } from "@/components/data/DataExplorer";

const DESIGN = word(0xa55);
const AGREEMENT = word(0xa6e);
const PROCESS = word(0xf00);
const BUYER = "0x00000000000000000000000000000000000000b1" as const;
const SELLER = "0x00000000000000000000000000000000000000a1" as const;
const [R, A, B, C] = [word(0x01), word(0x02), word(0x03), word(0x04)];

/** The registry read answers one loaded process design: r; a follows r; b follows r; c follows a. */
function designLoaded() {
    CHOICES.current = {
        read: {
            status: "present" as const,
            value: [{
                processDesignHash: DESIGN, name: "Fan-out", state: "loaded",
                hydratedAssembly: {
                    assembly: {
                        agreements: [
                            { id: "a", agreementHash: AGREEMENT, clauses: {}, follows: ["r"] },
                            { id: "r", agreementHash: AGREEMENT, clauses: {}, follows: [] },
                            { id: "b", agreementHash: AGREEMENT, clauses: {}, follows: ["r"] },
                            { id: "c", agreementHash: AGREEMENT, clauses: {}, follows: ["a"] },
                        ],
                    },
                    agreements: { [AGREEMENT]: { clauses: {} } },
                },
            }],
        },
        refetch: () => undefined,
    };
}

/** The four commits of the process at `address`, landing R, A, C, B: the
 *  running total rises 10, 30, 60, 100. */
function commits(address: string, block: (i: number) => bigint): FixtureLog[] {
    return [R, A, C, B].map((orderHash, i) => orderCommittedLog({
        address, blockNumber: block(i), orderHash, processId: PROCESS, buyer: BUYER, seller: SELLER,
        payment: BigInt(10 * (i + 1)), runningTotal: [10n, 30n, 60n, 100n][i],
    }));
}

const provenance = attestationLog({
    address: COORDINATOR, blockNumber: 5n, orderHash: R, processId: PROCESS, attester: BUYER,
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

const designEntries = [
    { id: "a", follows: ["r"] },
    { id: "r", follows: [] },
    { id: "b", follows: ["r"] },
    { id: "c", follows: ["a"] },
];

/** The line names the design's entries, and never an order. */
async function designLine(): Promise<string> {
    params.current = new URLSearchParams("view=market");
    render(<DataExplorer />);
    const line = await screen.findByTestId(`process-designed-edges-${PROCESS.toLowerCase()}`);
    const text = line.textContent ?? "";
    expect(text).toContain("“a” follows “r”; “b” follows “r”; “c” follows “a”");
    expect(text).toContain("no entry is matched to an order");
    expect(text).not.toMatch(/order \d/);
    return text;
}

describe("/data/explore — siblings committed out of the design's order, direct path, linked by the provenance attestation", () => {
    beforeEach(() => {
        designLoaded();
        usageEventsMock.mockReset().mockResolvedValue([]);
        chainAnswers([
            { at: CORE, event: "OrderCommitted", rows: commits(CORE, (i) => BigInt(2 + i)) },
            { at: COORDINATOR, event: "Attestation", rows: [provenance] },
        ]);
    });

    it("the corpus carries the design's own edges and states no edge between orders", async () => {
        const corpus = await readCorpus();
        expect(corpus.designByProcess.get(PROCESS.toLowerCase())).toEqual({ processDesignHash: DESIGN, entries: designEntries });
        // No agreement is held, so no order's edges are known: the process takes no shape.
        const group = corpus.market.groups.get(DESIGN.toLowerCase())!;
        expect(group.shapes).toEqual([]);
        expect(group.unshapedProcessCount).toBe(1);
    });

    it("the page names the design's entries, never an order, and shows no depth or width", async () => {
        const text = await designLine();
        expect(text).toContain("Fan-out");
        expect(document.body.textContent).not.toMatch(/depth \d/);
    });
});

describe("/data/explore — siblings committed out of the design's order, batch path, linked by UsageRecorded", () => {
    beforeEach(() => {
        designLoaded();
        // The verifier lands all four commits in one block; no provenance attestation is read.
        chainAnswers([{ at: VERIFIER, event: "OrderCommitted", rows: commits(VERIFIER, () => 9n) }]);
        usageEventsMock.mockReset().mockImplementation(async (_c: unknown, _id: number, opts: { address: string; eventName: string }) =>
            opts.address === COUNTER && opts.eventName === "UsageRecorded"
                ? [{ args: { kind: USAGE_KIND_PROCESS, clauseOrProcess: DESIGN, period: 0, processId: PROCESS } }]
                : []);
    });

    it("the corpus links the design from the counted use alone", async () => {
        const corpus = await readCorpus();
        // The counter's record attributes the process (the SDK's
        // `attributeProcessDesigns`), with no attestation read.
        expect([...corpus.attributionByProcess]).toEqual([[PROCESS.toLowerCase(), DESIGN.toLowerCase()]]);
        expect(corpus.designByProcess.get(PROCESS.toLowerCase())).toEqual({ processDesignHash: DESIGN, entries: designEntries });
    });

    it("the page shows the design's line under the unattributed process, naming no order", async () => {
        await designLine();
    });

    it("a use of a clause, not of a process design, links nothing", async () => {
        usageEventsMock.mockResolvedValue([{ args: { kind: USAGE_KIND_CLAUSE, clauseOrProcess: DESIGN, period: 0, processId: PROCESS } }]);
        const corpus = await readCorpus();
        expect(corpus.designByProcess.has(PROCESS.toLowerCase())).toBe(false);
    });

    it("a failed UsageRecorded read links nothing, and the corpus still lands", async () => {
        vi.spyOn(console, "warn").mockImplementation(() => undefined);
        usageEventsMock.mockRejectedValue(new Error("fetch failed"));
        const corpus = await readCorpus();
        expect(corpus.designByProcess.has(PROCESS.toLowerCase())).toBe(false);
        expect(corpus.process.processes.get(PROCESS)?.orders.size).toBe(4);
    });
});

describe("/data/explore — a process with no link", () => {
    beforeEach(() => {
        designLoaded();
        usageEventsMock.mockReset().mockResolvedValue([]);
        chainAnswers([{ at: CORE, event: "OrderCommitted", rows: commits(CORE, (i) => BigInt(2 + i)) }]);
    });

    it("carries no design line, and the page names no edge between its orders", async () => {
        const corpus = await readCorpus();
        expect(corpus.designByProcess.size).toBe(0);
        params.current = new URLSearchParams("view=market");
        render(<DataExplorer />);
        await screen.findByTestId(`process-row-${PROCESS.toLowerCase()}`);
        expect(screen.queryByTestId(`process-designed-edges-${PROCESS.toLowerCase()}`)).toBeNull();
        expect(document.body.textContent).not.toMatch(/order \d follows/);
    });
});

/**
 * Attribution is the SDK's `attributeProcessDesigns`. Two attestations of the
 * provenance leaf that name two loaded designs leave the process contested:
 * a later one never moves it to another design, and the page shows it as
 * unattributed with no design in its place. The counter's record wins over
 * any attestation.
 */
describe("/data/explore — attribution: contested and counted", () => {
    const OTHER = word(0xb55);
    const otherProvenance = attestationLog({
        address: COORDINATOR, blockNumber: 7n, orderHash: A, processId: PROCESS, attester: SELLER,
        clauseId: PROVENANCE_LEAF_KEY, contentRef: provenanceContentRef(AGREEMENT, OTHER),
    });
    beforeEach(() => {
        designLoaded();
        const current = CHOICES.current as { read: { value: { processDesignHash: string; name: string }[] } };
        const [design] = current.read.value;
        current.read.value = [design, { ...design, processDesignHash: OTHER, name: "Other" }];
        usageEventsMock.mockReset().mockResolvedValue([]);
        chainAnswers([
            { at: CORE, event: "OrderCommitted", rows: commits(CORE, (i) => BigInt(2 + i)) },
            { at: COORDINATOR, event: "Attestation", rows: [provenance, otherProvenance] },
        ]);
    });

    it("two attestations naming two designs leave the process contested and unattributed", async () => {
        const corpus = await readCorpus();
        expect(corpus.attributionByProcess.has(PROCESS.toLowerCase())).toBe(false);
        expect([...corpus.contestedProcesses]).toEqual([PROCESS.toLowerCase()]);
        expect(corpus.market.unattributedProcessCount).toBe(1);
        expect(corpus.designByProcess.has(PROCESS.toLowerCase())).toBe(false);
    });

    it("the page lists the contested process as unattributed, with no design line", async () => {
        params.current = new URLSearchParams("view=market");
        render(<DataExplorer />);
        expect((await screen.findByTestId("market-contested")).textContent).toContain("1 of the unattributed process is contested");
        expect(screen.getByTestId("market-processes-unattributed")).toBeTruthy();
        expect(screen.getByTestId(`process-row-${PROCESS.toLowerCase()}`)).toBeTruthy();
        expect(screen.queryByTestId(`process-designed-edges-${PROCESS.toLowerCase()}`)).toBeNull();
    });

    it("the counter's record wins over the attestations", async () => {
        usageEventsMock.mockImplementation(async (_c: unknown, _id: number, opts: { address: string; eventName: string }) =>
            opts.address === COUNTER && opts.eventName === "UsageRecorded"
                ? [{ args: { kind: USAGE_KIND_PROCESS, clauseOrProcess: OTHER, period: 0, processId: PROCESS } }]
                : []);
        const corpus = await readCorpus();
        expect(corpus.attributionByProcess.get(PROCESS.toLowerCase())).toBe(OTHER.toLowerCase());
        expect(corpus.contestedProcesses.size).toBe(0);
    });
});
