/**
 * registerComposedAgreement — the one registration path for a composed
 * agreement, whether the drawer registers it on its own or an assembly's
 * publish registers an agreement's new agreement: a key the registry
 * already binds is skipped with nothing sent (first write wins); otherwise
 * the document is pinned, the registration simulated with the registry's
 * stake, written, and held to a `success` receipt.
 */
import { describe, expect, it, vi } from "vitest";
import { agreementKeyOf, type ComposedAgreement } from "@figaro-protocol/sdk";

vi.mock("@/lib/kernel/contracts", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/kernel/contracts")>();
    return { ...actual, CONTRACTS: { ...actual.CONTRACTS, agreementRegistry: "0x00000000000000000000000000000000000a9e01" } };
});
vi.mock("@/lib/shared/wagmi", () => ({
    publicClient: {},
    activeChain: { id: 31337 },
}));

import { registerComposedAgreement } from "@/lib/designer/publishAssembly";

const DESIGNER = "0x1111111111111111111111111111111111111111" as const;
const DOC: ComposedAgreement = {
    name: "Probe",
    clauses: { [`0x${"ab".repeat(32)}`]: {}, [`0x${"cd".repeat(32)}`]: { regime: "open" } },
};
const KEY = agreementKeyOf(DOC);
const STAKE = 50_000_000_000_000_000n;

function fakes(receiptStatus = "success") {
    const calls: string[] = [];
    const client = {
        readContract: vi.fn(async () => { calls.push("readContract"); return STAKE; }),
        simulateContract: vi.fn(async () => { calls.push("simulate"); return {}; }),
        waitForTransactionReceipt: vi.fn(async () => { calls.push("receipt"); return { status: receiptStatus }; }),
    };
    type WriteConfig = { functionName: string; args: readonly unknown[]; value?: bigint };
    const writeContractAsync = vi.fn(async (_config: WriteConfig) => { calls.push("write"); return `0x${"77".repeat(32)}` as const; });
    const ipfs = { publishJSON: vi.fn(async (_data: unknown) => { calls.push("pin"); return { cid: "bafy", uri: "ipfs://bafy", path: "/ipfs/bafy", gatewayUrl: "http://127.0.0.1:8080/ipfs/bafy" }; }) };
    return { calls, client, writeContractAsync, ipfs };
}

describe("registerComposedAgreement", () => {
    it("pins, simulates with the registry's stake, writes and waits for a success receipt", async () => {
        const { calls, client, writeContractAsync, ipfs } = fakes();
        const out = await registerComposedAgreement({
            client: client as never, writeContractAsync, address: DESIGNER, doc: DOC, agreementKey: KEY,
            ipfs, readBinding: async () => null,
        });
        expect(out).toEqual({ agreementKey: KEY, hash: `0x${"77".repeat(32)}`, ipfsURI: "ipfs://bafy" });
        expect(calls).toEqual(["readContract", "pin", "simulate", "write", "receipt"]);
        const write = writeContractAsync.mock.calls[0][0];
        expect(write.functionName).toBe("registerAgreement");
        expect(write.args).toEqual([KEY, "ipfs://bafy"]);
        expect(write.value).toBe(STAKE);
        // The pinned document is the canonical form of the designer's document,
        // its words included — the key is over the clauses alone.
        expect(ipfs.publishJSON.mock.calls[0][0]).toEqual(DOC);
    });

    it("skips a key the registry already binds — nothing is pinned or sent", async () => {
        const { calls, client, writeContractAsync, ipfs } = fakes();
        const out = await registerComposedAgreement({
            client: client as never, writeContractAsync, address: DESIGNER, doc: DOC, agreementKey: KEY,
            ipfs, readBinding: async () => ({ registeredBy: DESIGNER, registeredAt: 1n, stakeWithdrawn: false, contentURI: "ipfs://old" }),
        });
        expect(out).toEqual({ agreementKey: KEY, hash: null, ipfsURI: null });
        expect(calls).toEqual([]);
    });

    it("a mined-but-reverted registration throws and is never reported as registered", async () => {
        const { client, writeContractAsync, ipfs } = fakes("reverted");
        await expect(registerComposedAgreement({
            client: client as never, writeContractAsync, address: DESIGNER, doc: DOC, agreementKey: KEY,
            ipfs, readBinding: async () => null,
        })).rejects.toThrow(/registration was not created/);
    });
});
