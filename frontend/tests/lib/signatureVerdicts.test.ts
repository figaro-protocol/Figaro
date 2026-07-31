/**
 * signatureVerdicts.test.ts — the audit surface's per-order signature verdicts.
 *
 * Real crypto throughout: commitments are signed with viem local accounts and
 * verified through the SDK's canonical `verifyCommitmentSignature` — nothing
 * cryptographic is mocked. Only the log store (`getAllOrderCommitted`) and the
 * transaction fetch (`client.getTransaction`) are faked, since jsdom has no
 * chain.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { encodeFunctionData, type Hex, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ZERO_BYTES32 } from "@/lib/shared/evm";
import {
    CORE_ABI,
    WITNESS_SWAP_AND_COMMIT_COORDINATOR_ABI,
    DISABLED_SWAP_FUNDING_LEG,
    COMMITMENT_TYPES,
    buildDomain,
    computeOrderHash,
    type Commitment,
} from "@figaro/sdk";
import {
    decodeCommitCalldata,
    verdictsForCommitCalldata,
    verifyOrderCommitSignatures,
} from "@/lib/audit/signatureVerdicts";

const CHAIN_ID = 31337;
const CORE = "0x0Dac9D673a37cEAfc220eb0B5646375A6Eb88cb5" as const;

vi.mock("@/lib/kernel/contracts", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/kernel/contracts")>();
    return { ...actual, CONTRACTS: { ...actual.CONTRACTS, core: "0x0Dac9D673a37cEAfc220eb0B5646375A6Eb88cb5" } };
});

const getAllOrderCommittedMock = vi.fn();
vi.mock("@/lib/kernel/indexer", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/kernel/indexer")>();
    return {
        ...actual,
        getAllOrderCommitted: (...args: unknown[]) => getAllOrderCommittedMock(...args),
    };
});

// Deterministic anvil test keys (devnet-only, publicly known).
const buyerAccount = privateKeyToAccount(
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
);
const sellerAccount = privateKeyToAccount(
    "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
);
const strangerAccount = privateKeyToAccount(
    "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
);

const commitment: Commitment = {
    processId: ZERO_BYTES32,
    buyer: buyerAccount.address,
    seller: sellerAccount.address,
    currency: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    payment: 1_000_000_000_000_000_000n,
    expectedCumulativeValue: 1_000_000_000_000_000_000n,
    agreementHash: `0x${"ab".repeat(32)}`,
    salt: 7n,
    deadline: 4_000_000_000n,
};

const signCommitment = (account: typeof buyerAccount) =>
    account.signTypedData({
        domain: buildDomain(CHAIN_ID, CORE),
        types: COMMITMENT_TYPES,
        primaryType: "Commitment",
        message: commitment,
    });

const orderHash = computeOrderHash(commitment, CHAIN_ID, CORE);
const ctx = { chainId: CHAIN_ID, core: CORE };

let buyerSig: Hex;
let sellerSig: Hex;
let commitInput: Hex;

beforeEach(async () => {
    getAllOrderCommittedMock.mockReset();
    buyerSig = await signCommitment(buyerAccount);
    sellerSig = await signCommitment(sellerAccount);
    commitInput = encodeFunctionData({
        abi: CORE_ABI,
        functionName: "commit",
        args: [commitment, buyerSig, sellerSig],
    });
});

describe("decodeCommitCalldata", () => {
    it("decodes the kernel commit path", () => {
        const decoded = decodeCommitCalldata(commitInput);
        expect(decoded).not.toBeNull();
        expect(decoded!.commitment.buyer).toBe(commitment.buyer);
        expect(decoded!.buyerSig).toBe(buyerSig);
        expect(decoded!.sellerSig).toBe(sellerSig);
    });

    it("decodes the swapAndCommit path", () => {
        const input = encodeFunctionData({
            abi: WITNESS_SWAP_AND_COMMIT_COORDINATOR_ABI,
            functionName: "swapAndCommit",
            args: [commitment, buyerSig, sellerSig, DISABLED_SWAP_FUNDING_LEG, DISABLED_SWAP_FUNDING_LEG],
        });
        const decoded = decodeCommitCalldata(input);
        expect(decoded).not.toBeNull();
        expect(decoded!.sellerSig).toBe(sellerSig);
    });

    it("returns null for calldata that is not a commit", () => {
        expect(decodeCommitCalldata("0xdeadbeef")).toBeNull();
    });
});

describe("verdictsForCommitCalldata", () => {
    it("reports both signatures valid when each recovers to its party", async () => {
        const verdicts = await verdictsForCommitCalldata(commitInput, orderHash, ctx);
        expect(verdicts).toEqual({ buyer: "valid", seller: "valid" });
    });

    it("reports invalid when a signature recovers to someone else", async () => {
        const forged = await strangerAccount.signTypedData({
            domain: buildDomain(CHAIN_ID, CORE),
            types: COMMITMENT_TYPES,
            primaryType: "Commitment",
            message: commitment,
        });
        const input = encodeFunctionData({
            abi: CORE_ABI,
            functionName: "commit",
            args: [commitment, forged, sellerSig],
        });
        const verdicts = await verdictsForCommitCalldata(input, orderHash, ctx);
        expect(verdicts).toEqual({ buyer: "invalid", seller: "valid" });
    });

    it("reports invalid for a missing (empty) signature", async () => {
        const input = encodeFunctionData({
            abi: CORE_ABI,
            functionName: "commit",
            args: [commitment, buyerSig, "0x"],
        });
        const verdicts = await verdictsForCommitCalldata(input, orderHash, ctx);
        expect(verdicts).toEqual({ buyer: "valid", seller: "invalid" });
    });

    it("refuses to bind calldata to a different order (null, not a false verdict)", async () => {
        const verdicts = await verdictsForCommitCalldata(commitInput, `0x${"cd".repeat(32)}`, ctx);
        expect(verdicts).toBeNull();
    });

    it("returns null for undecodable calldata", async () => {
        expect(await verdictsForCommitCalldata("0x12345678", orderHash, ctx)).toBeNull();
    });
});

describe("verifyOrderCommitSignatures", () => {
    const clientWith = (getTransaction: (args: { hash: Hex }) => Promise<{ input: Hex }>) =>
        ({ getTransaction } as unknown as PublicClient);
    const TX_HASH = `0x${"11".repeat(32)}` as Hex;

    it("verifies both signatures from the commit transaction's calldata", async () => {
        getAllOrderCommittedMock.mockResolvedValue([
            { args: { orderHash }, transactionHash: TX_HASH },
        ]);
        const client = clientWith(async ({ hash }) => {
            expect(hash).toBe(TX_HASH);
            return { input: commitInput };
        });
        const verdicts = await verifyOrderCommitSignatures(client, CHAIN_ID, orderHash);
        expect(verdicts).toEqual({ buyer: "valid", seller: "valid", transactionHash: TX_HASH });
    });

    it("reports unavailable when the order has no committed log", async () => {
        getAllOrderCommittedMock.mockResolvedValue([]);
        const client = clientWith(async () => {
            throw new Error("must not be called");
        });
        const verdicts = await verifyOrderCommitSignatures(client, CHAIN_ID, orderHash);
        expect(verdicts).toEqual({ buyer: "unavailable", seller: "unavailable", transactionHash: null });
    });

    it("reports unavailable when the log carries no transaction hash", async () => {
        getAllOrderCommittedMock.mockResolvedValue([
            { args: { orderHash }, transactionHash: null },
        ]);
        const client = clientWith(async () => {
            throw new Error("must not be called");
        });
        const verdicts = await verifyOrderCommitSignatures(client, CHAIN_ID, orderHash);
        expect(verdicts).toEqual({ buyer: "unavailable", seller: "unavailable", transactionHash: null });
    });

    it("reports unavailable when the transaction cannot be fetched", async () => {
        getAllOrderCommittedMock.mockResolvedValue([
            { args: { orderHash }, transactionHash: TX_HASH },
        ]);
        const client = clientWith(async () => {
            throw new Error("rpc down");
        });
        const verdicts = await verifyOrderCommitSignatures(client, CHAIN_ID, orderHash);
        expect(verdicts).toEqual({ buyer: "unavailable", seller: "unavailable", transactionHash: null });
    });

    it("reports unavailable (keeping the tx hash) for undecodable calldata", async () => {
        getAllOrderCommittedMock.mockResolvedValue([
            { args: { orderHash }, transactionHash: TX_HASH },
        ]);
        const client = clientWith(async () => ({ input: "0xdeadbeef" as Hex }));
        const verdicts = await verifyOrderCommitSignatures(client, CHAIN_ID, orderHash);
        expect(verdicts).toEqual({ buyer: "unavailable", seller: "unavailable", transactionHash: TX_HASH });
    });
});
