/**
 * recordProcessUsage — the headless at-resolution usage recording. Every
 * committed clause earns a clause leg, the agreement's provenance leaf
 * earns the agreement leg and the assembly leg (with the agreement's
 * membership proof), and a key is sent once per process.
 */
import { describe, it, expect } from "vitest";
import { encodePacked, keccak256, type Address, type Hex, type PublicClient, type WalletClient } from "viem";
import { recordProcessUsage } from "../src/agent/index.js";
import { computeClauseKey } from "../src/discovery.js";
import { PROVENANCE_LEAF_KEY, type Agreement } from "../src/agreement.js";
import {
    ASSEMBLY_LEAF_DOMAIN, ASSEMBLY_TERMS_LEAF_KEY, buildAgreementInclusionProof, assemblyHashOf, type Assembly } from "../src/assembly.js";
import type { Commitment } from "../src/types.js";
import { keyOf } from "./specFixtures.js";

const COUNTER = "0x00000000000000000000000000000000000c0de5" as Address;
const CORE = "0x0000000000000000000000000000000000c0ffee" as Address;
const COMMERCE = keyOf("figaro-commerce");
const MODALITIES = keyOf("figaro-modalities");
const AGREEMENT_HASH = keccak256(encodePacked(["string"], ["an-agreement"]));
const ASSEMBLY: Assembly = { agreements: [{ id: "agreement-0", agreementHash: AGREEMENT_HASH, clauses: {} }] };
const COMPOSITION = assemblyHashOf(ASSEMBLY);

function order(salt: bigint): Commitment {
    return {
        processId: `0x${"0".repeat(64)}` as Hex,
        buyer: "0x0000000000000000000000000000000000000b0b" as Address,
        seller: "0x0000000000000000000000000000000000005e11" as Address,
        currency: "0x00000000000000000000000000000000000007ed" as Address,
        payment: 100n,
        expectedCumulativeValue: 100n,
        checkoutHash: `0x${"a".repeat(64)}` as Hex,
        salt,
        deadline: 2n,
    };
}

function agreement(provenance: Agreement["provenance"] = { agreementHash: AGREEMENT_HASH, assemblyHash: COMPOSITION }): Agreement {
    const o = order(1n);
    return {
        version: "a1", buyer: o.buyer, seller: o.seller,
        clauses: [
            { clause: keyOf("figaro-modalities"), data: { modality: "pickup" } },
            { clause: keyOf("figaro-commerce"), data: { payment: "100", currency: o.currency, lineItems: [] } },
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
            if (functionName === "assemblyTermsLeaf") return ASSEMBLY_TERMS_LEAF_KEY;
            if (functionName === "assemblyLeafDomain") return ASSEMBLY_LEAF_DOMAIN;
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
        const assembly = sent.filter((s) => s.functionName === "recordAssemblyUsage");
        expect(assembly.map((s) => s.key)).toEqual([COMPOSITION]);
        const membership = buildAgreementInclusionProof(ASSEMBLY, 0);
        // (order, assemblyHash, agreementHash, slotContentHash, leafProof, membershipProof)
        expect(assembly[0].args[2]).toBe(AGREEMENT_HASH);
        expect(assembly[0].args[3]).toBe(membership.slotContentHash);
        expect(assembly[0].args[5]).toEqual(membership.proof);
        const agreementLeg = sent.filter((s) => s.functionName === "recordAgreementUsage");
        expect(agreementLeg.map((s) => s.key)).toEqual([AGREEMENT_HASH]);
        expect(agreementLeg[0].args[2]).toBe(COMPOSITION);
        expect(report).toEqual({ attempted: 2, recorded: 2, assemblyRecorded: true, agreementRecorded: true, failures: [] });
    });

    it("an agreement whose provenance is malformed has no provable leg: nothing is sent and the report says so", async () => {
        const { publicClient, walletClient, sent } = clients();
        const report = await recordProcessUsage(walletClient, publicClient, COUNTER, [
            { commitment: order(1n), agreement: agreement({ agreementHash: AGREEMENT_HASH, assemblyHash: "0x12" }), assembly: ASSEMBLY },
        ]);

        expect(sent).toHaveLength(0);
        expect(report.assemblyRecorded).toBe(false);
        expect(report.recorded).toBe(0);
        expect(report.failures).toHaveLength(1);
        expect(report.failures[0]).toMatch(/^agreement: .*0x12/);
    });

    it("sends a key two orders carry once: the counter counts it once per process", async () => {
        const { publicClient, walletClient, sent } = clients();
        const report = await recordProcessUsage(walletClient, publicClient, COUNTER, [
            { commitment: order(1n), agreement: agreement(), assembly: ASSEMBLY },
            { commitment: order(2n), agreement: agreement(), assembly: ASSEMBLY },
        ]);

        expect(sent).toHaveLength(4);
        expect(report.attempted).toBe(2);
        expect(report.recorded).toBe(2);
        expect(report.assemblyRecorded).toBe(true);
    });

    it("a leg that fails lands in the report and the others still go", async () => {
        const { publicClient, walletClient, sent } = clients({ failOn: COMMERCE });
        const report = await recordProcessUsage(walletClient, publicClient, COUNTER, [{ commitment: order(1n), agreement: agreement(), assembly: ASSEMBLY }]);

        expect(report.attempted).toBe(2);
        expect(report.recorded).toBe(1);
        expect(report.assemblyRecorded).toBe(true);
        expect(report.failures).toEqual([`clause ${COMMERCE}: SellerNotStaked`]);
        expect(sent.map((s) => s.functionName).sort()).toEqual(["recordAgreementUsage", "recordAssemblyUsage", "recordClauseUsage"]);
    });

    it("an agreement naming a provenance without its assembly has no provable leg: the report says so", async () => {
        const { publicClient, walletClient, sent } = clients();
        const report = await recordProcessUsage(walletClient, publicClient, COUNTER, [{ commitment: order(1n), agreement: agreement() }]);
        expect(sent).toHaveLength(0);
        expect(report.failures[0]).toMatch(/assembly is needed/);
    });
});
