/**
 * The attestation readers fold BOTH paths. The coordinator (direct path) and
 * the batch verifier (batch path) emit one `Attestation` topic, so the emitting
 * address is the only thing that separates them; a reader that asked the
 * coordinator alone would miss every batched attestation. Each row keeps the
 * path that emitted it (a direct one can be re-checked from calldata, a batched
 * one was proved inside the batch).
 *
 * Proves: the by-order reader (audit page clause evidence, evidence file), the
 * by-process reader (order page) and the handoff anchor check read an
 * `Attestation` emitted by the verifier alone.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { attestationLog, word } from "./__fixtures__/coreLogs";

const { cachedGetLogsMock, COORD, VERIFIER, state } = vi.hoisted(() => ({
    cachedGetLogsMock: vi.fn(),
    COORD: "0x1111111111111111111111111111111111111111",
    VERIFIER: "0x2222222222222222222222222222222222222222",
    state: { verifier: "0x2222222222222222222222222222222222222222" as string | null },
}));

vi.mock("@/lib/kernel/eventCache", () => ({
    cachedGetLogs: (...args: unknown[]) => cachedGetLogsMock(...args),
}));
vi.mock("@/lib/composition/contracts", () => ({
    getAttestationCoordinator: () => COORD,
    getBatchVerifier: () => state.verifier,
}));
vi.mock("@/lib/kernel/contracts", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/kernel/contracts")>()),
    CONTRACTS: { core: "0x3333333333333333333333333333333333333333", batchVerifier: VERIFIER },
}));
vi.mock("@/lib/protocol/membersRegistryIndexer", () => ({ getAllMemberRegistered: async () => [] }));

import { getAttestationsByOrder, getAttestationsByProcess } from "@/lib/composition/indexer";
import { attestationAnchorMatches } from "@/lib/handoff/handoffAnchorState";

const CLIENT = {} as never;
const ORDER = word(0x0d);
const PROCESS = word(0xab);
const OTHER_PROCESS = word(0xac);
const CLAUSE = word(0xc1a);
const ATTESTER = "0x00000000000000000000000000000000000000a1" as const;
const DIRECT_REF = word(0xd1);
const BATCH_REF = word(0xba);

const direct = attestationLog({ address: COORD, blockNumber: 7n, orderHash: ORDER, processId: PROCESS, attester: ATTESTER, clauseId: CLAUSE, contentRef: DIRECT_REF });
const batched = attestationLog({ address: VERIFIER, blockNumber: 5n, orderHash: ORDER, processId: PROCESS, attester: ATTESTER, clauseId: CLAUSE, stage: 2, contentRef: BATCH_REF });
const elsewhere = attestationLog({ address: VERIFIER, blockNumber: 6n, orderHash: word(0x99), processId: OTHER_PROCESS, attester: ATTESTER, clauseId: CLAUSE, contentRef: word(0xee) });

describe("the attestation readers fold both paths", () => {
    beforeEach(() => {
        state.verifier = VERIFIER;
        cachedGetLogsMock.mockReset();
        cachedGetLogsMock.mockImplementation(async (_c: unknown, _id: number, opts: { address: string }) =>
            opts.address === COORD ? [direct] : [batched, elsewhere],
        );
    });

    it("getAttestationsByOrder returns the direct row and the batched row, each tagged with its path, in chain order", async () => {
        const rows = await getAttestationsByOrder(CLIENT, 31337, ORDER);
        expect(rows.map((r) => [r.universe, r.contentRef, r.stage])).toEqual([
            ["batch", BATCH_REF, 2],
            ["direct", DIRECT_REF, 0],
        ]);
    });

    it("getAttestationsByProcess returns the batched row beside the direct one, tagged, and leaves another process out", async () => {
        const rows = await getAttestationsByProcess(CLIENT, 31337, PROCESS);
        expect(rows.map((r) => [r.universe, r.contentRef])).toEqual([
            ["batch", BATCH_REF],
            ["direct", DIRECT_REF],
        ]);
    });

    it("attestationAnchorMatches finds an anchor that only the batch verifier emitted", async () => {
        expect(await attestationAnchorMatches(CLIENT, 31337, ORDER, BATCH_REF)).toBe(true);
        expect(await attestationAnchorMatches(CLIENT, 31337, ORDER, word(0x404))).toBe(false);
    });

    it("with no verifier configured the readers read the coordinator alone", async () => {
        state.verifier = null;
        const rows = await getAttestationsByOrder(CLIENT, 31337, ORDER);
        expect(rows.map((r) => r.universe)).toEqual(["direct"]);
        expect(await attestationAnchorMatches(CLIENT, 31337, ORDER, BATCH_REF)).toBe(false);
    });
});
