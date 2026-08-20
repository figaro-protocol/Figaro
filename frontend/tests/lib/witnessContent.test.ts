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
import {
    fetchWitnessContent,
    publishWitnessContent,
    unpinWitnessContent,
} from "@/lib/composition/witnessContent";
import { getClauseSpec, loadClauseSpec, setClauseSpecFetcher } from "@/lib/shared/clauseSpecSource";
import { primeClauseSpecs } from "./primeClauseSpecs";

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
    ],
    stages: {
        "1": [
            { name: "secretReading", type: "string", required: true, disposition: "private" },
        ],
    },
};

beforeAll(async () => {
    await primeClauseSpecs(["figaro-proximity-policy"]);
    setClauseSpecFetcher(async () => PRIVATE_SPEC);
    await loadClauseSpec("test-private-witness", 1, "mem://test-private-witness");
});

function proximityContent(): Hex {
    const spec = getClauseSpec("figaro-proximity-policy");
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
            clauseId: "figaro-proximity-policy",
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
        await publishWitnessContent({
            clauseId: "figaro-proximity-policy",
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
            clauseId: "figaro-proximity-policy",
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
            clauseId: "test-private-witness",
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
            clauseId: "never-loaded-clause",
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
            clauseId: "figaro-proximity-policy",
            stage: 1,
            content: proximityContent(),
            ipfs: { pinKeccakRawBlock },
        })).resolves.toBeUndefined();
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

    it("swallows an unpin failure (content stays pinned, erasure stays idempotent)", async () => {
        const unpin = vi.fn().mockRejectedValue(new Error("node down"));
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        await expect(unpinWitnessContent(GOLDEN_REF, { unpin })).resolves.toBeUndefined();
        expect(warn).toHaveBeenCalledOnce();
        warn.mockRestore();
    });

    it("is a no-op on a malformed fingerprint", async () => {
        const unpin = vi.fn();
        await unpinWitnessContent("not-a-ref", { unpin });
        expect(unpin).not.toHaveBeenCalled();
    });
});
