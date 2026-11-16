/**
 * witnessContent — publish / lookup / erasure of attestation content by its
 * on-chain fingerprint.
 *
 * The convention under test: content pins as a RAW IPFS block multihashed
 * with keccak-256, so `contentRef = keccak256(content)` IS the CID digest and
 * any reader derives the address from the Attestation event alone. The golden
 * base32 vector below was produced by a real Kubo 0.42 daemon
 * (`block/put?cid-codec=raw&mhtype=keccak-256`) — regenerated from the OTHER
 * side of the seam, so the encoder can't test itself.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { hexToBytes, keccak256, toHex, type Hex } from "viem";
import { encodeContentFromSpec } from "@figaro-protocol/sdk/clauses";
import { witnessContentCid, witnessContentCidBase32 } from "@figaro-protocol/sdk/derive";
import {
    KEPT_WITNESS_STORAGE_KEY,
    fetchWitnessContent,
    keepPrivateWitnessContent,
    publishWitnessContent,
    readKeptWitnessContent,
    readHeldWitness,
    readKeptWitnessValues,
    resolveHeldWitnessContent,
    unpinWitnessContent,
} from "@/lib/composition/witnessContent";
import { PROVENANCE_LEAF_KEY, provenanceLeafBytes } from "@figaro-protocol/sdk";
import { getClauseSpec, loadClauseSpec, setClauseSpecFetcher } from "@/lib/shared/clauseSpecSource";
import { extractProcessLogs } from "@/lib/audit/processLogsExtract";
import type { Order } from "@/lib/core/store";
import { keyOf, pinSpec, primeClauseSpecs } from "./primeClauseSpecs";

// Kubo 0.42 golden vector: these exact bytes block/put to this exact Key.
const GOLDEN_BYTES = new Uint8Array([0, 0, 0, 1, ...new TextEncoder().encode("hello-witness-content")]);
const GOLDEN_REF = "0xf79b5d7502f9be068188a0f4a287418d11bd6e8aaa42c3ba28777e707571b7d6";
const GOLDEN_KUBO_KEY = "bafkrwihxtnoxkaxzxydidcfa6srioqmncg6w5cvkilb3ukdxpzyhk4nx2y";

const PRIVATE_SPEC = {
    clauseId: "test-private-witness",
    version: 1,
    title: "Private witness",
    description: "All-private stage fields — publication must withhold.",
    fields: [
        { name: "secret", type: "string", required: true, disposition: "private" },
        { name: "blinding", type: "string", format: "bytes32-hex", required: true, disposition: "private", blinding: true },
    ],
    stages: {
        "1": [
            { name: "secretReading", type: "string", required: true, disposition: "private" },
            { name: "blinding", type: "string", format: "bytes32-hex", required: true, disposition: "private", blinding: true },
        ],
    },
};

const PRIVATE = pinSpec(PRIVATE_SPEC);

beforeAll(async () => {
    await primeClauseSpecs(["figaro-proximity-policy"]);
    setClauseSpecFetcher(async () => PRIVATE.bytes);
    await loadClauseSpec(PRIVATE.clauseKey, "mem://test-private-witness");
});

function proximityContent(): Hex {
    const spec = getClauseSpec(keyOf("figaro-proximity-policy"));
    if (!spec) throw new Error("proximity spec not primed");
    return encodeContentFromSpec(
        spec,
        { band: "zone-wifi", evidenceUri: "ipfs://QmEvidence" },
        { stage: 1 },
    );
}

describe("publishWitnessContent", () => {
    it("pins public-disposition stage content as the exact preimage bytes", async () => {
        const content = proximityContent();
        const pinKeccakRawBlock = vi.fn().mockResolvedValue("f01551b20" + keccak256(content).slice(2));
        await publishWitnessContent({
            clauseId: keyOf("figaro-proximity-policy"),
            stage: 1,
            content,
            ipfs: { pinKeccakRawBlock },
        });
        expect(pinKeccakRawBlock).toHaveBeenCalledExactlyOnceWith(hexToBytes(content));
    });

    it("accepts Kubo's base32 CID form — the golden vector from a real daemon", async () => {
        // The gate needs a public spec; the bytes are the vector's, delivered
        // as if they were that clause's content. What's under test is the
        // base32 encoding of the derived CID matching what Kubo itself said.
        const pinKeccakRawBlock = vi.fn().mockResolvedValue(GOLDEN_KUBO_KEY);
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        expect(keccak256(GOLDEN_BYTES)).toBe(GOLDEN_REF);
        // The SDK export IS the derivation under test: both CID forms, direct.
        expect(witnessContentCidBase32(GOLDEN_REF)).toBe(GOLDEN_KUBO_KEY);
        expect(witnessContentCid(GOLDEN_REF)).toBe("f01551b20" + GOLDEN_REF.slice(2));
        await publishWitnessContent({
            clauseId: keyOf("figaro-proximity-policy"),
            stage: 1,
            content: toHex(GOLDEN_BYTES),
            ipfs: { pinKeccakRawBlock },
        });
        expect(pinKeccakRawBlock).toHaveBeenCalledOnce();
        expect(warn).not.toHaveBeenCalled();
        warn.mockRestore();
    });

    it("warns loudly when the node pinned under some other CID", async () => {
        const pinKeccakRawBlock = vi.fn().mockResolvedValue("bafybeisomethingelse");
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        await publishWitnessContent({
            clauseId: keyOf("figaro-proximity-policy"),
            stage: 1,
            content: proximityContent(),
            ipfs: { pinKeccakRawBlock },
        });
        expect(warn).toHaveBeenCalledOnce();
        warn.mockRestore();
    });

    it("withholds private-disposition content — the pin is never attempted", async () => {
        const pinKeccakRawBlock = vi.fn();
        await publishWitnessContent({
            clauseId: PRIVATE.clauseKey,
            stage: 1,
            content: "0x1234",
            ipfs: { pinKeccakRawBlock },
        });
        expect(pinKeccakRawBlock).not.toHaveBeenCalled();
    });

    it("withholds on an unknown spec (fail-closed), loudly", async () => {
        const pinKeccakRawBlock = vi.fn();
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        await publishWitnessContent({
            clauseId: `0x${"ee".repeat(32)}`,
            stage: 1,
            content: "0x1234",
            ipfs: { pinKeccakRawBlock },
        });
        expect(pinKeccakRawBlock).not.toHaveBeenCalled();
        expect(warn).toHaveBeenCalledOnce();
        warn.mockRestore();
    });

    it("swallows a pin failure — the attestation already landed", async () => {
        const pinKeccakRawBlock = vi.fn().mockRejectedValue(new Error("node down"));
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        await expect(publishWitnessContent({
            clauseId: keyOf("figaro-proximity-policy"),
            stage: 1,
            content: proximityContent(),
            ipfs: { pinKeccakRawBlock },
        })).resolves.toBeUndefined();
        expect(warn).toHaveBeenCalledOnce();
        warn.mockRestore();
    });
});

describe("publishWitnessContent — the agreement format's provenance leaf", () => {
    const COMPOSITION = `0x${"9a".repeat(32)}` as Hex;
    const AGREEMENT_HASH = `0x${"8b".repeat(32)}` as Hex;

    it("pins the format's own bytes as-is, with no spec", async () => {
        const content = provenanceLeafBytes(AGREEMENT_HASH, COMPOSITION);
        const pinKeccakRawBlock = vi.fn().mockResolvedValue("f01551b20" + keccak256(content).slice(2));
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        await publishWitnessContent({ clauseId: PROVENANCE_LEAF_KEY, stage: 0, content, ipfs: { pinKeccakRawBlock } });
        expect(pinKeccakRawBlock).toHaveBeenCalledExactlyOnceWith(hexToBytes(content));
        expect(warn).not.toHaveBeenCalled();
        warn.mockRestore();
    });

    it("pins nothing under the reserved key that is not the format's bytes", async () => {
        const pinKeccakRawBlock = vi.fn();
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        await publishWitnessContent({ clauseId: PROVENANCE_LEAF_KEY, stage: 0, content: "0x1234", ipfs: { pinKeccakRawBlock } });
        expect(pinKeccakRawBlock).not.toHaveBeenCalled();
        expect(warn).toHaveBeenCalledOnce();
        warn.mockRestore();
    });
});

describe("fetchWitnessContent", () => {
    function stubFetch(bytes: Uint8Array, ok = true) {
        return vi.fn().mockResolvedValue({
            ok,
            status: ok ? 200 : 404,
            statusText: ok ? "OK" : "Not Found",
            headers: { get: () => null },
            arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
        });
    }

    it("derives the keccak-CID from the fingerprint and verifies the bytes", async () => {
        const doFetch = stubFetch(GOLDEN_BYTES);
        const content = await fetchWitnessContent(GOLDEN_REF, { fetch: doFetch });
        expect(content).toBe(toHex(GOLDEN_BYTES));
        const url = doFetch.mock.calls[0][0] as string;
        expect(url).toContain("/ipfs/f01551b20" + GOLDEN_REF.slice(2));
    });

    it("rejects bytes that do not hash back to the fingerprint", async () => {
        const tampered = new Uint8Array([...GOLDEN_BYTES, 0xff]);
        expect(await fetchWitnessContent(GOLDEN_REF, { fetch: stubFetch(tampered) })).toBeNull();
    });

    it("resolves absence (a 404, a withheld or erased payload) as null", async () => {
        expect(await fetchWitnessContent(GOLDEN_REF, { fetch: stubFetch(new Uint8Array(), false) })).toBeNull();
    });

    it("rejects a malformed fingerprint without fetching", async () => {
        const doFetch = vi.fn();
        expect(await fetchWitnessContent("0x1234", { fetch: doFetch })).toBeNull();
        expect(doFetch).not.toHaveBeenCalled();
    });
});

describe("unpinWitnessContent", () => {
    it("unpins the CID the fingerprint derives", async () => {
        const unpin = vi.fn().mockResolvedValue(undefined);
        await unpinWitnessContent(GOLDEN_REF, { unpin });
        expect(unpin).toHaveBeenCalledExactlyOnceWith("f01551b20" + GOLDEN_REF.slice(2));
    });

    it("rejects a refused unpin with the service's answer (the content stays pinned)", async () => {
        const refusal = new Error("403 Forbidden");
        const unpin = vi.fn().mockRejectedValue(refusal);
        await expect(unpinWitnessContent(GOLDEN_REF, { unpin })).rejects.toBe(refusal);
    });

    it("is a no-op on a malformed fingerprint", async () => {
        const unpin = vi.fn();
        await unpinWitnessContent("not-a-ref", { unpin });
        expect(unpin).not.toHaveBeenCalled();
    });
});

describe("the attester keeps its own private witness content", () => {
    const ORDER = `0x${"0d".repeat(32)}` as Hex;
    const values = { secretReading: "41.2", blinding: `0x${"c7".repeat(32)}` };
    const privateContent = () => {
        const spec = getClauseSpec(PRIVATE.clauseKey);
        if (!spec) throw new Error("private spec not loaded");
        return encodeContentFromSpec(spec, values, { stage: 1 });
    };

    it("keeps a private set's bytes before anything is sent, and reads them and their decoded values back checked against the content reference", () => {
        window.localStorage.clear();
        const content = privateContent();
        expect(keepPrivateWitnessContent({ orderHash: ORDER, clauseId: PRIVATE.clauseKey, stage: 1, content })).toBe("kept");
        const att = { orderHash: ORDER, clauseId: PRIVATE.clauseKey, stage: 1, contentRef: keccak256(content) };
        expect(readKeptWitnessContent(att)).toBe(content);
        expect(readKeptWitnessValues(att)).toEqual(values);
        // Another order, clause, stage or reference reads nothing.
        expect(readKeptWitnessContent({ ...att, orderHash: `0x${"0e".repeat(32)}` as Hex })).toBeNull();
        expect(readKeptWitnessContent({ ...att, stage: 2 })).toBeNull();
        expect(readKeptWitnessContent({ ...att, contentRef: keccak256(toHex("other")) })).toBeNull();
    });

    it("a kept entry whose bytes do not hash to the reference reads as absent", () => {
        window.localStorage.clear();
        const content = privateContent();
        keepPrivateWitnessContent({ orderHash: ORDER, clauseId: PRIVATE.clauseKey, stage: 1, content });
        // Flip one hex digit of the kept bytes.
        for (const [key, text] of keptEntries()) {
            const entry = JSON.parse(text) as { content: string };
            entry.content = `${entry.content.slice(0, 65)}${entry.content[65] === "f" ? "0" : "f"}${entry.content.slice(66)}`;
            window.localStorage.setItem(key, JSON.stringify(entry));
        }
        expect(readKeptWitnessContent({ orderHash: ORDER, clauseId: PRIVATE.clauseKey, stage: 1, contentRef: keccak256(content) })).toBeNull();
    });

    it("keeps nothing for a public set: its bytes are published at their reference", () => {
        window.localStorage.clear();
        expect(keepPrivateWitnessContent({ orderHash: ORDER, clauseId: keyOf("figaro-proximity-policy"), stage: 1, content: proximityContent() })).toBe("public");
        expect(keptEntries()).toEqual([]);
    });

    it("says refused when the browser will not keep it, so the caller sends nothing", () => {
        window.localStorage.clear();
        const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
        try {
            expect(keepPrivateWitnessContent({ orderHash: ORDER, clauseId: PRIVATE.clauseKey, stage: 1, content: privateContent() })).toBe("refused");
        } finally {
            setItem.mockRestore();
        }
    });

    it("resolveHeldWitnessContent reads the kept copy first, and the public pin otherwise", async () => {
        window.localStorage.clear();
        const content = privateContent();
        keepPrivateWitnessContent({ orderHash: ORDER, clauseId: PRIVATE.clauseKey, stage: 1, content });
        expect(await resolveHeldWitnessContent({ orderHash: ORDER, clauseId: PRIVATE.clauseKey, stage: 1, contentRef: keccak256(content) })).toBe(content);
    });
});

/**
 * Which set a content was encoded from decides whether it is private. A
 * process-log clause's ladder event is encoded over the clause's top-level
 * fields, and its stage is the index of its event code; a witness is encoded
 * over `stages[N]`. So privacy is judged by the set the content was encoded
 * from, never by a stage index that may name another set.
 */
