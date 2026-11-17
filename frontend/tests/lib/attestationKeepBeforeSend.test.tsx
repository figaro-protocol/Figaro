/**
 * Every filing goes through `useAttestationCoordinatorActions.submitAttestation`:
 * the capability executors and the ceremony panels (the content delivery's
 * stage-1 completion evidence among them). A private set's content is kept
 * there before anything is sent, so no filing path can send content no one
 * holds. A browser that refuses the write sends nothing.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { keccak256, type Hex } from "viem";
import { prepareAttestationContent } from "@figaro-protocol/sdk/agent";
import { encodeContentFromSpec } from "@figaro-protocol/sdk/clauses";

const ORDER = `0x${"0d".repeat(32)}` as Hex;

const w = vi.hoisted(() => ({
    clauseKeys: [] as string[],
    keptAtWrite: [] as Array<string | null>,
    write: vi.fn(),
}));

vi.mock("wagmi", () => ({
    useAccount: () => ({ address: "0x2222222222222222222222222222222222222222", isConnected: true }),
    usePublicClient: () => ({ chain: { id: 31337 } }),
    useWriteContract: () => ({ writeContractAsync: w.write, data: undefined, isPending: false }),
    useWaitForTransactionReceipt: () => ({ isLoading: false, isSuccess: false }),
}));
vi.mock("@/lib/composition/contracts", () => ({
    getAttestationCoordinator: () => "0x00000000000000000000000000000000000a7701",
}));
vi.mock("@/lib/core/indexer", () => ({
    getAllOrderCommitted: async () => [{ args: { orderHash: `0x${"0d".repeat(32)}`, checkoutHash: `0x${"cc".repeat(32)}` } }],
    getStringArg: (log: { args: Record<string, unknown> }, key: string) => String(log.args[key]),
}));
vi.mock("@/lib/core/signedCommitment", () => ({ restoreSignedProcessId: (c: unknown) => c }));
vi.mock("@/lib/core/agreementFetch", () => ({
    fetchAgreement: async () => ({
        status: "present",
        value: {
            version: "a1",
            buyer: "0x1111111111111111111111111111111111111111",
            seller: "0x2222222222222222222222222222222222222222",
            clauses: w.clauseKeys.map((clause) => ({ clause, data: { note: "committed" } })),
        },
    }),
}));
vi.mock("@/lib/composition/witnessContent", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/composition/witnessContent")>()),
    publishWitnessContent: async () => undefined,
}));
// The write: note what this browser held at the moment of sending.
vi.mock("@/lib/shared/contractWrite", () => ({
    simulateWriteVerify: async ({ args }: { args: unknown[] }) => {
        const [, clauseId, stage, , , contentRef] = args as [unknown, Hex, number, unknown, unknown, Hex];
        w.keptAtWrite.push(readKeptWitnessContent({ orderHash: ORDER, clauseId, stage, contentRef }));
        w.write();
        return `0x${"12".repeat(32)}`;
    },
}));

import { useAttestationCoordinatorActions } from "@/lib/composition/useAttestationCoordinatorActions";
import { KEPT_WITNESS_STORAGE_KEY, readKeptWitnessContent, readKeptWitnessValues } from "@/lib/composition/witnessContent";
import { getClauseSpec, loadClauseSpec, setClauseSpecFetcher } from "@/lib/shared/clauseSpecSource";
import { pinSpec } from "./primeClauseSpecs";

const BLINDING = { name: "blinding", type: "string", format: "bytes32-hex", required: true, disposition: "private", blinding: true };
/** The content delivery's declaring shape, with its stage-1 evidence private. */
const PRIVATE_DELIVERY = pinSpec({
    clauseId: "test-private-content-handoff",
    version: 1,
    title: "Private content hand-off",
    description: "A hand-off whose stage-1 completion evidence is private.",
    fields: [{ name: "note", type: "string", required: true }],
    stages: {
        "1": [
            { name: "contentHash", type: "string", required: true, pattern: "^0x[0-9a-fA-F]{64}$", disposition: "private" },
            { name: "contentUri", type: "string", required: false, disposition: "private" },
            BLINDING,
        ],
    },
});
/** The same shape with a public stage 1. */
const PUBLIC_DELIVERY = pinSpec({
    clauseId: "test-public-content-handoff",
    version: 1,
    title: "Public content hand-off",
    description: "A hand-off whose stage-1 completion evidence is public.",
    fields: [{ name: "note", type: "string", required: true }],
    stages: { "1": [{ name: "contentHash", type: "string", required: true, pattern: "^0x[0-9a-fA-F]{64}$" }] },
});

