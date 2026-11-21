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
import { extractOverlays, type RecoveredAttestation } from "@figaro-protocol/sdk/derive";
import { getClauseSpec, loadClauseSpec, setClauseSpecFetcher, specSource } from "@/lib/shared/clauseSpecSource";
import { keyOf, pinSpec, primeClauseSpecs } from "./primeClauseSpecs";
import { createCapabilityExecutors, type CapabilityExecutorDeps } from "@/lib/semantic/createCapabilityExecutors";
import { publishWitnessContent } from "@/lib/core/witnessContent";

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

/**
 * The content of an attestation at stage N is encoded over `stages[N]` where
 * the spec declares it, else over the top-level fields: the SDK's
 * `contentFieldsFor` and the proof program apply this one rule, and so does
 * the frontend, a process-log clause's ladder events included.
 */
describe("a ladder event is encoded over the set its stage selects", () => {
    const ORDER = `0x${"ac".repeat(32)}` as Hex;
    /** A process-log clause that also declares a stage set at ordinal 1. */
    const HYBRID = pinSpec({
        clauseId: "test-hybrid-ladder",
        version: 1,
        title: "Hybrid ladder",
        description: "A process log whose ordinal 1 declares its own stage set.",
        fields: [
            { name: "eventType", type: "enum", values: ["placed", "weighed", "delivered"], required: true },
            { name: "evidenceUri", type: "string", required: false },
        ],
        stages: { "1": [{ name: "grams", type: "integer", required: true }] },
        block: { design: { article: "attestations" }, runtime: { ladder: "eventType" } },
    });

    beforeAll(async () => {
        await primeClauseSpecs(["figaro-courier-process", "figaro-merchant-process"]);
        setClauseSpecFetcher(async () => HYBRID.bytes);
        await loadClauseSpec(HYBRID.clauseKey, "mem://hybrid");
    });

    const ladderAction = (clauseKey: Hex, stage: number, eventCode: string) => ({
        executionType: "transaction" as const,
        kind: "submit-clause-attestation" as const,
        orderHash: ORDER,
        clauseKey,
        stage,
        eventCode,
        ladderField: "eventType",
        party: "seller" as const,
    });

    const sentContent = async (action: ReturnType<typeof ladderAction>, values?: Record<string, unknown>): Promise<Hex> => {
        const submitAttestation = vi.fn(async () => undefined);
        await executors(submitAttestation).executorCallbacks.submitClauseAttestation(action, values);
        return (submitAttestation.mock.calls[0] as unknown as [string, { content: Hex }])[1].content;
    };

    const overlayDecode = (clauseKey: Hex, stage: number, content: Hex) =>
        extractOverlays([{ event: { clauseId: clauseKey, stage, orderHash: ORDER, contentRef: keccak256(content) } as unknown as RecoveredAttestation["event"], content }], specSource())[0].entries[0].decoded;

    it("at an ordinal whose stage set is declared, the bytes are the SDK's encoding at that stage and the data page's reader decodes them", async () => {
        const spec = getClauseSpec(HYBRID.clauseKey)!;
        const content = await sentContent(ladderAction(HYBRID.clauseKey, 1, "weighed"), { grams: 410 });
        expect(content).toBe(encodeContentFromSpec(spec, { grams: 410 }, { stage: 1 }));
        expect(overlayDecode(HYBRID.clauseKey, 1, content)).toEqual({ grams: 410 });
    });

    it("at an ordinal with no stage set, the bytes are the top-level encoding with the event code", async () => {
        const spec = getClauseSpec(HYBRID.clauseKey)!;
        const content = await sentContent(ladderAction(HYBRID.clauseKey, 2, "delivered"));
        expect(content).toBe(encodeContentFromSpec(spec, { eventType: "delivered" }, { stage: 2 }));
        expect(overlayDecode(HYBRID.clauseKey, 2, content)).toMatchObject({ eventType: "delivered" });
    });

    for (const name of ["figaro-courier-process", "figaro-merchant-process"]) {
        it(`${name}: every ladder event's bytes are the bytes encoded with no stage, as before`, async () => {
            const spec = getClauseSpec(keyOf(name))!;
            const ladder = spec.fields.find((f) => f.name === "eventType");
            if (ladder?.type !== "enum") throw new Error("no ladder");
            for (const [stage, eventCode] of ladder.values.entries()) {
                const content = await sentContent(ladderAction(keyOf(name), stage, eventCode), { evidenceUri: "ipfs://QmEvidence" });
                expect(content).toBe(encodeContentFromSpec(spec, { eventType: eventCode, evidenceUri: "ipfs://QmEvidence" }));
            }
        });
    }
});
