/**
 * The `/data/explore` page counts attestations from both paths.
 * `AttestationCoordinator` emits `Attestation` for a direct attestation, and
 * `FigaroBatchVerifier` emits the same event for an attestation proved in a
 * batch (src/core/verifier/FigaroBatchVerifier.sol). The two share one topic
 * hash, so the emitting address is the only thing that tells them apart.
 *
 * The logs here are the bytes a node returns, read through the real
 * attestation reader (`getAllAttestationRecords`), the real corpus hook
 * (`useGraphCorpus`) and the real page (`DataExplorer`), on its attestation
 * layer. Three cases: logs at the verifier's address only, at the
 * coordinator's only, then at both. Each case asserts the count each place of
 * the page shows: the corpus line above every layer ("N attestations across M
 * clause families"), and the overlay layer's count and its row ("N
 * attestations · … · direct + batch resolutions").
 *
 * Follows `graphCorpusBatchPath.test.tsx`, which holds the order events.
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import { attestationLog, word, type FixtureLog } from "./__fixtures__/coreLogs";
import { CONNECT_PROMPT } from "./__fixtures__/noWallet";

const { cachedGetLogsMock, CORE, COORDINATOR, VERIFIER, CLIENT, NO_ASSEMBLIES, SPECS, params } = vi.hoisted(() => ({
    cachedGetLogsMock: vi.fn(),
    CORE: "0x1111111111111111111111111111111111111111",
    COORDINATOR: "0x3333333333333333333333333333333333333333",
    VERIFIER: "0x2222222222222222222222222222222222222222",
    CLIENT: { chain: { id: 31337 }, readContract: async () => { throw new Error("no token"); } },
    NO_ASSEMBLIES: { read: { status: "present" as const, value: [] }, refetch: () => undefined },
    SPECS: { version: 0, loaded: true },
    params: { current: new URLSearchParams("view=overlays") },
}));

vi.mock("@/lib/core/eventCache", () => ({
    cachedGetLogs: (...args: unknown[]) => cachedGetLogsMock(...args),
    cachedGetReceiptLogs: vi.fn(),
}));
vi.mock("@/lib/core/contracts", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/core/contracts")>()),
    CONTRACTS: { core: CORE, batchVerifier: VERIFIER },
}));
vi.mock("@/lib/composition/contracts", () => ({
    getAttestationCoordinator: () => COORDINATOR,
    getBatchVerifier: () => VERIFIER,
    getSwapRouter: () => null,
    getWitnessSwapAndCommitCoordinator: () => null,
}));
// The gateway serves no content: every row stays a fingerprint, and the count
// is the count of events.
vi.mock("@/lib/composition/witnessContent", () => ({ fetchWitnessContent: async () => null }));
vi.mock("@/lib/shared/wagmi", () => ({ publicClient: CLIENT, activeChain: { id: 31337 } }));
vi.mock("@/lib/protocol/useClauseSpecs", () => ({ useClauseSpecs: () => SPECS }));
vi.mock("@/lib/protocol/assemblyChoices", () => ({ useAssemblyChoices: () => NO_ASSEMBLIES }));
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
import { overlayRows } from "@/lib/data/explorer";
import { DataExplorer } from "@/components/data/DataExplorer";

const PROCESS = word(0xa7);
const CLAUSE = word(0xc1a);
const ATTESTER = "0x00000000000000000000000000000000000000a1" as const;

const direct = attestationLog({ address: COORDINATOR, blockNumber: 6n, orderHash: word(0x0d1), processId: PROCESS, attester: ATTESTER, clauseId: CLAUSE, contentRef: word(0xd1) });
const batched = attestationLog({ address: VERIFIER, blockNumber: 8n, orderHash: word(0x0b1), processId: PROCESS, attester: ATTESTER, clauseId: CLAUSE, stage: 1, contentRef: word(0xba) });

/** Each address answers its own `Attestation` logs; every other read answers nothing. */
function emitters(byAddress: Readonly<Record<string, readonly FixtureLog[]>>) {
    cachedGetLogsMock.mockImplementation(async (_c: unknown, _id: number, opts: { address: string; eventName: string }) =>
        opts.eventName === "Attestation" ? (byAddress[opts.address.toLowerCase()] ?? []) : [],
    );
}

async function readCorpus(): Promise<GraphCorpus> {
    const { result } = renderHook(() => useGraphCorpus());
    await waitFor(() => expect(result.current.status).toBe("present"));
    if (result.current.status !== "present") throw new Error("corpus not present");
    return result.current.value;
}

/** The attestation layer as the page draws it: the corpus line, the layer's count, the family's row. */
async function renderAttestationLayer() {
    params.current = new URLSearchParams("view=overlays");
    render(<DataExplorer />);
    await waitFor(() => expect(screen.getByTestId("corpus-line")).toBeTruthy());
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    return {
        corpusLine: screen.getByTestId("corpus-line").textContent ?? "",
        overlayCount: screen.getByTestId("overlay-count").textContent ?? "",
        row: screen.queryByTestId(`overlay-row-${CLAUSE}`)?.textContent ?? null,
    };
}

const CASES = [
    {
        name: "logs at the verifier's address only",
        logs: { [VERIFIER]: [batched] },
        count: 1,
        universes: ["batch"],
        line: /1 attestation across 1 clause family/,
        rowText: /1 attestation · 1 process · 1 attester · batch resolution\b/,
    },
    {
        name: "logs at the coordinator's address only",
        logs: { [COORDINATOR]: [direct] },
        count: 1,
        universes: ["direct"],
        line: /1 attestation across 1 clause family/,
        rowText: /1 attestation · 1 process · 1 attester · direct resolution\b/,
    },
    {
        name: "logs at both addresses",
        logs: { [COORDINATOR]: [direct], [VERIFIER]: [batched] },
        count: 2,
        universes: ["direct", "batch"],
        line: /2 attestations across 1 clause family/,
        rowText: /2 attestations · 1 process · 1 attester · direct \+ batch resolutions/,
    },
] as const;

describe("/data/explore counts attestations from FigaroBatchVerifier and AttestationCoordinator", () => {
    beforeEach(() => {
        cachedGetLogsMock.mockReset();
    });

    it.each(CASES)("$name — the corpus counts each event once, tagged with its path", async ({ logs, count, universes }) => {
        emitters(logs);
        const corpus = await readCorpus();
        expect(corpus.substance.total).toBe(count);
        const rows = overlayRows(corpus.overlays);
        expect(rows.map((r) => [r.clauseKey, r.entryCount])).toEqual([[CLAUSE, count]]);
        expect([...rows[0].universes].sort()).toEqual([...universes].sort());
    });

    it.each(CASES)("$name — the page's corpus line and attestation layer show the count", async ({ logs, line, rowText }) => {
        emitters(logs);
        const shown = await renderAttestationLayer();
        expect(shown.corpusLine).toMatch(line);
        expect(shown.overlayCount).toMatch(/^1 overlay in this corpus\.$/);
        expect(shown.row).toMatch(rowText);
        // No wallet is connected here: the counts are read and shown without one.
        expect(document.body.textContent ?? "").not.toMatch(CONNECT_PROMPT);
    });
});
