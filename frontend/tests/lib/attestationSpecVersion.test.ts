/**
 * Two registered specs of one name (versions 1 and 2) are two clause keys: an
 * agreement committed under the OLDER spec's key attests and publishes from
 * that spec. The other spec's key is one the signed agreement never committed,
 * and its fields may encode and disclose differently.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { hexToBytes, keccak256, type Hex } from "viem";
import { type Commitment } from "@figaro-protocol/sdk";
import { decodeContentFromSpec, encodeContentFromSpec } from "@figaro-protocol/sdk/clauses";
import { getClauseSpec, loadClauseSpec, setClauseSpecFetcher } from "@/lib/shared/clauseSpecSource";
import { pinSpec } from "./primeClauseSpecs";
import { createCapabilityExecutors, type CapabilityExecutorDeps } from "@/lib/semantic/createCapabilityExecutors";
import { KEPT_WITNESS_STORAGE_KEY, publishWitnessContent, readKeptWitnessContent, readKeptWitnessValues } from "@/lib/composition/witnessContent";

vi.mock("@/lib/core/signedCommitment", () => ({ restoreSignedProcessId: (c: Commitment) => c }));

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
    stages: {
        "1": [
            { name: "reading", type: "string", required: true, disposition: "private" },
            { name: "blinding", type: "string", format: "bytes32-hex", required: true, disposition: "private", blinding: true },
        ],
    },
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

    it("a witness on a private stage draws its blinding value: two attestations of one reading carry different content", async () => {
        const submitAttestation = vi.fn(async () => undefined);
        const { executorCallbacks } = executors(submitAttestation);
        const action = {
            executionType: "transaction" as const,
            kind: "submit-clause-attestation" as const,
            orderHash: `0x${"aa".repeat(32)}`,
            clauseKey: SPEC_V2.clauseKey,
            stage: 1,
            party: "buyer" as const,
        };
        await executorCallbacks.submitClauseAttestation(action, { reading: "4C" });
        await executorCallbacks.submitClauseAttestation(action, { reading: "4C" });
        const contents = (submitAttestation.mock.calls as unknown as [string, { content: Hex }][]).map(([, args]) => args.content);
        expect(contents[0]).not.toBe(contents[1]);
        const decoded = decodeContentFromSpec(getClauseSpec(SPEC_V2.clauseKey)!, contents[0], { stage: 1 });
        expect(decoded.reading).toBe("4C");
        expect(decoded.blinding).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it("a witness on a public stage carries the same content every time", async () => {
        const submitAttestation = vi.fn(async () => undefined);
        const { executorCallbacks } = executors(submitAttestation);
        const action = {
            executionType: "transaction" as const,
            kind: "submit-clause-attestation" as const,
            orderHash: `0x${"aa".repeat(32)}`,
            clauseKey: SPEC_V1.clauseKey,
            stage: 1,
            party: "buyer" as const,
        };
        await executorCallbacks.submitClauseAttestation(action, { reading: "4C" });
        await executorCallbacks.submitClauseAttestation(action, { reading: "4C" });
        const contents = (submitAttestation.mock.calls as unknown as [string, { content: Hex }][]).map(([, args]) => args.content);
        expect(contents[0]).toBe(contents[1]);
        expect(contents[0]).toBe(encodeContentFromSpec(getClauseSpec(SPEC_V1.clauseKey)!, { reading: "4C" }, { stage: 1 }));
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

describe("the attester keeps its private witness content before the attestation is sent", () => {
    const ORDER = `0x${"aa".repeat(32)}` as Hex;
    /** A process-log clause whose top-level set is private: a ladder event
     *  of it is private content too. */
    const PRIVATE_LADDER = pinSpec({
        clauseId: "test-private-ladder",
        version: 1,
        title: "Private ladder",
        description: "A process-log clause whose events are private.",
        fields: [
            { name: "eventType", type: "enum", values: ["packed", "shipped"], required: true, disposition: "private" },
            { name: "blinding", type: "string", format: "bytes32-hex", required: true, disposition: "private", blinding: true },
        ],
        block: { design: { article: "attestations" } },
    });

    beforeAll(async () => {
        setClauseSpecFetcher(async (uri) => (uri === "mem://v1" ? SPEC_V1.bytes : uri === "mem://ladder" ? PRIVATE_LADDER.bytes : SPEC_V2.bytes));
        await loadClauseSpec(PRIVATE_LADDER.clauseKey, "mem://ladder");
    });

    it("a private witness: the content is kept, values and blinding value included, when the attestation is sent", async () => {
        window.localStorage.clear();
        let keptAtSend: Hex | null = null;
        const submitAttestation = vi.fn(async (_role: "buyer" | "seller", args: { content?: Hex; stage: number; clauseId: Hex }) => {
            keptAtSend = readKeptWitnessContent({ orderHash: ORDER, clauseId: args.clauseId, stage: args.stage, contentRef: keccak256(args.content!) });
            return undefined;
        });
        const { executorCallbacks } = executors(submitAttestation as CapabilityExecutorDeps["submitAttestation"]);
        await executorCallbacks.submitClauseAttestation({
            executionType: "transaction", kind: "submit-clause-attestation",
            orderHash: ORDER, clauseKey: SPEC_V2.clauseKey, stage: 1, party: "buyer",
        }, { reading: "4C" });
        const sent = (submitAttestation.mock.calls[0][1] as { content: Hex }).content;
        expect(keptAtSend).toBe(sent);
        const values = readKeptWitnessValues({ orderHash: ORDER, clauseId: SPEC_V2.clauseKey, stage: 1, contentRef: keccak256(sent) });
        expect(values?.reading).toBe("4C");
        expect(values?.blinding).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it("a ladder event of a clause whose top-level set is private is kept the same way", async () => {
        window.localStorage.clear();
        const submitAttestation = vi.fn(async () => undefined);
        const { executorCallbacks } = executors(submitAttestation);
        await executorCallbacks.submitClauseAttestation({
            executionType: "transaction", kind: "submit-clause-attestation",
            orderHash: ORDER, clauseKey: PRIVATE_LADDER.clauseKey, stage: 0, eventCode: "packed", ladderField: "eventType", party: "seller",
        });
        const sent = (submitAttestation.mock.calls[0] as unknown as [string, { content: Hex }])[1].content;
        expect(readKeptWitnessContent({ orderHash: ORDER, clauseId: PRIVATE_LADDER.clauseKey, stage: 0, contentRef: keccak256(sent) })).toBe(sent);
    });

    it("a public witness keeps nothing", async () => {
        window.localStorage.clear();
        const { executorCallbacks } = executors(vi.fn(async () => undefined));
        await executorCallbacks.submitClauseAttestation({
            executionType: "transaction", kind: "submit-clause-attestation",
            orderHash: ORDER, clauseKey: SPEC_V1.clauseKey, stage: 1, party: "buyer",
        }, { reading: "4C" });
        expect(window.localStorage.getItem(KEPT_WITNESS_STORAGE_KEY)).toBeNull();
    });

    it("where the browser refuses to keep a private witness, nothing is sent", async () => {
        window.localStorage.clear();
        const submitAttestation = vi.fn(async () => undefined);
        const { executorCallbacks } = executors(submitAttestation);
        const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
        try {
            await expect(executorCallbacks.submitClauseAttestation({
                executionType: "transaction", kind: "submit-clause-attestation",
                orderHash: ORDER, clauseKey: SPEC_V2.clauseKey, stage: 1, party: "buyer",
            }, { reading: "4C" })).rejects.toThrow(/could not keep the private content/);
        } finally {
            setItem.mockRestore();
        }
        expect(submitAttestation).not.toHaveBeenCalled();
    });
});
