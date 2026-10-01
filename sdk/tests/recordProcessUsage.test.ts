/**
 * recordProcessUsage — the headless at-resolution usage recording. The legs
 * are planned from the deployment's own excluded set, so a record the counter
 * is certain to refuse is never sent, and a key is sent once per process.
 */
import { describe, it, expect } from "vitest";
import { encodePacked, keccak256, type Address, type Hex, type PublicClient, type WalletClient } from "viem";
import { recordProcessUsage } from "../src/agent/index.js";
import { computeClauseKey } from "../src/discovery.js";
import type { Agreement } from "../src/agreement.js";
import type { Commitment } from "../src/types.js";

const COUNTER = "0x00000000000000000000000000000000000c0de5" as Address;
const CORE = "0x0000000000000000000000000000000000c0ffee" as Address;
const PROVENANCE = computeClauseKey("figaro-assembly-provenance", 1);
const COMMERCE = computeClauseKey("figaro-commerce", 1);
const MODALITIES = computeClauseKey("figaro-modalities", 1);
const COMPOSITION = keccak256(encodePacked(["string"], ["an-assembly"]));

function order(salt: bigint): Commitment {
    return {
        processId: `0x${"0".repeat(64)}` as Hex,
        buyer: "0x0000000000000000000000000000000000000b0b" as Address,
        seller: "0x0000000000000000000000000000000000005e11" as Address,
        currency: "0x00000000000000000000000000000000000007ed" as Address,
        payment: 100n,
        expectedCumulativeValue: 100n,
        agreementHash: `0x${"a".repeat(64)}` as Hex,
        salt,
        deadline: 2n,
    };
}

function agreement(): Agreement {
    const o = order(1n);
    return {
        version: "a1", buyer: o.buyer, seller: o.seller,
        sections: [
            { clause: "figaro-modalities", version: 1, data: { modality: "pickup" } },
            { clause: "figaro-commerce", version: 1, data: { payment: "100", currency: o.currency, lineItems: [] } },
            { clause: "figaro-assembly-provenance", version: 1, data: { compositionHash: COMPOSITION } },
        ],
    };
}

interface Sent { functionName: string; key: Hex }

/** Stub clients: the counter excludes the provenance clause and nothing else. */
function clients(opts: { failOn?: Hex } = {}) {
    const sent: Sent[] = [];
    const publicClient = {
        getChainId: async () => 31337,
        readContract: async ({ functionName, args }: { functionName: string; args?: readonly unknown[] }) => {
            if (functionName === "core") return CORE;
            if (functionName === "provenanceClause") return PROVENANCE;
            if (functionName === "excludedClauseOrAssembly") return (args![0] as string).toLowerCase() === PROVENANCE.toLowerCase();
            throw new Error(`unexpected read ${functionName}`);
        },
        waitForTransactionReceipt: async () => ({ status: "success" }),
    } as unknown as PublicClient;
    const walletClient = {
        account: { address: "0x0000000000000000000000000000000000000b0b" as Address },
        chain: null,
        writeContract: async ({ functionName, args }: { functionName: string; args: readonly unknown[] }) => {
            const key = args[1] as Hex;
            if (opts.failOn && key.toLowerCase() === opts.failOn.toLowerCase()) throw new Error("SellerNotStaked");
            sent.push({ functionName, key });
            return `0x${"1".repeat(64)}` as Hex;
        },
    } as unknown as WalletClient;
    return { publicClient, walletClient, sent };
}

describe("recordProcessUsage", () => {
    it("never sends an excluded clause's record, and names what it left out", async () => {
        const { publicClient, walletClient, sent } = clients();
        const report = await recordProcessUsage(walletClient, publicClient, COUNTER, [{ commitment: order(1n), agreement: agreement() }]);

        expect(sent.filter((s) => s.functionName === "recordClauseUsage").map((s) => s.key.toLowerCase()).sort())
            .toEqual([COMMERCE.toLowerCase(), MODALITIES.toLowerCase()].sort());
        expect(sent.some((s) => s.key.toLowerCase() === PROVENANCE.toLowerCase()), "the provenance clause's own record is never sent").toBe(false);
        expect(sent.filter((s) => s.functionName === "recordAssemblyUsage").map((s) => s.key)).toEqual([COMPOSITION]);
        expect(report).toEqual({ attempted: 2, recorded: 2, assemblyRecorded: true, excluded: [PROVENANCE.toLowerCase()], failures: [] });
    });

    it("sends a key two orders carry once: the counter counts it once per process", async () => {
        const { publicClient, walletClient, sent } = clients();
        const report = await recordProcessUsage(walletClient, publicClient, COUNTER, [
            { commitment: order(1n), agreement: agreement() },
            { commitment: order(2n), agreement: agreement() },
        ]);

        expect(sent).toHaveLength(3);
        expect(report.attempted).toBe(2);
        expect(report.recorded).toBe(2);
        expect(report.assemblyRecorded).toBe(true);
    });

    it("a leg that fails lands in the report and the others still go", async () => {
        const { publicClient, walletClient, sent } = clients({ failOn: COMMERCE });
        const report = await recordProcessUsage(walletClient, publicClient, COUNTER, [{ commitment: order(1n), agreement: agreement() }]);

        expect(report.attempted).toBe(2);
        expect(report.recorded).toBe(1);
        expect(report.assemblyRecorded).toBe(true);
        expect(report.failures).toEqual(["figaro-commerce: SellerNotStaked"]);
        expect(sent.map((s) => s.functionName).sort()).toEqual(["recordAssemblyUsage", "recordClauseUsage"]);
    });
});