beforeAll(async () => {
    setClauseSpecFetcher(async (uri) => (uri === "mem://private" ? PRIVATE_DELIVERY.bytes : PUBLIC_DELIVERY.bytes));
    await loadClauseSpec(PRIVATE_DELIVERY.clauseKey, "mem://private");
    await loadClauseSpec(PUBLIC_DELIVERY.clauseKey, "mem://public");
    w.clauseKeys = [PRIVATE_DELIVERY.clauseKey, PUBLIC_DELIVERY.clauseKey];
});

const ARTIFACT_HASH = keccak256("0x0102");

async function file(clauseId: Hex, content: Hex): Promise<unknown> {
    const { result } = renderHook(() => useAttestationCoordinatorActions());
    let caught: unknown;
    await act(async () => {
        try {
            await result.current.submitAttestation("seller", { orderHash: ORDER, clauseId, stage: 1, content });
        } catch (e) {
            caught = e;
        }
    });
    return caught;
}

const keptKeys = () => Object.keys(window.localStorage).filter((k) => k.startsWith(KEPT_WITNESS_STORAGE_KEY));

describe("the submitter keeps a private set's content before it sends", () => {
    it("a content delivery's private stage-1 evidence is kept before the write, and its values decode from the kept bytes", async () => {
        window.localStorage.clear();
        w.keptAtWrite = [];
        const { content } = prepareAttestationContent(getClauseSpec(PRIVATE_DELIVERY.clauseKey)!, { contentHash: ARTIFACT_HASH }, { stage: 1 });
        expect(await file(PRIVATE_DELIVERY.clauseKey, content)).toBeUndefined();
        expect(w.keptAtWrite).toEqual([content]);
        const values = readKeptWitnessValues({ orderHash: ORDER, clauseId: PRIVATE_DELIVERY.clauseKey, stage: 1, contentRef: keccak256(content) });
        expect(values?.contentHash).toBe(ARTIFACT_HASH);
        expect(values?.blinding).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it("a public stage-1 evidence keeps nothing", async () => {
        window.localStorage.clear();
        w.keptAtWrite = [];
        const content = encodeContentFromSpec(getClauseSpec(PUBLIC_DELIVERY.clauseKey)!, { contentHash: ARTIFACT_HASH }, { stage: 1 });
        expect(await file(PUBLIC_DELIVERY.clauseKey, content)).toBeUndefined();
        expect(w.keptAtWrite).toEqual([null]);
        expect(keptKeys()).toEqual([]);
    });

    it("where the browser refuses to keep a private set's content, nothing is sent", async () => {
        window.localStorage.clear();
        w.write.mockClear();
        const { content } = prepareAttestationContent(getClauseSpec(PRIVATE_DELIVERY.clauseKey)!, { contentHash: ARTIFACT_HASH }, { stage: 1 });
        const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
        let caught: unknown;
        try {
            caught = await file(PRIVATE_DELIVERY.clauseKey, content);
        } finally {
            setItem.mockRestore();
        }
        expect((caught as Error).message).toMatch(/could not keep the private content of this Private content hand-off attestation/);
        expect(w.write).not.toHaveBeenCalled();
    });
});
