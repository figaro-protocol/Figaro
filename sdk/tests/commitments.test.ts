import { describe, it, expect, vi, beforeEach } from "vitest";
import {
    buildDomain,
    generateSalt,
    computeDeadline,
    buildCommitment,
    COMMITMENT_TYPES,
} from "../src/commitments.js";
import type { Address, Hex, EIP712Domain } from "../src/types.js";

const CORE_ADDR = "0x1234567890abcdef1234567890abcdef12345678" as Address;
const BUYER = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address;
const SELLER = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address;
const TOKEN = "0xcccccccccccccccccccccccccccccccccccccccc" as Address;
const AGREEMENT = "0x0000000000000000000000000000000000000000000000000000000000000001" as Hex;
const PROCESS_ID = "0x0000000000000000000000000000000000000000000000000000000000000abc" as Hex;

describe("buildDomain", () => {
    it("constructs EIP-712 domain for FigaroCore", () => {
        const domain = buildDomain(31337, CORE_ADDR);
        expect(domain.name).toBe("FigaroCore");
        expect(domain.version).toBe("3");
        expect(domain.chainId).toBe(31337);
        expect(domain.verifyingContract).toBe(CORE_ADDR);
    });
});

describe("generateSalt", () => {
    it("produces a bigint", () => {
        const salt = generateSalt();
        expect(typeof salt).toBe("bigint");
        expect(salt > 0n).toBe(true);
    });

    it("produces distinct values", () => {
        const salts = new Set(Array.from({ length: 10 }, () => generateSalt()));
        expect(salts.size).toBe(10);
    });
});

describe("computeDeadline", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2025-06-01T00:00:00Z"));
    });

    it("defaults to 1 hour from now", () => {
        const dl = computeDeadline();
        const now = BigInt(Math.floor(Date.now() / 1000));
        expect(dl).toBe(now + 3600n);
        vi.useRealTimers();
    });

    it("accepts custom TTL", () => {
        const dl = computeDeadline(300);
        const now = BigInt(Math.floor(Date.now() / 1000));
        expect(dl).toBe(now + 300n);
        vi.useRealTimers();
    });
});

describe("buildCommitment", () => {
    const domain: EIP712Domain = buildDomain(31337, CORE_ADDR);

    it("builds typed data with deterministic salt/deadline", () => {
        const { commitment, typedData } = buildCommitment(
            {
                processId: "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex,
                buyer: BUYER,
                seller: SELLER,
                currency: TOKEN,
                payment: 1000n,
                expectedCumulativeValue: 1000n,
                agreementHash: AGREEMENT,
                salt: 42n,
                deadline: 9999n,
            },
            domain,
        );

        expect(commitment.processId).toBe("0x0000000000000000000000000000000000000000000000000000000000000000");
        expect(commitment.buyer).toBe(BUYER);
        expect(commitment.seller).toBe(SELLER);
        expect(commitment.currency).toBe(TOKEN);
        expect(commitment.payment).toBe(1000n);
        expect(commitment.expectedCumulativeValue).toBe(1000n);
        expect(commitment.agreementHash).toBe(AGREEMENT);
        expect(commitment.salt).toBe(42n);
        expect(commitment.deadline).toBe(9999n);

        expect(typedData.domain).toBe(domain);
        expect(typedData.types).toBe(COMMITMENT_TYPES);
        expect(typedData.primaryType).toBe("Commitment");
        expect(typedData.message).toBe(commitment);
    });

    it("auto-generates salt and deadline when omitted", () => {
        const { commitment } = buildCommitment(
            {
                processId: "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex,
                buyer: BUYER,
                seller: SELLER,
                currency: TOKEN,
                payment: 1000n,
                expectedCumulativeValue: 1000n,
                agreementHash: AGREEMENT,
            },
            domain,
        );

        expect(commitment.salt > 0n).toBe(true);
        expect(commitment.deadline > 0n).toBe(true);
    });

    it("builds sub-order commitment with processId and expectedCumulativeValue", () => {
        const { commitment, typedData } = buildCommitment(
            {
                processId: PROCESS_ID,
                buyer: BUYER,
                seller: SELLER,
                currency: TOKEN,
                payment: 500n,
                expectedCumulativeValue: 1000n,
                agreementHash: AGREEMENT,
                salt: 7n,
                deadline: 5000n,
            },
            domain,
        );

        expect(commitment.processId).toBe(PROCESS_ID);
        expect(commitment.expectedCumulativeValue).toBe(1000n);
        expect(commitment.payment).toBe(500n);

        expect(typedData.types).toBe(COMMITMENT_TYPES);
        expect(typedData.primaryType).toBe("Commitment");
    });
});
