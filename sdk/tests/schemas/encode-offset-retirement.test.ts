import { describe, expect, it } from "vitest";
import { decodeAbiParameters, type Hex } from "viem";
import {
    encodeOffsetRetirementContent,
    type OffsetRetirementContent,
} from "../../src/schemas/encode.js";
import { parseSchemaSpec } from "../../src/schemas/spec.js";
import { validateContent } from "../../src/schemas/validate.js";
import offsetRetirementSpecRaw from "../../src/schemas/examples/figaro-offset-retirement-v1.json" with { type: "json" };

const ADDR_AGG: Hex = `0x${"a1".repeat(20)}`;
const ADDR_TOKEN: Hex = `0x${"b2".repeat(20)}`;
const ADDR_BEN: Hex = `0x${"c3".repeat(20)}`;
const TX_HASH: Hex = `0x${"d4".repeat(32)}`;
const ZERO_ADDR: Hex = `0x${"00".repeat(20)}`;
const ZERO_HASH: Hex = `0x${"00".repeat(32)}`;

function decode(bytes: Hex): readonly [number, Hex, Hex, bigint, Hex, Hex, bigint] {
    return decodeAbiParameters(
        [
            { type: "uint8" },
            { type: "address" },
            { type: "address" },
            { type: "uint256" },
            { type: "address" },
            { type: "bytes32" },
            { type: "uint256" },
        ],
        bytes,
    ) as readonly [number, Hex, Hex, bigint, Hex, Hex, bigint];
}

// tonsRetired is expressed in 1e18 fixed-point (1e18 = 1 tonne), matching
// the ERC-20 carbon-token convention (decimals=18) the aggregators use.
// 1.5 tonnes = 1.5e18.
const SAMPLE: OffsetRetirementContent = {
    provider: "klima",
    aggregatorAddress: ADDR_AGG,
    inputToken: ADDR_TOKEN,
    inputAmount: 100n * 10n ** 18n,
    beneficiary: ADDR_BEN,
    retirementTxHash: TX_HASH,
    tonsRetired: 1_500_000_000_000_000_000n,
};

