/**
 * EIP-712 parity vectors — the UNCONDITIONAL cross-language lock.
 *
 * The SDK computes EIP-712 hashes off-chain (the `typedData` a wallet signs to
 * build a commitment); FigaroCore recomputes them on-chain. If the two ever
 * disagree by a single byte, every signature fails. Until now that agreement
 * was only checked by the skipIf-gated live round-trip (`integration.test.ts`)
 * — nothing ran in CI without a chain.
 *
 * This file freezes a set of SDK-computed vectors into
 * `test/fixtures/eip712-vectors.json`; `test/core/kernel/Eip712ParityTest.t.sol` reads that
 * same file and asserts FigaroCore reproduces every hash. Foundry CI
 * runs it unconditionally — no chain, no skipIf.
 *
 * This test has two jobs:
 *   1. Regenerate the fixture on `HARVEST_EIP712_VECTORS=1` (like the golden
 *      vectors' HARVEST flow).
 *   2. Otherwise, assert the SDK STILL reproduces the frozen fixture bytes — so
 *      the SDK side of the lock cannot silently drift either. FigaroCore is
 *      frozen, so these bytes are constants; a diff here means the SDK's
 *      EIP-712 encoding changed and the fixture must be re-harvested (and the
 *      Foundry side re-checked) deliberately.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
    hashCommitmentStruct,
    computeCommitmentProcessId,
    computeOrderHash,
    type Commitment,
} from "../src/index.js";
import { RESOLVE_PROCESS_TYPES } from "../src/commitments.js";
import { keccak256, encodeAbiParameters, hashStruct, hashTypedData, toBytes, type Hex } from "viem";

const FIXTURE_PATH = path.resolve(__dirname, "../../test/fixtures/eip712-vectors.json");

const CHAIN_ID = 31337;
// Foundry's deterministic deployer for FigaroCore in the parity tests — the
// verifyingContract is part of the EIP-712 domain, so it must be pinned.
const VERIFYING_CONTRACT = "0x2e234DAe75C793f67A35089C9d99245E1C58470b" as const;

// The EIP-712 domain separator, computed the way FigaroCore's constructor does
// (EIP712("FigaroCore", "3")). The SDK builds `typedData` from the same domain;
// pinning it here lets the Foundry side assert byte-equality with its own
// DOMAIN_SEPARATOR().
function domainSeparator(chainId: number, verifyingContract: Hex): Hex {
    return keccak256(
        encodeAbiParameters(
            [{ type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" }, { type: "uint256" }, { type: "address" }],
            [
                keccak256(toBytes("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")),
                keccak256(toBytes("FigaroCore")),
                keccak256(toBytes("3")),
                BigInt(chainId),
                verifyingContract,
            ],
        ),
    );
}

const ROOT: Commitment = {
    processId: "0x0000000000000000000000000000000000000000000000000000000000000000",
    buyer: "0x0376AAc07Ad725E01357B1725B5ceC61aE10473c",
    seller: "0xAd29D7a8aD3639F97798c768202F27C1dE81DC55",
    currency: "0x5615dEB798BB3E4dFa0139dFa1b3D433Cc23b72f",
    payment: 100_000_000_000_000_000_000n,
    expectedCumulativeValue: 100_000_000_000_000_000_000n,
    agreementHash: keccak256(toBytes("root-agreement")),
    salt: 42n,
    deadline: 2000n,
};

// A sub-order: processId is a real (non-zero) value the party targets, so the
// order hash uses that processId directly rather than the derived digest.
const SUB: Commitment = {
    processId: "0x83118784bdf5c22406e4bd1877f8a6cc53da421295721b5fdc99cd7a5dc4f3c4",
    buyer: "0x0376AAc07Ad725E01357B1725B5ceC61aE10473c",
    seller: "0xC22667C5926d1C9af6C0fa8Cedc4ea3e489F6F70",
    currency: "0x5615dEB798BB3E4dFa0139dFa1b3D433Cc23b72f",
    payment: 50_000_000_000_000_000_000n,
    expectedCumulativeValue: 150_000_000_000_000_000_000n,
    agreementHash: keccak256(toBytes("sub-agreement")),
    salt: 43n,
    deadline: 2000n,
};

function commitmentToJson(c: Commitment) {
    return {
        processId: c.processId,
        buyer: c.buyer,
        seller: c.seller,
        currency: c.currency,
        payment: c.payment.toString(),
        expectedCumulativeValue: c.expectedCumulativeValue.toString(),
        agreementHash: c.agreementHash,
        salt: c.salt.toString(),
        deadline: c.deadline.toString(),
    };
}

function vectorFor(label: string, c: Commitment) {
    return {
        label,
        commitment: commitmentToJson(c),
        structHash: hashCommitmentStruct(c),
        processId: computeCommitmentProcessId(c, CHAIN_ID, VERIFYING_CONTRACT),
        orderHash: computeOrderHash(c, CHAIN_ID, VERIFYING_CONTRACT),
    };
}

// ── The batch path's three authorizations ──────────────────────────────────
//
// Not FigaroCore types: on the batch path a signature stands where the direct
// path reads `msg.sender`, and the guest checks it
// (`prover/lib/src/eip712.rs`). The domain is the VERIFIER's. The hashes
// below are viem's, from the type strings alone;
// `prover/lib/tests/eip712_vectors.rs` asserts the guest's.
const BATCH_VERIFIER = "0xF62849F9A0B5Bf2913b396098F7c7019b51A820a" as const;

const ATTEST_SELLER_TYPES = {
    AttestSeller: [
        { name: "orderHash", type: "bytes32" },
        { name: "clauseId", type: "bytes32" },
        { name: "stage", type: "uint8" },
        { name: "contentRef", type: "bytes32" },
    ],
} as const;

const ATTEST_BUYER_TYPES = {
    AttestBuyer: [
        { name: "processId", type: "bytes32" },
        { name: "orderHash", type: "bytes32" },
        { name: "clauseId", type: "bytes32" },
        { name: "stage", type: "uint8" },
        { name: "contentRef", type: "bytes32" },
    ],
} as const;

function batchVectors() {
    const domain = {
        name: "FigaroCore",
        version: "3",
        chainId: CHAIN_ID,
        verifyingContract: BATCH_VERIFIER,
    } as const;
    const processId = keccak256(toBytes("batch-process"));
    const orderHash = keccak256(toBytes("batch-order"));
    const clauseId = keccak256(toBytes("batch-clause"));
    const contentRef = keccak256(toBytes("batch-content"));
    const resolve = { processId };
    const authorizations = [1, 0, 255].flatMap((stage) => {
        const seller = { orderHash, clauseId, stage, contentRef };
        const buyer = { processId, orderHash, clauseId, stage, contentRef };
        return [
            {
                type: "AttestSeller",
                message: seller,
                structHash: hashStruct({ types: ATTEST_SELLER_TYPES, primaryType: "AttestSeller", data: seller }),
                digest: hashTypedData({ domain, types: ATTEST_SELLER_TYPES, primaryType: "AttestSeller", message: seller }),
            },
            {
                type: "AttestBuyer",
                message: buyer,
                structHash: hashStruct({ types: ATTEST_BUYER_TYPES, primaryType: "AttestBuyer", data: buyer }),
                digest: hashTypedData({ domain, types: ATTEST_BUYER_TYPES, primaryType: "AttestBuyer", message: buyer }),
            },
        ];
    });
    return {
        verifyingContract: BATCH_VERIFIER,
        domainSeparator: domainSeparator(CHAIN_ID, BATCH_VERIFIER),
        authorizations: [
            {
                type: "ResolveProcess",
                message: resolve,
                structHash: hashStruct({ types: RESOLVE_PROCESS_TYPES, primaryType: "ResolveProcess", data: resolve }),
                digest: hashTypedData({ domain, types: RESOLVE_PROCESS_TYPES, primaryType: "ResolveProcess", message: resolve }),
            },
            ...authorizations,
        ],
    };
}

function build() {
    return {
        chainId: CHAIN_ID,
        verifyingContract: VERIFYING_CONTRACT,
        domainSeparator: domainSeparator(CHAIN_ID, VERIFYING_CONTRACT),
        vectors: [vectorFor("root", ROOT), vectorFor("sub", SUB)],
        batch: batchVectors(),
    };
}

describe("EIP-712 parity vectors — the cross-language lock", () => {
    if (process.env.HARVEST_EIP712_VECTORS === "1") {
        it("regenerates test/fixtures/eip712-vectors.json", () => {
            mkdirSync(path.dirname(FIXTURE_PATH), { recursive: true });
            writeFileSync(FIXTURE_PATH, `${JSON.stringify(build(), null, 4)}\n`);
        });
        return;
    }

    it("the SDK reproduces the frozen fixture byte-for-byte", () => {
        expect(existsSync(FIXTURE_PATH), "fixture missing — harvest with HARVEST_EIP712_VECTORS=1").toBe(true);
        const frozen = readFileSync(FIXTURE_PATH, "utf8");
        expect(`${JSON.stringify(build(), null, 4)}\n`).toBe(frozen);
    });
});