describe("privacy is judged by the set the content was encoded from", () => {
    const ORDER = `0x${"1d".repeat(32)}` as Hex;
    const BLOCK = (article: string) => ({
        design: { article, scope: "agreement", nestsUnder: null, fills: [], composes: null },
        checkout: { catalogueFills: [], profileFills: [] },
        runtime: { interaction: null, fields: [] },
    });
    // A private ladder (top-level set) that also declares a public stages[1].
    const LADDER = pinSpec({
        clauseId: "test-private-ladder",
        version: 1,
        title: "Private ladder",
        description: "A process-log clause whose ladder events are private.",
        fields: [
            { name: "eventType", type: "enum", values: ["placed", "picked", "delivered"], required: true, disposition: "private" },
            { name: "blinding", type: "string", format: "bytes32-hex", required: true, disposition: "private", blinding: true },
        ],
        stages: { "1": [{ name: "note", type: "string", required: true }] },
        block: BLOCK("attestations"),
    });
    // A public top-level set with a private stages[1].
    const MIRROR = pinSpec({
        clauseId: "test-private-stage",
        version: 1,
        title: "Private stage",
        description: "A public term whose stage-1 witness is private.",
        fields: [{ name: "term", type: "string", required: true }],
        stages: {
            "1": [
                { name: "reading", type: "string", required: true, disposition: "private" },
                { name: "blinding", type: "string", format: "bytes32-hex", required: true, disposition: "private", blinding: true },
            ],
        },
        block: BLOCK("test-article"),
    });
    // Every set public.
    const PUBLIC = pinSpec({
        clauseId: "test-public-stage",
        version: 1,
        title: "Public stage",
        description: "A public term with a public stage-1 witness.",
        fields: [{ name: "term", type: "string", required: true }],
        stages: { "1": [{ name: "reading", type: "string", required: true }] },
        block: BLOCK("test-article"),
    });

    beforeAll(async () => {
        const bytes: Record<string, string> = { "mem://ladder": LADDER.bytes, "mem://mirror": MIRROR.bytes, "mem://public": PUBLIC.bytes };
        setClauseSpecFetcher(async (uri) => bytes[uri] ?? PRIVATE.bytes);
        await loadClauseSpec(LADDER.clauseKey, "mem://ladder");
        await loadClauseSpec(MIRROR.clauseKey, "mem://mirror");
        await loadClauseSpec(PUBLIC.clauseKey, "mem://public");
    });

    const ladderEvent = () => encodeContentFromSpec(getClauseSpec(LADDER.clauseKey)!, { eventType: "picked", blinding: `0x${"5e".repeat(32)}` });
    const order = { orderHash: ORDER } as unknown as Order;
    const att = (clauseId: Hex, stage: number, content: Hex) => ({
        orderHash: ORDER, processId: `0x${"ab".repeat(32)}`, attester: "0x00000000000000000000000000000000000000a1",
        clauseId, stage, contentRef: keccak256(content), transactionHash: null, blockNumber: 3,
    });

    it("a private ladder event at index 1 is kept, never published, and the evidence file lists it right", async () => {
        window.localStorage.clear();
        const content = ladderEvent();
        expect(keepPrivateWitnessContent({ orderHash: ORDER, clauseId: LADDER.clauseKey, stage: 1, content })).toBe("kept");
        const pinKeccakRawBlock = vi.fn();
        await publishWitnessContent({ clauseId: LADDER.clauseKey, stage: 1, content, ipfs: { pinKeccakRawBlock } });
        expect(pinKeccakRawBlock).not.toHaveBeenCalled();
        const event = att(LADDER.clauseKey, 1, content);
        // A builder that holds it puts it in, decoded through the ladder's set.
        const held = extractProcessLogs(order, [event], readHeldWitness);
        expect(held.missing).toEqual([]);
        expect(held.logs[0].events[0].heldValues).toMatchObject({ eventType: "picked" });
        // A builder that does not hold it names it missing.
        const notHeld = extractProcessLogs(order, [event], () => null);
        expect(notHeld.missing).toContainEqual(expect.objectContaining({
            part: expect.stringContaining(`Content of the private attestation of clause ${LADDER.clauseKey.toLowerCase()}, stage 1`),
        }));
    });

    it("a private witness at stage 1 of a clause with a public top-level set is kept and never published", async () => {
        window.localStorage.clear();
        const content = encodeContentFromSpec(getClauseSpec(MIRROR.clauseKey)!, { reading: "7", blinding: `0x${"6f".repeat(32)}` }, { stage: 1 });
        expect(keepPrivateWitnessContent({ orderHash: ORDER, clauseId: MIRROR.clauseKey, stage: 1, content })).toBe("kept");
        const pinKeccakRawBlock = vi.fn();
        await publishWitnessContent({ clauseId: MIRROR.clauseKey, stage: 1, content, ipfs: { pinKeccakRawBlock } });
        expect(pinKeccakRawBlock).not.toHaveBeenCalled();
        expect(extractProcessLogs(order, [att(MIRROR.clauseKey, 1, content)], () => null).missing).toHaveLength(1);
    });

    it("an all-public witness is published and not kept", async () => {
        window.localStorage.clear();
        const content = encodeContentFromSpec(getClauseSpec(PUBLIC.clauseKey)!, { reading: "7" }, { stage: 1 });
        expect(keepPrivateWitnessContent({ orderHash: ORDER, clauseId: PUBLIC.clauseKey, stage: 1, content })).toBe("public");
        expect(window.localStorage.length).toBe(0);
        const pinKeccakRawBlock = vi.fn().mockResolvedValue("f01551b20" + keccak256(content).slice(2));
        await publishWitnessContent({ clauseId: PUBLIC.clauseKey, stage: 1, content, ipfs: { pinKeccakRawBlock } });
        expect(pinKeccakRawBlock).toHaveBeenCalledExactlyOnceWith(hexToBytes(content));
        expect(extractProcessLogs(order, [att(PUBLIC.clauseKey, 1, content)], () => null).missing).toEqual([]);
    });
});

