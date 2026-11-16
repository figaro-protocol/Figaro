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
    readKeptWitnessValues,
    resolveHeldWitnessContent,
    unpinWitnessContent,
} from "@/lib/composition/witnessContent";
import { PROVENANCE_LEAF_KEY, provenanceLeafBytes } from "@figaro-protocol/sdk";
import { getClauseSpec, loadClauseSpec, setClauseSpecFetcher } from "@/lib/shared/clauseSpecSource";
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

    it("keeps a private set's bytes and values before anything is sent, and reads them back checked against the content reference", () => {
        window.localStorage.clear();
        const content = privateContent();
        expect(keepPrivateWitnessContent({ orderHash: ORDER, clauseId: PRIVATE.clauseKey, stage: 1, content, values })).toBe("kept");
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
        keepPrivateWitnessContent({ orderHash: ORDER, clauseId: PRIVATE.clauseKey, stage: 1, content, values });
        const stored = JSON.parse(window.localStorage.getItem(KEPT_WITNESS_STORAGE_KEY)!) as Record<string, { content: string }>;
        // Flip one hex digit of the kept bytes.
        for (const entry of Object.values(stored)) entry.content = `${entry.content.slice(0, 65)}${entry.content[65] === "f" ? "0" : "f"}${entry.content.slice(66)}`;
        window.localStorage.setItem(KEPT_WITNESS_STORAGE_KEY, JSON.stringify(stored));
        expect(readKeptWitnessContent({ orderHash: ORDER, clauseId: PRIVATE.clauseKey, stage: 1, contentRef: keccak256(content) })).toBeNull();
    });

    it("keeps nothing for a public set: its bytes are published at their reference", () => {
        window.localStorage.clear();
        expect(keepPrivateWitnessContent({ orderHash: ORDER, clauseId: keyOf("figaro-proximity-policy"), stage: 1, content: proximityContent() })).toBe("public");
        expect(window.localStorage.getItem(KEPT_WITNESS_STORAGE_KEY)).toBeNull();
    });

    it("says refused when the browser will not keep it, so the caller sends nothing", () => {
        window.localStorage.clear();
        const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
        try {
            expect(keepPrivateWitnessContent({ orderHash: ORDER, clauseId: PRIVATE.clauseKey, stage: 1, content: privateContent(), values })).toBe("refused");
        } finally {
            setItem.mockRestore();
        }
    });

    it("resolveHeldWitnessContent reads the kept copy first, and the public pin otherwise", async () => {
        window.localStorage.clear();
        const content = privateContent();
        keepPrivateWitnessContent({ orderHash: ORDER, clauseId: PRIVATE.clauseKey, stage: 1, content, values });
        expect(await resolveHeldWitnessContent({ orderHash: ORDER, clauseId: PRIVATE.clauseKey, stage: 1, contentRef: keccak256(content) })).toBe(content);
    });
});
