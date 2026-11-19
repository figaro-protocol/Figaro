/**
 * A private set's content is kept before the attestation is sent
 * (`submitAttestation`). Where no transaction hash ever exists (the
 * simulation refuses the call, or the wallet rejects it), the content was
 * never referenced on the chain, and the kept copy is removed. Once a
 * transaction was sent, the copy stays, whether it reverts or its outcome is
 * unknown: the party may need it. A copy this browser held before the filing
 * began is never removed by it.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { keccak256, type Hex } from "viem";
import { prepareAttestationContent } from "@figaro-protocol/sdk/agent";

const ORDER = `0x${"0d".repeat(32)}` as Hex;
const TX = `0x${"12".repeat(32)}` as Hex;

/** How the chain and the wallet answer this filing. */
const w = vi.hoisted(() => ({
    clauseKey: "",
    simulate: async (): Promise<unknown> => undefined,
    write: async (): Promise<Hex> => `0x${"12".repeat(32)}` as Hex,
    receipt: async (): Promise<{ status: string }> => ({ status: "success" }),
}));

vi.mock("wagmi", () => ({
    useAccount: () => ({ address: "0x2222222222222222222222222222222222222222", isConnected: true }),
    usePublicClient: () => ({
        chain: { id: 31337 },
        simulateContract: () => w.simulate(),
        waitForTransactionReceipt: () => w.receipt(),
    }),
    useWriteContract: () => ({ writeContractAsync: () => w.write(), data: undefined, isPending: false }),
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
            clauses: [{ clause: w.clauseKey, data: { note: "committed" } }],
        },
    }),
}));
vi.mock("@/lib/composition/witnessContent", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/composition/witnessContent")>()),
    publishWitnessContent: async () => undefined,
}));

import { useAttestationCoordinatorActions } from "@/lib/composition/useAttestationCoordinatorActions";
import { keepPrivateWitnessContent, readKeptWitnessContent } from "@/lib/composition/witnessContent";
import { getClauseSpec, loadClauseSpec, setClauseSpecFetcher } from "@/lib/shared/clauseSpecSource";
import { pinSpec } from "./primeClauseSpecs";

const PRIVATE = pinSpec({
    clauseId: "test-kept-copy-unsent",
    version: 1,
    title: "Private reading",
    description: "A clause whose stage-1 evidence is private.",
    fields: [{ name: "note", type: "string", required: true }],
    stages: {
        "1": [
            { name: "reading", type: "string", required: true, disposition: "private" },
            { name: "blinding", type: "string", format: "bytes32-hex", required: true, disposition: "private", blinding: true },
        ],
    },
});

beforeAll(async () => {
    setClauseSpecFetcher(async () => PRIVATE.bytes);
    await loadClauseSpec(PRIVATE.clauseKey, "mem://kept-copy-unsent");
    w.clauseKey = PRIVATE.clauseKey;
});

beforeEach(() => {
    window.localStorage.clear();
    w.simulate = async () => undefined;
    w.write = async () => TX;
    w.receipt = async () => ({ status: "success" });
});

/** File one private stage-1 attestation; its content and what it threw. */
async function file(content: Hex = prepareAttestationContent(getClauseSpec(PRIVATE.clauseKey)!, { reading: "4.2" }, { stage: 1 }).content) {
    const { result } = renderHook(() => useAttestationCoordinatorActions());
    let caught: unknown;
    await act(async () => {
        try {
            await result.current.submitAttestation("seller", { orderHash: ORDER, clauseId: PRIVATE.clauseKey as Hex, stage: 1, content });
        } catch (e) {
            caught = e;
        }
    });
    const kept = readKeptWitnessContent({ address: "0x2222222222222222222222222222222222222222", chainId: 31337 }, { orderHash: ORDER, clauseId: PRIVATE.clauseKey, stage: 1, contentRef: keccak256(content) });
    return { caught, kept };
}

describe("a kept private copy whose attestation never reached the chain", () => {
    it("is removed when the wallet rejects the transaction", async () => {
        w.write = async () => { throw new Error("User rejected the request."); };
        const { caught, kept } = await file();
        expect(caught).toBeInstanceOf(Error);
        expect(kept).toBeNull();
    });

    it("is removed when the simulation refuses the call before any transaction exists", async () => {
        w.simulate = async () => { throw new Error("execution reverted"); };
        const { caught, kept } = await file();
        expect(caught).toBeInstanceOf(Error);
        expect(kept).toBeNull();
    });

    it("stays when the transaction was sent and reverted", async () => {
        w.receipt = async () => ({ status: "reverted" });
        const { caught, kept } = await file();
        expect((caught as Error).message).toMatch(/reverted on-chain/);
        expect(kept).not.toBeNull();
    });

    it("stays when the transaction was sent and its outcome is unknown", async () => {
        w.receipt = async () => { throw new Error("the receipt wait timed out"); };
        const { caught, kept } = await file();
        expect(caught).toBeInstanceOf(Error);
        expect(kept).not.toBeNull();
    });

    it("stays when the transaction landed", async () => {
        const { caught, kept } = await file();
        expect(caught).toBeUndefined();
        expect(kept).not.toBeNull();
    });

    it("a copy held before the filing began stays when the wallet rejects", async () => {
        const { content } = prepareAttestationContent(getClauseSpec(PRIVATE.clauseKey)!, { reading: "4.2" }, { stage: 1 });
        expect(keepPrivateWitnessContent({ address: "0x2222222222222222222222222222222222222222", chainId: 31337 }, { orderHash: ORDER, clauseId: PRIVATE.clauseKey, stage: 1, content })).toBe("kept");
        w.write = async () => { throw new Error("User rejected the request."); };
        const { kept } = await file(content);
        expect(kept).not.toBeNull();
    });
});
