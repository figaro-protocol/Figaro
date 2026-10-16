/**
 * Two registered specs of one name (versions 1 and 2) are two clause keys: an
 * agreement committed under the OLDER spec's key attests and publishes from
 * that spec. The other spec's key is one the signed agreement never committed,
 * and its fields may encode and disclose differently.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { hexToBytes, type Hex } from "viem";
import { type Commitment } from "@figaro-protocol/sdk";
import { encodeContentFromSpec } from "@figaro-protocol/sdk/clauses";
import { getClauseSpec, loadClauseSpec, setClauseSpecFetcher } from "@/lib/shared/clauseSpecSource";
import { pinSpec } from "./primeClauseSpecs";
import { createCapabilityExecutors, type CapabilityExecutorDeps } from "@/lib/semantic/createCapabilityExecutors";
import { publishWitnessContent } from "@/lib/composition/witnessContent";

vi.mock("@/lib/kernel/signedCommitment", () => ({ restoreSignedProcessId: (c: Commitment) => c }));

const CLAUSE = "test-versioned-ladder";

const SPEC_VERSION_1 = {
    clauseId: CLAUSE,
    version: 1,
    title: "Versioned ladder",
    description: "The version an older agreement committed.",
    fields: [{ name: "eventType", type: "enum", values: ["packed", "shipped"], required: true }],
    stages: { "1": [{ name: "reading", type: "string", required: true, disposition: "public" }] },
};
const SPEC_VERSION_2 = {
    ...SPEC_VERSION_1,
    version: 2,
    description: "A later registered version: a longer ladder and a private reading.",
    fields: [{ name: "eventType", type: "enum", values: ["prepared", "packed", "shipped"], required: true }],
    stages: { "1": [{ name: "reading", type: "string", required: true, disposition: "private" }] },
};

const SPEC_V1 = pinSpec(SPEC_VERSION_1);
const SPEC_V2 = pinSpec(SPEC_VERSION_2);

beforeAll(async () => {
    setClauseSpecFetcher(async (uri) => (uri === "mem://v1" ? SPEC_V1.bytes : SPEC_V2.bytes));
    await loadClauseSpec(SPEC_V1.clauseKey, "mem://v1");
    await loadClauseSpec(SPEC_V2.clauseKey, "mem://v2");
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
        readAssembly: unused,
        simulateUsage: unused,
        recordUsage: unused,
        submitAttestation,
        registerMember: unused,
        updateMemberProfile: unused,
        withdrawMemberDeposit: unused,
        confirmResolve: () => true,
        confirmWithdraw: () => true,
    });
}

describe("attestation under the committed clause key, beside another spec of the same name", () => {
    it("both specs are loaded, each read by its own key", () => {
        expect(SPEC_V1.clauseKey).not.toBe(SPEC_V2.clauseKey);
        expect(getClauseSpec(SPEC_V2.clauseKey)?.version).toBe(2);
        expect(getClauseSpec(SPEC_V1.clauseKey)?.version).toBe(1);
        expect(getClauseSpec(SPEC_V1.clauseKey)?.clauseId).toBe(CLAUSE);
    });

    it("a ladder attestation keys and encodes from the committed version", async () => {
        const submitAttestation = vi.fn(async () => undefined);
        const { executorCallbacks } = executors(submitAttestation);
        await executorCallbacks.submitClauseAttestation({
            executionType: "transaction",
            kind: "submit-clause-attestation",
            orderHash: `0x${"aa".repeat(32)}`,
            clauseKey: SPEC_V1.clauseKey,
            stage: 0,
            eventCode: "packed",
            ladderField: "eventType",
            party: "seller",
        });
        const v1 = getClauseSpec(SPEC_V1.clauseKey)!;
        expect(submitAttestation).toHaveBeenCalledExactlyOnceWith("seller", expect.objectContaining({
            clauseId: SPEC_V1.clauseKey,
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
            clauseKey: SPEC_V1.clauseKey,
            stage: 1,
            party: "buyer",
        }, { reading: "4C" });
        expect(submitAttestation).toHaveBeenCalledExactlyOnceWith("buyer", expect.objectContaining({
            clauseId: SPEC_V1.clauseKey,
        }));
    });

    it("witness content publishes by the committed spec's disposition (public in v1, private in v2)", async () => {
        const content: Hex = encodeContentFromSpec(getClauseSpec(SPEC_V1.clauseKey)!, { reading: "4C" }, { stage: 1 });
        const pinKeccakRawBlock = vi.fn().mockResolvedValue("bafy-other");
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        await publishWitnessContent({ clauseId: SPEC_V1.clauseKey, stage: 1, content, ipfs: { pinKeccakRawBlock } });
        expect(pinKeccakRawBlock).toHaveBeenCalledExactlyOnceWith(hexToBytes(content));
        pinKeccakRawBlock.mockClear();
        // The v2 key withholds: its reading is private.
        await publishWitnessContent({ clauseId: SPEC_V2.clauseKey, stage: 1, content, ipfs: { pinKeccakRawBlock } });
        expect(pinKeccakRawBlock).not.toHaveBeenCalled();
        warn.mockRestore();
    });
});
