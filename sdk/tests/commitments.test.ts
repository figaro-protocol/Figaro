import { describe, it, expect, vi, beforeEach } from "vitest";
import { keccak256, toBytes, encodeAbiParameters, encodePacked, hashTypedData } from "viem";
import {
    buildDomain,
    generateSalt,
    computeDeadline,
    buildCommitment,
    COMMITMENT_TYPES,
    COMMITMENT_TYPEHASH,
    hashCommitmentStruct,
    computeCommitmentProcessId,
    computeOrderHash,
} from "../src/commitments.js";
import type { Address, Hex, EIP712Domain, Commitment } from "../src/types.js";

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
    // CHAIN time in, deadline out — there is deliberately no machine-clock
    // path (maintainer rule 2026-08-06: the kernel judges block.timestamp).
    it("adds the default 1-hour TTL to the chain's clock", () => {
        expect(computeDeadline(1_750_000_000n)).toBe(1_750_000_000n + 3600n);
    });

    it("accepts custom TTL", () => {
        expect(computeDeadline(1_750_000_000n, 300)).toBe(1_750_000_300n);
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

    it("auto-generates salt when omitted; deadline is the caller's chain time", () => {
        const { commitment } = buildCommitment(
            {
                processId: "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex,
                buyer: BUYER,
                seller: SELLER,
                currency: TOKEN,
                payment: 1000n,
                expectedCumulativeValue: 1000n,
                agreementHash: AGREEMENT,
                deadline: 1_900_000_000n,
            },
            domain,
        );

        expect(commitment.salt > 0n).toBe(true);
        expect(commitment.deadline).toBe(1_900_000_000n);
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

describe("order-hash derivation (mirrors CommitmentTypes.sol)", () => {
    const ZERO = `0x${"0".repeat(64)}` as Hex;
    const root: Commitment = {
        processId: ZERO,
        buyer: BUYER,
        seller: SELLER,
        currency: TOKEN,
        payment: 500n,
        expectedCumulativeValue: 500n,
        agreementHash: AGREEMENT,
        salt: 12345n,
        deadline: 1700000000n,
    };

    it("COMMITMENT_TYPEHASH equals the kernel's literal type string", () => {
        const literal =
            "Commitment(bytes32 processId,address buyer,address seller,address currency," +
            "uint256 payment,uint256 expectedCumulativeValue,bytes32 agreementHash," +
            "uint256 salt,uint256 deadline)";
        expect(COMMITMENT_TYPEHASH).toBe(keccak256(toBytes(literal)));
    });

    it("hashCommitmentStruct matches an explicit abi.encode (kernel hashStruct)", () => {
        const explicit = keccak256(
            encodeAbiParameters(
                [
                    { type: "bytes32" }, { type: "bytes32" }, { type: "address" },
                    { type: "address" }, { type: "address" }, { type: "uint256" },
                    { type: "uint256" }, { type: "bytes32" }, { type: "uint256" },
                    { type: "uint256" },
                ],
                [
                    COMMITMENT_TYPEHASH, root.processId, root.buyer, root.seller,
                    root.currency, root.payment, root.expectedCumulativeValue,
                    root.agreementHash, root.salt, root.deadline,
                ],
            ),
        );
        expect(hashCommitmentStruct(root)).toBe(explicit);
    });

    it("computeOrderHash for a root order matches the kernel formula", () => {
        const processId = hashTypedData({
            domain: buildDomain(1, CORE_ADDR),
            types: COMMITMENT_TYPES,
            primaryType: "Commitment",
            message: root,
        });
        expect(computeCommitmentProcessId(root, 1, CORE_ADDR)).toBe(processId);
        const structHash = hashCommitmentStruct(root);
        const expected = keccak256(encodePacked(["bytes32", "bytes32"], [processId, structHash]));
        expect(computeOrderHash(root, 1, CORE_ADDR)).toBe(expected);
    });

    it("a sub-order keeps its target processId (no digest)", () => {
        const sub: Commitment = { ...root, processId: `0x${"11".repeat(32)}` as Hex };
        expect(computeCommitmentProcessId(sub, 1, CORE_ADDR)).toBe(sub.processId);
    });
});