/** Every stored value under the kept prefix, by storage key. */
function keptEntries(): Array<[string, string]> {
    const out: Array<[string, string]> = [];
    for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i)!;
        if (key.startsWith(KEPT_WITNESS_STORAGE_KEY)) out.push([key, window.localStorage.getItem(key)!]);
    }
    return out;
}

describe("the kept values are read from the checked bytes", () => {
    const ORDER = `0x${"2d".repeat(32)}` as Hex;
    const values = { secretReading: "41.2", blinding: `0x${"c7".repeat(32)}` };

    it("a tampered stored values entry does not reach the evidence file", () => {
        window.localStorage.clear();
        const content = encodeContentFromSpec(getClauseSpec(PRIVATE.clauseKey)!, values, { stage: 1 });
        keepPrivateWitnessContent({ orderHash: ORDER, clauseId: PRIVATE.clauseKey, stage: 1, content, values } as Parameters<typeof keepPrivateWitnessContent>[0]);
        // Write a forged `values` beside every kept copy of the bytes.
        const forge = (node: unknown): unknown => {
            if (!node || typeof node !== "object") return node;
            const obj = node as Record<string, unknown>;
            if (typeof obj.content === "string") return { ...obj, values: { secretReading: "99.9", blinding: `0x${"00".repeat(32)}` } };
            return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, forge(v)]));
        };
        for (const [key, text] of keptEntries()) window.localStorage.setItem(key, JSON.stringify(forge(JSON.parse(text))));
        const place = { orderHash: ORDER, clauseId: PRIVATE.clauseKey, stage: 1, contentRef: keccak256(content) };
        expect(readKeptWitnessValues(place)).toEqual(values);
    });
});

