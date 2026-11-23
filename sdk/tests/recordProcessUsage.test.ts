/**
 * recordProcessUsage — the headless at-resolution usage recording. Every
 * committed clause earns a clause leg, the agreement's provenance leaf
 * earns the agreement leg and the assembly leg (with the agreement's
 * membership proof), and a key is sent once for each seller of the process.
 */
import { describe, it, expect } from "vitest";
import { encodePacked, keccak256, type Address, type Hex, type PublicClient, type WalletClient } from "viem";
import { recordProcessUsage } from "../src/agent/index.js";
import { computeClauseKey } from "../src/discovery.js";
import { PROVENANCE_LEAF_KEY, type Agreement } from "../src/agreement.js";
import {
    PROCESS_LEAF_DOMAIN, PROCESS_TERMS_LEAF_KEY, buildAgreementInclusionProof, processDesignHashOf, type ProcessDesign } from "../src/assembly.js";
import type { Commitment } from "../src/types.js";
import { keyOf } from "./specFixtures.js";

const COUNTER = "0x00000000000000000000000000000000000c0de5" as Address;
const CORE = "0x0000000000000000000000000000000000c0ffee" as Address;
const COMMERCE = keyOf("figaro-commerce");
const MODALITIES = keyOf("figaro-modalities");
const AGREEMENT_HASH = keccak256(encodePacked(["string"], ["an-agreement"]));
const ASSEMBLY: ProcessDesign = { agreements: [{ id: "agreement-0", agreementHash: AGREEMENT_HASH, clauses: {} }] };
const COMPOSITION = processDesignHashOf(ASSEMBLY);

const SELLER = "0x0000000000000000000000000000000000005e11" as Address;
const OTHER_SELLER = "0x0000000000000000000000000000000000005e12" as Address;

function order(salt: bigint, seller: Address = SELLER): Commitment {
    return {
        processId: `0x${"0".repeat(64)}` as Hex,
        buyer: "0x0000000000000000000000000000000000000b0b" as Address,
        seller,
        token: "0x00000000000000000000000000000000000007ed" as Address,
        payment: 100n,
        runningTotal: 100n,
        checkoutHash: `0x${"a".repeat(64)}` as Hex,
        salt,
        commitDeadline: 2n,
    };
}

function agreement(provenance: Agreement["provenance"] = { agreementHash: AGREEMENT_HASH, processDesignHash: COMPOSITION }): Agreement {
    const o = order(1n);
    return {
        version: "a1", buyer: o.buyer, seller: o.seller,
        clauses: [
            { clause: keyOf("figaro-modalities"), data: { modality: "pickup" } },
            { clause: keyOf("figaro-commerce"), data: { payment: "100", currency: o.token, lineItems: [] } },
        ],
        provenance,
    };
}

interface Sent { functionName: string; key: Hex; args: readonly unknown[] }

/** Stub clients: the counter answers its FigaroCore and its provenance leaf,
 *  and nothing else. */
function clients(opts: { failOn?: Hex } = {}) {
    const sent: Sent[] = [];
    const publicClient = {
        getChainId: async () => 31337,
        readContract: async ({ functionName, args }: { functionName: string; args?: readonly unknown[] }) => {
            if (functionName === "core") return CORE;
            if (functionName === "provenanceLeaf") return PROVENANCE_LEAF_KEY;
            if (functionName === "processTermsLeaf") return PROCESS_TERMS_LEAF_KEY;
            if (functionName === "processLeafDomain") return PROCESS_LEAF_DOMAIN;
            throw new Error(`unexpected read ${functionName}(${(args ?? []).join(",")})`);
        },
        waitForTransactionReceipt: async () => ({ status: "success" }),
    } as unknown as PublicClient;
    const walletClient = {
        account: { address: "0x0000000000000000000000000000000000000b0b" as Address },
        chain: null,
        writeContract: async ({ functionName, args }: { functionName: string; args: readonly unknown[] }) => {
            const key = args[1] as Hex;
            if (opts.failOn && key.toLowerCase() === opts.failOn.toLowerCase()) throw new Error("SellerNotStaked");
            sent.push({ functionName, key, args });
            return `0x${"1".repeat(64)}` as Hex;
        },
    } as unknown as WalletClient;
    return { publicClient, walletClient, sent };
}