describe("figaro-offset-retirement-v1 — spec", () => {
    it("spec parses cleanly", () => {
        const result = parseSchemaSpec(offsetRetirementSpecRaw);
        expect(result.ok).toBe(true);
    });

    it("accepts each known provider", () => {
        const parsed = parseSchemaSpec(offsetRetirementSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        for (const p of ["klima", "toucan", "custom"]) {
            const content = {
                provider: p,
                aggregatorAddress: ADDR_AGG,
                inputToken: ADDR_TOKEN,
                inputAmount: "100",
                beneficiary: ADDR_BEN,
                retirementTxHash: TX_HASH,
                tonsRetired: "1500000000000000000",
            };
            expect(validateContent(content, parsed.spec).ok).toBe(true);
        }
    });

    it("rejects unknown provider", () => {
        const parsed = parseSchemaSpec(offsetRetirementSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        const content = {
            provider: "moss",
            aggregatorAddress: ADDR_AGG,
            inputToken: ADDR_TOKEN,
            inputAmount: "100",
            beneficiary: ADDR_BEN,
            retirementTxHash: TX_HASH,
            tonsRetired: "1500000000000000000",
        };
        expect(validateContent(content, parsed.spec).ok).toBe(false);
    });

    it("rejects malformed aggregatorAddress", () => {
        const parsed = parseSchemaSpec(offsetRetirementSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        const content = {
            provider: "klima",
            aggregatorAddress: "0xdeadbeef",
            inputToken: ADDR_TOKEN,
            inputAmount: "100",
            beneficiary: ADDR_BEN,
            retirementTxHash: TX_HASH,
            tonsRetired: "1500000000000000000",
        };
        expect(validateContent(content, parsed.spec).ok).toBe(false);
    });

    it("rejects malformed retirementTxHash", () => {
        const parsed = parseSchemaSpec(offsetRetirementSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        const content = {
            provider: "klima",
            aggregatorAddress: ADDR_AGG,
            inputToken: ADDR_TOKEN,
            inputAmount: "100",
            beneficiary: ADDR_BEN,
            retirementTxHash: "0xnothex",
            tonsRetired: "1500000000000000000",
        };
        expect(validateContent(content, parsed.spec).ok).toBe(false);
    });

    it("rejects zero tonsRetired (min 1)", () => {
        const parsed = parseSchemaSpec(offsetRetirementSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        const content = {
            provider: "klima",
            aggregatorAddress: ADDR_AGG,
            inputToken: ADDR_TOKEN,
            inputAmount: "100",
            beneficiary: ADDR_BEN,
            retirementTxHash: TX_HASH,
            tonsRetired: "0",
        };
        expect(validateContent(content, parsed.spec).ok).toBe(false);
    });

    it("rejects zero inputAmount (min 1)", () => {
        const parsed = parseSchemaSpec(offsetRetirementSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        const content = {
            provider: "klima",
            aggregatorAddress: ADDR_AGG,
            inputToken: ADDR_TOKEN,
            inputAmount: "0",
            beneficiary: ADDR_BEN,
            retirementTxHash: TX_HASH,
            tonsRetired: "1500000000000000000",
        };
        expect(validateContent(content, parsed.spec).ok).toBe(false);
    });

    it("rejects missing required fields", () => {
        const parsed = parseSchemaSpec(offsetRetirementSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        const content = {
            provider: "klima",
            aggregatorAddress: ADDR_AGG,
            inputToken: ADDR_TOKEN,
            // inputAmount missing
            beneficiary: ADDR_BEN,
            retirementTxHash: TX_HASH,
            tonsRetired: "1500000000000000000",
        };
        expect(validateContent(content, parsed.spec).ok).toBe(false);
    });
});

describe("figaro-offset-retirement-v1 — encode/decode round-trip", () => {
    it("encodes and decodes a sample retirement exactly", () => {
        const bytes = encodeOffsetRetirementContent(SAMPLE);
        const [providerIdx, aggregator, inputToken, inputAmount, beneficiary, txHash, tonsRetired] = decode(bytes);
        expect(providerIdx).toBe(1); // klima
        expect(aggregator.toLowerCase()).toBe(ADDR_AGG.toLowerCase());
        expect(inputToken.toLowerCase()).toBe(ADDR_TOKEN.toLowerCase());
        expect(inputAmount).toBe(100n * 10n ** 18n);
        expect(beneficiary.toLowerCase()).toBe(ADDR_BEN.toLowerCase());
        expect(txHash.toLowerCase()).toBe(TX_HASH.toLowerCase());
        expect(tonsRetired).toBe(1_500_000_000_000_000_000n);
    });

    it("maps each provider to its expected on-chain index", () => {
        const expected: Array<[OffsetRetirementContent["provider"], number]> = [
            ["klima", 1],
            ["toucan", 2],
            ["custom", 3],
        ];
        for (const [provider, idx] of expected) {
            const bytes = encodeOffsetRetirementContent({ ...SAMPLE, provider });
            const [providerIdx] = decode(bytes);
            expect(providerIdx).toBe(idx);
        }
    });

    it("encodes deterministically", () => {
        expect(encodeOffsetRetirementContent(SAMPLE)).toBe(encodeOffsetRetirementContent(SAMPLE));
    });

    it("preserves a large tonsRetired through round-trip", () => {
        const big = { ...SAMPLE, tonsRetired: 2n ** 200n };
        const bytes = encodeOffsetRetirementContent(big);
        const [, , , , , , tons] = decode(bytes);
        expect(tons).toBe(2n ** 200n);
    });

    it("encodes tonsRetired = 1n (smallest valid, far below 1 tonne)", () => {
        // The validator only checks `> 0`; a value of 1n is a vanishingly
        // small fractional tonne (1 / 1e18), but still a well-formed receipt.
        // The encoder is unit-agnostic — it must round-trip 1n cleanly.
        const tiny = { ...SAMPLE, tonsRetired: 1n };
        const bytes = encodeOffsetRetirementContent(tiny);
        const [, , , , , , tons] = decode(bytes);
        expect(tons).toBe(1n);
    });

    it("does NOT validate boundary constraints at encode time (validator is on-chain)", () => {
        // The encoder is a thin ABI bridge; it does not refuse zero addresses
        // or zero amounts. The on-chain validator + Layer A spec are the gates.
        // This test pins the encoder's narrow contract.
        const zeros: OffsetRetirementContent = {
            provider: "klima",
            aggregatorAddress: ZERO_ADDR,
            inputToken: ZERO_ADDR,
            inputAmount: 0n,
            beneficiary: ZERO_ADDR,
            retirementTxHash: ZERO_HASH,
            tonsRetired: 0n,
        };
        // No throw; encode is total over well-typed inputs.
        expect(() => encodeOffsetRetirementContent(zeros)).not.toThrow();
    });
});
