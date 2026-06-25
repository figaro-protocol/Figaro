import { describe, expect, it, vi } from "vitest";
import { encodeFunctionData, type PublicClient } from "viem";
import { clauseIdHash } from "@/lib/shared/evm";
import { DISCLOSURE_KIND } from "@/lib/mechanisms/contracts";
import {
    decodeMeasurementGramsContent,
    getAttestationContent,
} from "@/lib/mechanisms/useGHGDisclosure";
import { ATTESTATION_COORDINATOR_ABI } from "@/lib/core/contracts";
import { encodeContentFromSpec, parseClauseSpec } from "@figaro/core/clauses";
import { readFileSync } from "node:fs";
import path from "node:path";

// Test-local grams encoder — the canonical Layer-A spec drives the byte shape
// (`abi.encode(uint256 grams)`), exactly what the generic capability rail
// produces in production. The spec is read from the canonical `clauses/` seed
// (the same JSON the on-chain `metadataURI` points at), never a bundled list.
// Tests may name a clause; production code may not.
const _ghgParsed = parseClauseSpec(
    JSON.parse(readFileSync(path.resolve(process.cwd(), "../clauses/figaro-ghg-measurement.json"), "utf8")),
);
if (!_ghgParsed.ok) throw new Error("ghg-measurement spec failed to parse");
const GHG_MEASUREMENT_SPEC = _ghgParsed.spec;
function gramsContent(grams: bigint): `0x${string}` {
    return encodeContentFromSpec(GHG_MEASUREMENT_SPEC, { grams: grams.toString() });
}

const DISCLOSURE_CLAUSE_ID_HASH = clauseIdHash("figaro-ghg-iso-14064", 1);

describe("decodeMeasurementGramsContent", () => {
    it("decodes a 32-byte abi.encode(uint256) back to bigint", () => {
        const content = gramsContent(1250n);
        expect(decodeMeasurementGramsContent(content)).toBe(1250n);
    });

    it("returns null for null/empty/zero content", () => {
        expect(decodeMeasurementGramsContent(null)).toBeNull();
        expect(decodeMeasurementGramsContent(undefined)).toBeNull();
        expect(decodeMeasurementGramsContent("0x")).toBeNull();
        expect(decodeMeasurementGramsContent(("0x" + "00".repeat(32)) as `0x${string}`)).toBeNull();
    });
});

describe("getAttestationContent", () => {
    function makeClientWithCalldata(input: `0x${string}`): PublicClient {
        return {
            getTransaction: vi.fn().mockResolvedValue({ input }),
        } as unknown as PublicClient;
    }

    const COMMITMENT_ZERO = {
        processId: `0x${"00".repeat(32)}` as `0x${string}`,
        buyer: `0x${"00".repeat(20)}` as `0x${string}`,
        seller: `0x${"00".repeat(20)}` as `0x${string}`,
        currency: `0x${"00".repeat(20)}` as `0x${string}`,
        payment: 0n,
        expectedCumulativeValue: 0n,
        agreementHash: `0x${"00".repeat(32)}` as `0x${string}`,
        salt: 0n,
        deadline: 0n,
    };

    it("recovers the bytes content arg from an attestAsSeller calldata", async () => {
        const grams = gramsContent(4242n);
        const calldata = encodeFunctionData({
            abi: ATTESTATION_COORDINATOR_ABI,
            functionName: "attestAsSeller",
            // Signature: (role, target, clauseId, stage, sectionData, proof, content)
            args: [
                COMMITMENT_ZERO,
                COMMITMENT_ZERO,
                DISCLOSURE_CLAUSE_ID_HASH,
                DISCLOSURE_KIND.inventory,
                "0x" as `0x${string}`,
                [] as readonly `0x${string}`[],
                grams,
            ],
        });
        const client = makeClientWithCalldata(calldata);
        const content = await getAttestationContent(client, ("0x" + "ab".repeat(32)) as `0x${string}`);
        expect(content).toBe(grams);
        expect(decodeMeasurementGramsContent(content)).toBe(4242n);
    });

    it("recovers the bytes content arg from an attestAsBuyer calldata", async () => {
        const grams = gramsContent(99n);
        const calldata = encodeFunctionData({
            abi: ATTESTATION_COORDINATOR_ABI,
            functionName: "attestAsBuyer",
            // Signature: (target, clauseId, stage, sectionData, proof, content)
            args: [
                COMMITMENT_ZERO,
                DISCLOSURE_CLAUSE_ID_HASH,
                DISCLOSURE_KIND.inventory,
                "0x" as `0x${string}`,
                [] as readonly `0x${string}`[],
                grams,
            ],
        });
        const client = makeClientWithCalldata(calldata);
        const content = await getAttestationContent(client, ("0x" + "cd".repeat(32)) as `0x${string}`);
        expect(content).toBe(grams);
    });

    it("returns null when the tx calldata is for some other function", async () => {
        const client = makeClientWithCalldata("0xdeadbeef");
        expect(
            await getAttestationContent(client, ("0x" + "ef".repeat(32)) as `0x${string}`),
        ).toBeNull();
    });

    it("returns null when getTransaction throws", async () => {
        const client = {
            getTransaction: vi.fn().mockRejectedValue(new Error("network")),
        } as unknown as PublicClient;
        expect(
            await getAttestationContent(client, ("0x" + "ef".repeat(32)) as `0x${string}`),
        ).toBeNull();
    });

    it("returns null when the tx has no input data", async () => {
        const client = makeClientWithCalldata("0x");
        expect(
            await getAttestationContent(client, ("0x" + "ef".repeat(32)) as `0x${string}`),
        ).toBeNull();
    });
});
