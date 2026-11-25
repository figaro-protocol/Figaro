import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { keccak256, toBytes, encodeAbiParameters, decodeFunctionResult, encodeFunctionData, encodeFunctionResult } from "viem";
import { CORE_ABI } from "../src/abis.js";
import {
    buildDomain,
    generateSalt,
    computeDeadline,
    buildCommitment,
    buildCommitmentSafe,
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
    // path (maintainer rule: FigaroCore judges block.timestamp).
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
                token: TOKEN,
                payment: 1000n,
                runningTotal: 1000n,
                checkoutHash: AGREEMENT,
                salt: 42n,
                commitDeadline: 9999n,
            },
            domain,
        );

        expect(commitment.processId).toBe("0x0000000000000000000000000000000000000000000000000000000000000000");
        expect(commitment.buyer).toBe(BUYER);
        expect(commitment.seller).toBe(SELLER);
        expect(commitment.token).toBe(TOKEN);
        expect(commitment.payment).toBe(1000n);
        expect(commitment.runningTotal).toBe(1000n);
        expect(commitment.checkoutHash).toBe(AGREEMENT);
        expect(commitment.salt).toBe(42n);
        expect(commitment.commitDeadline).toBe(9999n);

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
                token: TOKEN,
                payment: 1000n,
                runningTotal: 1000n,
                checkoutHash: AGREEMENT,
                commitDeadline: 1_900_000_000n,
            },
            domain,
        );

        expect(commitment.salt > 0n).toBe(true);
        expect(commitment.commitDeadline).toBe(1_900_000_000n);
    });

    it("builds sub-order commitment with processId and runningTotal", () => {
        const { commitment, typedData } = buildCommitment(
            {
                processId: PROCESS_ID,
                buyer: BUYER,
                seller: SELLER,
                token: TOKEN,
                payment: 500n,
                runningTotal: 1000n,
                checkoutHash: AGREEMENT,
                salt: 7n,
                commitDeadline: 5000n,
            },
            domain,
        );

        expect(commitment.processId).toBe(PROCESS_ID);
        expect(commitment.runningTotal).toBe(1000n);
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
        token: TOKEN,
        payment: 500n,
        runningTotal: 500n,
        checkoutHash: AGREEMENT,
        salt: 12345n,
        commitDeadline: 1700000000n,
    };

    it("COMMITMENT_TYPEHASH is the hash of the type string CommitmentTypes.sol declares", () => {
        // Read from the contract's source, never typed here.
        const source = readFileSync(path.resolve(__dirname, "../../src/core/kernel/CommitmentTypes.sol"), "utf8");
        const literal = /COMMITMENT_TYPEHASH\s*=\s*keccak256\(\s*"([^"]+)"/.exec(source)?.[1];
        expect(literal, "CommitmentTypes.sol declares COMMITMENT_TYPEHASH").toBeDefined();
        expect(COMMITMENT_TYPEHASH).toBe(keccak256(toBytes(literal!)));
    });

    it("hashCommitmentStruct matches an explicit abi.encode (FigaroCore hashStruct)", () => {
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
                    root.token, root.payment, root.runningTotal,
                    root.checkoutHash, root.salt, root.commitDeadline,
                ],
            ),
        );
        expect(hashCommitmentStruct(root)).toBe(explicit);
    });

    // test/fixtures/eip712-vectors.json: the vectors `Eip712ParityTest.t.sol`
    // asserts FigaroCore reproduces (its DOMAIN_SEPARATOR, hashStruct, the
    // root's digest-as-processId and the order hash) and the guest too
    // (prover/lib/tests/eip712_vectors.rs).
    const vectors = JSON.parse(readFileSync(path.resolve(__dirname, "../../test/fixtures/eip712-vectors.json"), "utf8")) as {
        chainId: number;
        verifyingContract: Address;
        vectors: {
            label: string;
            commitment: Record<keyof Commitment, string>;
            structHash: Hex;
            processId: Hex;
            orderHash: Hex;
        }[];
    };
    const asCommitment = (c: Record<keyof Commitment, string>): Commitment => ({
        processId: c.processId as Hex, buyer: c.buyer as Address, seller: c.seller as Address, token: c.token as Address,
        payment: BigInt(c.payment), runningTotal: BigInt(c.runningTotal), checkoutHash: c.checkoutHash as Hex,
        salt: BigInt(c.salt), commitDeadline: BigInt(c.commitDeadline),
    });

    it.each(vectors.vectors.map((v) => [v.label, v] as const))(
        "the %s vector: struct hash, process id and order hash are the ones FigaroCore computes",
        (_label, v) => {
            const c = asCommitment(v.commitment);
            expect(hashCommitmentStruct(c)).toBe(v.structHash);
            expect(computeCommitmentProcessId(c, vectors.chainId, vectors.verifyingContract)).toBe(v.processId);
            expect(computeOrderHash(c, vectors.chainId, vectors.verifyingContract)).toBe(v.orderHash);
        },
    );

    it("the fixture carries a root and a sub-order", () => {
        expect(vectors.vectors.map((v) => v.commitment.processId === ZERO)).toEqual([true, false]);
    });

    it("a sub-order keeps its target processId (no digest)", () => {
        const sub: Commitment = { ...root, processId: `0x${"11".repeat(32)}` as Hex };
        expect(computeCommitmentProcessId(sub, 1, CORE_ADDR)).toBe(sub.processId);
    });
});

describe("buildCommitmentSafe — the sub-order's cumulative value is what FigaroCore checks", () => {
    // A node's answer to FigaroCore.processes(PROCESS_ID): the request is
    // encoded with the Core's ABI (a wrong function or argument throws), and
    // the answer is the ABI-encoded tuple (rootBuyer, token, runningTotal,
    // activeOrderCount) decoded as viem decodes it. Any other read throws.
    const client = {
        readContract: async (req: { address: Address; abi: typeof CORE_ABI; functionName: string; args: readonly unknown[] }) => {
            encodeFunctionData({ abi: req.abi, functionName: req.functionName, args: req.args } as never);
            if (req.address !== CORE_ADDR || req.functionName !== "processes" || req.args[0] !== PROCESS_ID) {
                throw new Error(`unexpected read ${req.functionName}(${req.args.join(",")}) at ${req.address}`);
            }
            const data = encodeFunctionResult({ abi: CORE_ABI, functionName: "processes", result: [BUYER, TOKEN, 700n, 2n] });
            return decodeFunctionResult({ abi: CORE_ABI, functionName: "processes", data });
        },
    } as unknown as Parameters<typeof buildCommitmentSafe>[0];
    const addresses = { core: CORE_ADDR } as Parameters<typeof buildCommitmentSafe>[1];
    const domain = buildDomain(31337, CORE_ADDR);

    it("sets runningTotal to the process's current cumulative value PLUS this order's payment", async () => {
        const { commitment } = await buildCommitmentSafe(client, addresses, {
            processId: PROCESS_ID, buyer: BUYER, seller: SELLER, token: TOKEN, payment: 50n,
            checkoutHash: AGREEMENT, salt: 1n, commitDeadline: 2_000_000n,
        }, domain);
        // FigaroCore: the commitment's runningTotal == the process's runningTotal + payment, else RunningTotalMismatch.
        expect(commitment.runningTotal).toBe(700n + 50n);
        expect(commitment.payment).toBe(50n);
        expect(commitment.processId).toBe(PROCESS_ID);
    });
});