describe("recordProcessUsage", () => {
    it("sends every clause's leg, and the agreement and assembly legs from the agreement's provenance leaf", async () => {
        const { publicClient, walletClient, sent } = clients();
        const report = await recordProcessUsage(walletClient, publicClient, COUNTER, [{ commitment: order(1n), agreement: agreement(), assembly: ASSEMBLY }]);

        expect(sent.filter((s) => s.functionName === "recordClauseUsage").map((s) => s.key.toLowerCase()).sort())
            .toEqual([COMMERCE.toLowerCase(), MODALITIES.toLowerCase()].sort());
        expect(sent.some((s) => s.key.toLowerCase() === PROVENANCE_LEAF_KEY.toLowerCase()), "the reserved leaf key is never a clause leg").toBe(false);
        const assembly = sent.filter((s) => s.functionName === "recordProcessDesignUsage");
        expect(assembly.map((s) => s.key)).toEqual([COMPOSITION]);
        const membership = buildAgreementInclusionProof(ASSEMBLY, 0);
        // (order, processDesignHash, agreementHash, agreementContentHash, leafProof, membershipProof)
        expect(assembly[0].args[2]).toBe(AGREEMENT_HASH);
        expect(assembly[0].args[3]).toBe(membership.agreementContentHash);
        expect(assembly[0].args[5]).toEqual(membership.proof);
        const agreementLeg = sent.filter((s) => s.functionName === "recordAgreementUsage");
        expect(agreementLeg.map((s) => s.key)).toEqual([AGREEMENT_HASH]);
        expect(agreementLeg[0].args[2]).toBe(COMPOSITION);
        expect(report).toEqual({ attempted: 2, recorded: 2, assemblyRecorded: true, agreementRecorded: true, failures: [] });
    });

    it("an agreement whose provenance is malformed has no provable leg: nothing is sent and the report says so", async () => {
        const { publicClient, walletClient, sent } = clients();
        const report = await recordProcessUsage(walletClient, publicClient, COUNTER, [
            { commitment: order(1n), agreement: agreement({ agreementHash: AGREEMENT_HASH, processDesignHash: "0x12" }), assembly: ASSEMBLY },
        ]);

        expect(sent).toHaveLength(0);
        expect(report.assemblyRecorded).toBe(false);
        expect(report.recorded).toBe(0);
        expect(report.failures).toHaveLength(1);
        expect(report.failures[0]).toMatch(/^agreement: .*0x12/);
    });

    it("sends a key two orders of one seller carry once: the counter counts one use per seller of a process", async () => {
        const { publicClient, walletClient, sent } = clients();
        const report = await recordProcessUsage(walletClient, publicClient, COUNTER, [
            { commitment: order(1n), agreement: agreement(), assembly: ASSEMBLY },
            { commitment: order(2n), agreement: agreement(), assembly: ASSEMBLY },
        ]);

        expect(sent).toHaveLength(4);
        expect(sent.every((s) => (s.args[0] as Commitment).salt === 1n), "every leg goes through the seller's first order").toBe(true);
        expect(report.attempted).toBe(2);
        expect(report.recorded).toBe(2);
        expect(report.assemblyRecorded).toBe(true);
    });

    it("sends each key once for each seller whose order carries it: two sellers give two uses of every key", async () => {
        const { publicClient, walletClient, sent } = clients();
        const report = await recordProcessUsage(walletClient, publicClient, COUNTER, [
            { commitment: order(1n), agreement: agreement(), assembly: ASSEMBLY },
            { commitment: order(2n, OTHER_SELLER), agreement: agreement(), assembly: ASSEMBLY },
        ]);

        expect(sent).toHaveLength(8);
        for (const functionName of ["recordClauseUsage", "recordAgreementUsage", "recordProcessDesignUsage"]) {
            const sellers = sent.filter((s) => s.functionName === functionName).map((s) => (s.args[0] as Commitment).seller);
            expect(new Set(sellers), functionName).toEqual(new Set([SELLER, OTHER_SELLER]));
        }
        expect(sent.filter((s) => s.functionName === "recordProcessDesignUsage")).toHaveLength(2);
        expect(report).toEqual({ attempted: 4, recorded: 4, assemblyRecorded: true, agreementRecorded: true, failures: [] });
    });

    it("a leg that fails lands in the report and the others still go", async () => {
        const { publicClient, walletClient, sent } = clients({ failOn: COMMERCE });
        const report = await recordProcessUsage(walletClient, publicClient, COUNTER, [{ commitment: order(1n), agreement: agreement(), assembly: ASSEMBLY }]);

        expect(report.attempted).toBe(2);
        expect(report.recorded).toBe(1);
        expect(report.assemblyRecorded).toBe(true);
        expect(report.failures).toEqual([`clause ${COMMERCE}: SellerNotStaked`]);
        expect(sent.map((s) => s.functionName).sort()).toEqual(["recordAgreementUsage", "recordClauseUsage", "recordProcessDesignUsage"]);
    });

    it("an agreement naming a provenance without its assembly has no provable leg: the report says so", async () => {
        const { publicClient, walletClient, sent } = clients();
        const report = await recordProcessUsage(walletClient, publicClient, COUNTER, [{ commitment: order(1n), agreement: agreement() }]);
        expect(sent).toHaveLength(0);
        expect(report.failures[0]).toMatch(/assembly is needed/);
    });
});
