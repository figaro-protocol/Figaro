/**
 * verifyCommitmentSignature.test.ts — the canonical EIP-712 Commitment
 * signature check (the primitive the frontend pin-gate and acceptOrder
 * hardenings depend on; audit 2026-07-23). A real signature recovers to its
 * signer; a forged one, a cross-party one, or one against a tampered struct
 * does not.
 */
import { describe, it, expect } from "vitest";
import { createWalletClient, http, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { buildDomain, COMMITMENT_TYPES, verifyCommitmentSignature } from "../src/commitments.js";
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
    agreementHash: `0x${"ab".repeat(32)}`,
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