describe("each kept witness is an entry of its own", () => {
    const ORDER = `0x${"3d".repeat(32)}` as Hex;
    const contentOf = (reading: string) =>
        encodeContentFromSpec(getClauseSpec(PRIVATE.clauseKey)!, { secretReading: reading, blinding: `0x${"c7".repeat(32)}` }, { stage: 1 });
    const placeOf = (content: Hex) => ({ orderHash: ORDER, clauseId: PRIVATE.clauseKey, stage: 1, contentRef: keccak256(content) });

    it("two interleaved keeps both survive", () => {
        window.localStorage.clear();
        const a = contentOf("1");
        const b = contentOf("2");
        // Another tab read the storage before this tab kept `a`, and keeps `b` from that view.
        const before = new Map(keptEntries());
        keepPrivateWitnessContent({ orderHash: ORDER, clauseId: PRIVATE.clauseKey, stage: 1, content: a });
        const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation((key: string) => before.get(key) ?? null);
        try {
            keepPrivateWitnessContent({ orderHash: ORDER, clauseId: PRIVATE.clauseKey, stage: 1, content: b });
        } finally {
            getItem.mockRestore();
        }
        expect(readKeptWitnessContent(placeOf(a))).toBe(a);
        expect(readKeptWitnessContent(placeOf(b))).toBe(b);
    });

    it("one unreadable entry does not hide another, and the next keep does not overwrite it", () => {
        window.localStorage.clear();
        const a = contentOf("1");
        const b = contentOf("2");
        keepPrivateWitnessContent({ orderHash: ORDER, clauseId: PRIVATE.clauseKey, stage: 1, content: a });
        keepPrivateWitnessContent({ orderHash: ORDER, clauseId: PRIVATE.clauseKey, stage: 1, content: b });
        // Break the stored text that holds `a`.
        for (const [key, text] of keptEntries()) if (text.includes(a.slice(2))) window.localStorage.setItem(key, "{not json");
        expect(readKeptWitnessContent(placeOf(a))).toBeNull();
        expect(readKeptWitnessContent(placeOf(b))).toBe(b);
        const c = contentOf("3");
        keepPrivateWitnessContent({ orderHash: ORDER, clauseId: PRIVATE.clauseKey, stage: 1, content: c });
        expect(readKeptWitnessContent(placeOf(b))).toBe(b);
        expect(readKeptWitnessContent(placeOf(c))).toBe(c);
    });
});
