/**
 * Two registered versions of one clause: an agreement committed under the
 * OLDER version attests and publishes from that version's spec. A name-only
 * lookup resolves the highest loaded version, whose clause hash the signed
 * agreement never committed ("not committed in the signed agreement") and
 * whose fields may encode and disclose differently.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { hexToBytes, type Hex } from "viem";
import { canonicalContentHash, computeClauseKey, type Commitment } from "@figaro-protocol/sdk";
import { encodeContentFromSpec } from "@figaro-protocol/sdk/clauses";
import { clauseSpecForHash, getClauseSpec, loadClauseSpec, setClauseSpecFetcher } from "@/lib/shared/clauseSpecSource";
import { createCapabilityExecutors, type CapabilityExecutorDeps } from "@/lib/semantic/createCapabilityExecutors";
import { publishWitnessContent } from "@/lib/composition/witnessContent";

vi.mock("@/lib/kernel/signedCommitment", () => ({ restoreSignedProcessId: (c: Commitment) => c }));

const CLAUSE = "test-versioned-ladder";

const V1 = {
    clauseId: CLAUSE,
    version: 1,
    title: "Versioned ladder",
    description: "The version an older agreement committed.",
    fields: [{ name: "eventType", type: "enum", values: ["packed", "shipped"], required: true }],
    stages: { "1": [{ name: "reading", type: "string", required: true, disposition: "public" }] },
};
const V2 = {
    ...V1,
    version: 2,
    description: "A later registered version: a longer ladder and a private reading.",
    fields: [{ name: "eventType", type: "enum", values: ["prepared", "packed", "shipped"], required: true }],
    stages: { "1": [{ name: "reading", type: "string", required: true, disposition: "private" }] },
};

beforeAll(async () => {
    setClauseSpecFetcher(async (uri) => (uri === "mem://v1" ? V1 : V2));
    await loadClauseSpec(CLAUSE, 1, "mem://v1", canonicalContentHash(V1));
    await loadClauseSpec(CLAUSE, 2, "mem://v2", canonicalContentHash(V2));
});

function executors(submitAttestation: CapabilityExecutorDeps["submitAttestation"]) {
    const unused = () => { throw new Error("not under test"); };
    return createCapabilityExecutors({
        isE2EMock: true,
        publicClient: undefined,
        processOrders: [],
        processAgreements: new Map(),
        resolveProcess: unused,
        fetchUsageClaimContext: unused,
        simulateClauseUsage: unused,
        simulateAssemblyUsage: unused,
        recordClauseUsage: unused,
        recordAssemblyUsage: unused,
        submitAttestation,
        registerMember: unused,
        updateMemberProfile: unused,
        withdrawMemberDeposit: unused,
        confirmResolve: () => true,
        confirmWithdraw: () => true,
    });
}

describe("attestation under an older committed clause version", () => {
    it("both versions are loaded, and the name alone resolves the newer one", () => {
        expect(getClauseSpec(CLAUSE)?.version).toBe(2);
        expect(getClauseSpec(CLAUSE, 1)?.version).toBe(1);
        expect(clauseSpecForHash(computeClauseKey(CLAUSE, 1))?.version).toBe(1);
    });

    it("a ladder attestation keys and encodes from the committed version", async () => {
        const submitAttestation = vi.fn(async () => undefined);
        const { executorCallbacks } = executors(submitAttestation);
        await executorCallbacks.submitClauseAttestation({
            executionType: "transaction",
            kind: "submit-clause-attestation",
            orderHash: `0x${"aa".repeat(32)}`,
            clauseId: CLAUSE,
            version: 1,
            stage: 0,
            eventCode: "packed",
            ladderField: "eventType",
            party: "seller",
        });
        const v1 = getClauseSpec(CLAUSE, 1)!;
        expect(submitAttestation).toHaveBeenCalledExactlyOnceWith("seller", expect.objectContaining({
            clauseId: computeClauseKey(CLAUSE, 1),
            content: encodeContentFromSpec(v1, { eventType: "packed" }),
        }));
    });

    it("a witness attestation validates against the committed version's stage fields", async () => {
        const submitAttestation = vi.fn(async () => undefined);
        const { executorCallbacks } = executors(submitAttestation);
        await executorCallbacks.submitClauseAttestation({
            executionType: "transaction",
            kind: "submit-clause-attestation",
            orderHash: `0x${"aa".repeat(32)}`,
            clauseId: CLAUSE,
            version: 1,
            stage: 1,
            party: "buyer",
        }, { reading: "4C" });
        expect(submitAttestation).toHaveBeenCalledExactlyOnceWith("buyer", expect.objectContaining({
            clauseId: computeClauseKey(CLAUSE, 1),
        }));
    });

    it("witness content publishes by the committed version's disposition (public in v1, private in v2)", async () => {
        const content: Hex = encodeContentFromSpec(getClauseSpec(CLAUSE, 1)!, { reading: "4C" }, { stage: 1 });
        const pinKeccakRawBlock = vi.fn().mockResolvedValue("bafy-other");
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        await publishWitnessContent({ clauseId: computeClauseKey(CLAUSE, 1), stage: 1, content, ipfs: { pinKeccakRawBlock } });
        expect(pinKeccakRawBlock).toHaveBeenCalledExactlyOnceWith(hexToBytes(content));
        pinKeccakRawBlock.mockClear();
        // The v2 hash withholds: its reading is private.
        await publishWitnessContent({ clauseId: computeClauseKey(CLAUSE, 2), stage: 1, content, ipfs: { pinKeccakRawBlock } });
        expect(pinKeccakRawBlock).not.toHaveBeenCalled();
        warn.mockRestore();
    });
});
