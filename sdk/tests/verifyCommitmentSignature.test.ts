/**
 * verifyCommitmentSignature.test.ts — the canonical EIP-712 Commitment
 * signature check (the primitive the frontend pin-gate and acceptOrder
 * hardenings depend on). A real signature recovers to its
 * signer; a forged one, a cross-party one, or one against a tampered struct
 * does not.
 */
import { describe, it, expect } from "vitest";
import { createWalletClient, http, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { buildDomain, COMMITMENT_TYPES, RESOLVE_PROCESS_TYPES, verifyCommitmentSignature, verifyResolveProcessSignature } from "../src/commitments.js";
import type { Commitment } from "../src/types.js";

const BUYER = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"); // anvil[0]
const SELLER = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"); // anvil[1]
const CORE = "0x000000000000000000000000000000000000c0de" as Address;
const CHAIN = 31337;
const CTX = { chainId: CHAIN, core: CORE };

const buyerW = createWalletClient({ account: BUYER, transport: http("http://localhost:0") });

const commitment: Commitment = {
    processId: `0x${"00".repeat(32)}`,
    buyer: BUYER.address,
    seller: SELLER.address,
    currency: "0x000000000000000000000000000000000000ca11" as Address,
    payment: 1000n,
    expectedCumulativeValue: 1000n,
    deadline: 9_999_999_999n,
    checkoutHash: `0x${"ab".repeat(32)}`,
    salt: 42n,
};

async function sign(c: Commitment) {
    return buyerW.signTypedData({
        account: BUYER,
        domain: buildDomain(CHAIN, CORE),
        types: COMMITMENT_TYPES,
        primaryType: "Commitment",
        message: c,
    });
}

describe("verifyCommitmentSignature", () => {
    it("recovers a genuine signature to its signer", async () => {
        const sig = await sign(commitment);
        expect(await verifyCommitmentSignature(commitment, sig, BUYER.address, CTX)).toBe(true);
    });

    it("rejects a signature checked against the WRONG party (the pin-gate forgery case)", async () => {
        const sig = await sign(commitment);
        // The buyer really signed, but we ask whether the SELLER did — a
        // targeted attacker who signs their own payload naming the victim.
        expect(await verifyCommitmentSignature(commitment, sig, SELLER.address, CTX)).toBe(false);
    });

    it("rejects a signature against a tampered commitment (payment moved)", async () => {
        const sig = await sign(commitment);
        const tampered = { ...commitment, payment: 999_999n };
        expect(await verifyCommitmentSignature(tampered, sig, BUYER.address, CTX)).toBe(false);
    });

    it("rejects a garbage signature", async () => {
        expect(await verifyCommitmentSignature(commitment, `0x${"00".repeat(65)}`, BUYER.address, CTX)).toBe(false);
    });

    it("rejects a signature bound to a different domain (chainId)", async () => {
        const sig = await sign(commitment);
        expect(await verifyCommitmentSignature(commitment, sig, BUYER.address, { chainId: 1, core: CORE })).toBe(false);
    });
});

describe("verifyResolveProcessSignature — the batch path's signed resolve", () => {
    // For batched trade the EIP-712 verifyingContract is the FigaroBatchVerifier.
    const VERIFIER = "0x0000000000000000000000000000000000ba7c00" as Address;
    const VCTX = { chainId: CHAIN, core: VERIFIER };
    const PROCESS = `0x${"09".repeat(32)}` as const;

    async function signResolve(processId: `0x${string}`, cumulativeValue: bigint) {
        return buyerW.signTypedData({
            account: BUYER,
            domain: buildDomain(CHAIN, VERIFIER),
            types: RESOLVE_PROCESS_TYPES,
            primaryType: "ResolveProcess",
            message: { processId, cumulativeValue },
        });
    }

    it("recovers the buyer's resolve signature over the process and its cumulative value", async () => {
        const sig = await signResolve(PROCESS, 1000n);
        expect(await verifyResolveProcessSignature(PROCESS, 1000n, sig, BUYER.address, VCTX)).toBe(true);
    });

    it("rejects it against another signer", async () => {
        const sig = await signResolve(PROCESS, 1000n);
        expect(await verifyResolveProcessSignature(PROCESS, 1000n, sig, SELLER.address, VCTX)).toBe(false);
    });

    it("rejects it at another cumulative value (an order added after the signature)", async () => {
        const sig = await signResolve(PROCESS, 1000n);
        expect(await verifyResolveProcessSignature(PROCESS, 1001n, sig, BUYER.address, VCTX)).toBe(false);
    });

    it("rejects it for another process", async () => {
        const sig = await signResolve(PROCESS, 1000n);
        expect(await verifyResolveProcessSignature(`0x${"0a".repeat(32)}`, 1000n, sig, BUYER.address, VCTX)).toBe(false);
    });

    it("rejects it under FigaroCore's domain rather than the verifier's", async () => {
        const sig = await signResolve(PROCESS, 1000n);
        expect(await verifyResolveProcessSignature(PROCESS, 1000n, sig, BUYER.address, CTX)).toBe(false);
    });

    it("returns false on a malformed signature, never a throw", async () => {
        expect(await verifyResolveProcessSignature(PROCESS, 1000n, "0x1234", BUYER.address, VCTX)).toBe(false);
    });
});
