/**
 * batchRelay.test.ts — the verification layer that governs the frontend's first
 * read source that is not the network.
 *
 * Real crypto throughout: commitments are signed with viem local accounts and
 * checked through the SDK's canonical `verifyCommitmentSignature` /
 * `verifyResolveProcessSignature`. Only the relay transport, the verifier
 * address resolver, and the `BatchSettled` log store are faked — jsdom has
 * neither a chain nor a relay.
 *
 * The point of every case below: a relay can omit or delay, never forge. So
 * each check is exercised BOTH ways — passing on an honest record, and
 * REJECTING a record a dishonest relay could otherwise slip past.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Hex, PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ZERO_BYTES32 } from "@/lib/shared/evm";
import {
    COMMITMENT_TYPES,
    RESOLVE_PROCESS_TYPES,
    buildDomain,
    computeCommitmentProcessId,
    computeOrderHash,
    type Commitment,
} from "@figaro/sdk";
import {
    toSequencerCommitment,
    toSequencerSig,
    parseWireQuantity,
    fromSequencerCommitment,
    type SequencerBatchRef,
    type SequencerOrderView,
} from "@figaro/sdk/agent";

const CHAIN_ID = 31337;
/** Batch-path signatures are over the VERIFIER's domain, not FigaroCore's. */
const VERIFIER = "0xfE9A08Cbd38397E2b8f96BC49Bd8d4cd9e622e50" as const;
const CORE = "0x0Dac9D673a37cEAfc220eb0B5646375A6Eb88cb5" as const;

const getBatchVerifierMock = vi.fn();
const getAllBatchSettledMock = vi.fn();
const readUserEndpointsMock = vi.fn();

vi.mock("@/lib/composition/contracts", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/composition/contracts")>();
    return { ...actual, getBatchVerifier: () => getBatchVerifierMock() };
});
vi.mock("@/lib/composition/indexer", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/composition/indexer")>();
    return { ...actual, getAllBatchSettled: (...a: unknown[]) => getAllBatchSettledMock(...a) };
});
vi.mock("@/lib/shared/userEndpoints", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/shared/userEndpoints")>();
    return { ...actual, readUserEndpoints: () => readUserEndpointsMock() };
});

import {
    createStateRootAnchorCheck,
    getBatchRelayUrl,
    readVerifiedBatchProcess,
    verifyBatchOrder,
    type BatchRelayCheckId,
    type BatchVerifyContext,
    type StateRootAnchorCheck,
} from "@/lib/audit/batchRelay";

// Deterministic anvil test keys (devnet-only, publicly known).
const buyer = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
const seller = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const stranger = privateKeyToAccount("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a");

const commitment: Commitment = {
    processId: ZERO_BYTES32, // a ROOT order signs processId = 0
    buyer: buyer.address,
    seller: seller.address,
    currency: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    payment: 1_000_000_000_000_000_000n,
    expectedCumulativeValue: 2_000_000_000_000_000_000n,
    agreementHash: `0x${"ab".repeat(32)}`,
    salt: 7n,
    deadline: 4_000_000_000n,
};

const orderHash = computeOrderHash(commitment, CHAIN_ID, VERIFIER);
const processId = computeCommitmentProcessId(commitment, CHAIN_ID, VERIFIER);

const SETTLEMENT_TX = `0x${"11".repeat(32)}` as Hex;
const NEW_ROOT = `0x${"22".repeat(32)}` as Hex;

const batchRef: SequencerBatchRef = {
    batch: 1,
    chain_id: CHAIN_ID,
    verifying_contract: VERIFIER,
    prev_state_root: ZERO_BYTES32,
    new_state_root: NEW_ROOT,
    settlement_tx: SETTLEMENT_TX,
    block_timestamp: 1000,
};

/** Payouts as the kernel computes them: 2 × ECV + payment, and payment. */
const SELLER_PAYOUT = 2n * commitment.expectedCumulativeValue + commitment.payment;
const BUYER_PAYOUT = commitment.payment;
/** The wire serializes U256 as a HEX QUANTITY — not decimal. */
const hexQty = (v: bigint) => `0x${v.toString(16)}`;

let buyerSig: Hex;
let sellerSig: Hex;

const signCommitment = (account: typeof buyer) =>
    account.signTypedData({
        domain: buildDomain(CHAIN_ID, VERIFIER),
        types: COMMITMENT_TYPES,
        primaryType: "Commitment",
        message: commitment,
    });

/** An honest relay record for the committed + resolved order. */
function honestView(overrides: Partial<SequencerOrderView> = {}): SequencerOrderView {
    return {
        order_hash: orderHash,
        process_id: processId,
        commit: {
            commitment: toSequencerCommitment(commitment),
            buyer_signature: toSequencerSig(buyerSig),
            seller_signature: toSequencerSig(sellerSig),
            batch: batchRef,
        },
        resolution: {
            seller: seller.address,
            seller_payout: hexQty(SELLER_PAYOUT),
            buyer_payout: hexQty(BUYER_PAYOUT),
            batch: batchRef,
        },
        ...overrides,
    };
}

/** An anchor stub that says the state root IS on chain. */
const anchored: StateRootAnchorCheck = async () => ({
    id: "state-root-anchor",
    ok: true,
    detail: "anchored (stub)",
});

const ctx = (isAnchored: StateRootAnchorCheck = anchored): BatchVerifyContext => ({
    chainId: CHAIN_ID,
    verifier: VERIFIER,
    isAnchored,
});

const checkFor = (
    checks: { id: BatchRelayCheckId; ok: boolean; detail: string }[],
    id: BatchRelayCheckId,
) => checks.find((c) => c.id === id);

beforeEach(async () => {
    getBatchVerifierMock.mockReset().mockReturnValue(VERIFIER);
    getAllBatchSettledMock.mockReset().mockResolvedValue([]);
    readUserEndpointsMock.mockReset().mockReturnValue({});
    buyerSig = await signCommitment(buyer);
    sellerSig = await signCommitment(seller);
});

// ── The honest record: every check passes ───────────────────────────────────

describe("verifyBatchOrder — an honest relay record", () => {
    it("passes every check and yields a displayable order", async () => {
        const result = await verifyBatchOrder(honestView(), ctx());

        expect(result.verdict).toBe("verified");
        expect(result.failures).toEqual([]);
        // Every check ran and every one passed.
        expect(result.checks.map((c) => c.id).sort()).toEqual([
            "buyer-signature",
            "domain",
            "order-hash",
            "payouts",
            "process-id",
            "seller-signature",
            "state-root-anchor",
        ]);
        expect(result.checks.every((c) => c.ok)).toBe(true);

        // The projection carries the SIGNED values, re-derived — not the
        // relay's word for them.
        expect(result.order).not.toBeNull();
        expect(result.order?.buyer).toBe(buyer.address);
        expect(result.order?.seller).toBe(seller.address);
        expect(result.order?.payment).toBe(commitment.payment);
        expect(result.order?.cumulativeValue).toBe(commitment.expectedCumulativeValue);
        expect(result.order?.agreementHash).toBe(commitment.agreementHash);
        expect(result.payouts).toEqual({
            sellerPayout: SELLER_PAYOUT,
            buyerPayout: BUYER_PAYOUT,
        });
    });

    it("derives the ROOT process id itself rather than trusting the relay", async () => {
        // The struct is signed with processId = 0; the published process id is
        // the kernel's derived one. The check must reproduce that derivation.
        expect(commitment.processId).toBe(ZERO_BYTES32);
        const result = await verifyBatchOrder(honestView(), ctx());
        expect(checkFor(result.checks, "process-id")?.ok).toBe(true);
        expect(result.processId).toBe(processId);
    });
});

// ── Each check, FAILING ─────────────────────────────────────────────────────

describe("verifyBatchOrder — what each check rejects", () => {
    it("domain: rejects a record declaring a different chain", async () => {
        const view = honestView();
        view.commit!.batch = { ...batchRef, chain_id: 1 };
        const result = await verifyBatchOrder(view, ctx());
        expect(result.verdict).toBe("failed");
        const c = checkFor(result.checks, "domain");
        expect(c?.ok).toBe(false);
        expect(c?.detail).toContain("chain 1");
        expect(result.order).toBeNull();
    });

    it("domain: rejects a record declaring a verifier this deployment does not trust", async () => {
        const view = honestView();
        view.commit!.batch = { ...batchRef, verifying_contract: stranger.address };
        const result = await verifyBatchOrder(view, ctx());
        expect(result.verdict).toBe("failed");
        expect(checkFor(result.checks, "domain")?.ok).toBe(false);
        expect(checkFor(result.checks, "domain")?.detail).toContain("FigaroBatchVerifier");
    });

    it("order-hash: rejects a struct that does not hash to the published order hash", async () => {
        // A relay that swaps the payment after signing — the classic forgery.
        const view = honestView();
        view.commit!.commitment = {
            ...toSequencerCommitment(commitment),
            payment: hexQty(999n),
        };
        const result = await verifyBatchOrder(view, ctx());
        expect(result.verdict).toBe("failed");
        expect(checkFor(result.checks, "order-hash")?.ok).toBe(false);
        expect(checkFor(result.checks, "order-hash")?.detail).toContain("but the relay published it as");
        expect(result.order).toBeNull();
    });

    it("process-id: rejects an order filed under a process it does not derive", async () => {
        const view = honestView({ process_id: `0x${"cd".repeat(32)}` });
        const result = await verifyBatchOrder(view, ctx());
        expect(result.verdict).toBe("failed");
        expect(checkFor(result.checks, "process-id")?.ok).toBe(false);
    });

    it("buyer-signature: rejects a signature from someone other than the named buyer", async () => {
        const view = honestView();
        view.commit!.buyer_signature = toSequencerSig(
            await stranger.signTypedData({
                domain: buildDomain(CHAIN_ID, VERIFIER),
                types: COMMITMENT_TYPES,
                primaryType: "Commitment",
                message: commitment,
            }),
        );
        const result = await verifyBatchOrder(view, ctx());
        expect(result.verdict).toBe("failed");
        expect(checkFor(result.checks, "buyer-signature")?.ok).toBe(false);
        expect(checkFor(result.checks, "seller-signature")?.ok).toBe(true);
    });

    it("seller-signature: rejects a signature made over FigaroCore's domain instead of the verifier's", async () => {
        // THE domain trap: a signature valid on the direct path is NOT valid
        // for batched settlement. Verifying against the wrong verifyingContract
        // would silently accept it.
        const view = honestView();
        view.commit!.seller_signature = toSequencerSig(
            await seller.signTypedData({
                domain: buildDomain(CHAIN_ID, CORE),
                types: COMMITMENT_TYPES,
                primaryType: "Commitment",
                message: commitment,
            }),
        );
        const result = await verifyBatchOrder(view, ctx());
        expect(result.verdict).toBe("failed");
        expect(checkFor(result.checks, "seller-signature")?.ok).toBe(false);
    });

    it("payouts: rejects amounts that do not recompute from the signed struct", async () => {
        const view = honestView();
        view.resolution = {
            seller: seller.address,
            seller_payout: hexQty(SELLER_PAYOUT + 1n), // skimmed
            buyer_payout: hexQty(BUYER_PAYOUT),
            batch: batchRef,
        };
        const result = await verifyBatchOrder(view, ctx());
        expect(result.verdict).toBe("failed");
        expect(checkFor(result.checks, "payouts")?.ok).toBe(false);
        expect(checkFor(result.checks, "payouts")?.detail).toContain("do not match the signed struct");
    });

    it("payouts: rejects a payout redirected to a seller the struct does not name", async () => {
        const view = honestView();
        view.resolution = {
            seller: stranger.address,
            seller_payout: hexQty(SELLER_PAYOUT),
            buyer_payout: hexQty(BUYER_PAYOUT),
            batch: batchRef,
        };
        const result = await verifyBatchOrder(view, ctx());
        expect(result.verdict).toBe("failed");
        expect(checkFor(result.checks, "payouts")?.detail).toContain("the signed struct names");
    });

    it("payouts: an OPEN process is not a payout failure", async () => {
        const result = await verifyBatchOrder(honestView({ resolution: null }), ctx());
        expect(result.verdict).toBe("verified");
        expect(checkFor(result.checks, "payouts")?.ok).toBe(true);
        expect(result.payouts).toBeNull();
        // Open, so the projection must not claim resolution.
        expect(result.order?.state).toBe(0);
    });

    it("state-root-anchor: rejects a record whose batch is not on chain", async () => {
        const unanchored: StateRootAnchorCheck = async () => ({
            id: "state-root-anchor",
            ok: false,
            detail: "not on chain",
        });
        const result = await verifyBatchOrder(honestView(), ctx(unanchored));
        expect(result.verdict).toBe("failed");
        expect(checkFor(result.checks, "state-root-anchor")?.ok).toBe(false);
        expect(result.order).toBeNull();
    });
});

// ── Retention gap is ABSENCE, not failure ───────────────────────────────────

describe("verifyBatchOrder — an unretained commit leg", () => {
    it("reports 'unretained' rather than failure or silent success", async () => {
        const result = await verifyBatchOrder(honestView({ commit: null }), ctx());
        expect(result.verdict).toBe("unretained");
        expect(result.checks).toEqual([]);
        expect(result.failures).toEqual([]);
        expect(result.order).toBeNull();
    });
});

// ── The on-chain anchor ─────────────────────────────────────────────────────

describe("createStateRootAnchorCheck", () => {
    const client = {} as PublicClient;

    it("passes when a BatchSettled carries the state root in the named transaction", async () => {
        getAllBatchSettledMock.mockResolvedValue([
            { args: { newStateRoot: NEW_ROOT }, transactionHash: SETTLEMENT_TX },
        ]);
        const check = await createStateRootAnchorCheck(client, CHAIN_ID)(batchRef);
        expect(check.ok).toBe(true);
    });

    it("fails when no BatchSettled carries that state root", async () => {
        getAllBatchSettledMock.mockResolvedValue([
            { args: { newStateRoot: `0x${"99".repeat(32)}` }, transactionHash: SETTLEMENT_TX },
        ]);
        const check = await createStateRootAnchorCheck(client, CHAIN_ID)(batchRef);
        expect(check.ok).toBe(false);
        expect(check.detail).toContain("not on chain");
    });

    it("fails when the root settled in a DIFFERENT transaction than the relay named", async () => {
        getAllBatchSettledMock.mockResolvedValue([
            { args: { newStateRoot: NEW_ROOT }, transactionHash: `0x${"ee".repeat(32)}` },
        ]);
        const check = await createStateRootAnchorCheck(client, CHAIN_ID)(batchRef);
        expect(check.ok).toBe(false);
        expect(check.detail).toContain("not in the");
    });

    it("fails a DRY RUN, which proved but never settled", async () => {
        const check = await createStateRootAnchorCheck(client, CHAIN_ID)({
            ...batchRef,
            settlement_tx: null,
        });
        expect(check.ok).toBe(false);
        expect(check.detail).toContain("DRY RUN");
        // Never even consults the chain — nothing to look for.
        expect(getAllBatchSettledMock).not.toHaveBeenCalled();
    });
});

// ── Hex-quantity parsing — the silent-corruption landmine ───────────────────

describe("wire quantity parsing", () => {
    it("reads a HEX QUANTITY, which is what the relay actually sends", () => {
        expect(parseWireQuantity("0x7d0", "payment")).toBe(2000n);
    });

    it("still reads the decimal form the SDK WRITES on submission", () => {
        expect(parseWireQuantity("2000", "payment")).toBe(2000n);
    });

    it("refuses the empty string instead of silently reading it as zero", () => {
        // BigInt("") is 0n — a truncated amount would look like a free order.
        expect(BigInt("")).toBe(0n);
        expect(() => parseWireQuantity("", "payment")).toThrow(/malformed quantity/);
    });

    it("refuses whitespace, a bare 0x, and non-numeric junk", () => {
        for (const bad of [" ", "0x", "12ab", "0xzz", "1e18", "-1"]) {
            expect(() => parseWireQuantity(bad, "payment")).toThrow(/malformed quantity/);
        }
    });

    it("round-trips a commitment through the wire without corrupting amounts", () => {
        const wire = {
            ...toSequencerCommitment(commitment),
            payment: hexQty(commitment.payment),
            expected_cumulative_value: hexQty(commitment.expectedCumulativeValue),
            salt: hexQty(commitment.salt),
            deadline: hexQty(commitment.deadline),
        };
        expect(fromSequencerCommitment(wire)).toEqual(commitment);
    });

    it("a hex amount misread as decimal would change the order hash — so it must not be", () => {
        const wire = { ...toSequencerCommitment(commitment), payment: hexQty(commitment.payment) };
        const parsed = fromSequencerCommitment(wire);
        expect(computeOrderHash(parsed, CHAIN_ID, VERIFIER)).toBe(orderHash);
    });

    it("surfaces a malformed amount as a FAILED order, never a zero-value one", async () => {
        const view = honestView();
        view.commit!.commitment = { ...toSequencerCommitment(commitment), payment: "" };
        const result = await verifyBatchOrder(view, ctx());
        expect(result.verdict).toBe("failed");
        expect(result.order).toBeNull();
        expect(result.failures[0]?.detail).toContain("malformed quantity");
    });
});

// ── Endpoint resolution — resolved-empty means ABSENCE ──────────────────────

describe("getBatchRelayUrl", () => {
    it("is null when nothing is configured — no default endpoint, ever", () => {
        expect(getBatchRelayUrl()).toBeNull();
    });

    it("refuses a non-http(s) endpoint rather than handing it to fetch", () => {
        readUserEndpointsMock.mockReturnValue({ batchRelayUrl: "javascript:alert(1)" });
        expect(getBatchRelayUrl()).toBeNull();
    });

    it("takes the reader's own relay and strips the trailing slash", () => {
        readUserEndpointsMock.mockReturnValue({ batchRelayUrl: "http://127.0.0.1:3001/" });
        expect(getBatchRelayUrl()).toBe("http://127.0.0.1:3001");
    });
});

// ── Process read — the three absences stay distinct ─────────────────────────

describe("readVerifiedBatchProcess", () => {
    const client = {} as PublicClient;

    it("reports no-relay when none is configured, and reads nothing", async () => {
        const result = await readVerifiedBatchProcess(client, CHAIN_ID, processId);
        expect(result.status).toBe("no-relay");
        expect(result.orders).toEqual([]);
        expect(result.relayUrl).toBeNull();
    });

    it("reports no-verifier when nothing on chain could anchor a record", async () => {
        getBatchVerifierMock.mockReturnValue(null);
        const relay = { process: vi.fn(), status: vi.fn() };
        const result = await readVerifiedBatchProcess(client, CHAIN_ID, processId, {
            client: relay as never,
        });
        expect(result.status).toBe("no-verifier");
        expect(relay.process).not.toHaveBeenCalled();
    });

    it("reports not-in-archive on a 404, which is NOT 'did not happen'", async () => {
        const relay = {
            process: vi.fn().mockResolvedValue(null), // the client maps 404 → null
            status: vi.fn().mockResolvedValue({
                archive: { first_batch: 5, last_batch: 9, retained_batches: 5, max_batches: 10 },
            }),
        };
        const result = await readVerifiedBatchProcess(client, CHAIN_ID, processId, {
            client: relay as never,
        });
        expect(result.status).toBe("not-in-archive");
        expect(result.orders).toEqual([]);
        // The retention window is surfaced so an aged-out gap is visible.
        expect(result.window?.first_batch).toBe(5);
    });

    it("reports unreachable with the reason, never as an empty process", async () => {
        const relay = {
            process: vi.fn().mockRejectedValue(new Error("connection refused")),
            status: vi.fn(),
        };
        const result = await readVerifiedBatchProcess(client, CHAIN_ID, processId, {
            client: relay as never,
        });
        expect(result.status).toBe("unreachable");
        expect(result.error).toContain("connection refused");
        expect(result.orders).toEqual([]);
    });

    it("verifies the orders and the buyer's resolve authorization", async () => {
        const resolveSig = await buyer.signTypedData({
            domain: buildDomain(CHAIN_ID, VERIFIER),
            types: RESOLVE_PROCESS_TYPES,
            primaryType: "ResolveProcess",
            message: { processId },
        });
        const relay = {
            process: vi.fn().mockResolvedValue({
                process_id: processId,
                orders: [honestView()],
                resolution: {
                    buyer: buyer.address,
                    order_count: 1,
                    buyer_signature: toSequencerSig(resolveSig),
                    batch: batchRef,
                },
            }),
            status: vi.fn().mockResolvedValue({ archive: null }),
        };
        const result = await readVerifiedBatchProcess(client, CHAIN_ID, processId, {
            client: relay as never,
            isAnchored: anchored,
        });
        expect(result.status).toBe("found");
        expect(result.orders[0]?.verdict).toBe("verified");
        expect(result.resolution?.signature.ok).toBe(true);
    });

    it("rejects a resolution not authorized by the named buyer", async () => {
        // Buyer dominance is the whole mechanism: a resolution nobody
        // authorized must never render as a resolved process.
        const forged = await stranger.signTypedData({
            domain: buildDomain(CHAIN_ID, VERIFIER),
            types: RESOLVE_PROCESS_TYPES,
            primaryType: "ResolveProcess",
            message: { processId },
        });
        const relay = {
            process: vi.fn().mockResolvedValue({
                process_id: processId,
                orders: [],
                resolution: {
                    buyer: buyer.address,
                    order_count: 1,
                    buyer_signature: toSequencerSig(forged),
                    batch: batchRef,
                },
            }),
            status: vi.fn().mockResolvedValue({ archive: null }),
        };
        const result = await readVerifiedBatchProcess(client, CHAIN_ID, processId, {
            client: relay as never,
            isAnchored: anchored,
        });
        expect(result.resolution?.signature.ok).toBe(false);
        expect(result.resolution?.signature.detail).toContain("NOT proven to be buyer-authorized");
    });
});

// ── A REAL relay payload, produced by the Rust sequencer ────────────────────
//
// Captured verbatim from `sdk/sequencer-archive.jsonl` after the live
// `sdk/tests/batch-e2e.test.ts` run (SDK → sequencer → FigaroBatchVerifier on
// devnet). This is the cross-language lock: the bytes come from the OTHER
// implementation, so if the TypeScript derivation ever drifts from the Rust
// guest's — a different typehash, the wrong domain, a decimal reading of a hex
// quantity — these assertions break. Regenerating this fixture from TypeScript
// would make it test itself; it must always come from the relay.

const REAL_VERIFIER = "0xe45a1e7f99aaa9854ef947c218d4eeedb214dc92" as const;
const REAL_COMMIT = {
    order_hash: "0x8853275dd8a7844b6cf5731d3d779516bb90d36aa1de667a54b4938f7c129e11",
    process_id: "0x270f060a49ad7e153f39d07027826f89d1ae172a5bf98c79c21238cffc0328b2",
    commitment: {
        process_id: ZERO_BYTES32,
        buyer: "0x70997970c51812dc3a010c7d01b50e0d17dc79c8",
        seller: "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc",
        currency: "0xac9bf8120e173525a0c7779b96466f5455ca9280",
        payment: "0x56bc75e2d63100000",
        expected_cumulative_value: "0x56bc75e2d63100000",
        agreement_hash: "0x8fc2dbb8825e453a9be2595f9037f6ef1e7dae3c8779f2a5b03647286c8dc31d",
        salt: "0x2a",
        deadline: "0x6a6d1d0c",
    },
    buyer_signature: {
        v: 27,
        r: "0xc69c5ba484472c8cf758a4ab86b50e08eec430adbeff9854e66ed4463f1f0e1b",
        s: "0x0f067c769444563c4d5b257794ff06870ff0b335c0ab6fdef5c0dd570f6dbed0",
    },
    seller_signature: {
        v: 28,
        r: "0x973b89b7a4b021b8a80ae2c1ad1a4d98369816131b558c8df8e6a1451e14b8ea",
        s: "0x4a6cd309a3f43ccf21a420bc867398cdabf177fe71be623920423af7d25aa392",
    },
} as const;
// The resolution leg the relay published for that same order.
const REAL_SELLER_PAYOUT = "0x1043561a8829300000";
const REAL_BUYER_PAYOUT = "0x56bc75e2d63100000";
const REAL_BATCH: SequencerBatchRef = {
    batch: 1,
    chain_id: 31337,
    verifying_contract: REAL_VERIFIER,
    prev_state_root: "0xff7e8244f53ff09e5b59c85232fc6494f3c1987239148e9b496f127e3a90c848",
    new_state_root: "0x100344a2341d9fea7e528cdc7057928404d39a0acc34018f5b30426e6d2a331e",
    settlement_tx: "0x8c338170d86a8cf452a3bf3790c581a456fffc7b17c67d977ae2a5d864d3bf7f",
    block_timestamp: 1785532158,
};

describe("a REAL payload from the Rust relay", () => {
    const realView = (): SequencerOrderView => ({
        order_hash: REAL_COMMIT.order_hash,
        process_id: REAL_COMMIT.process_id,
        commit: {
            commitment: REAL_COMMIT.commitment,
            buyer_signature: REAL_COMMIT.buyer_signature,
            seller_signature: REAL_COMMIT.seller_signature,
            batch: REAL_BATCH,
        },
        resolution: {
            seller: REAL_COMMIT.commitment.seller,
            seller_payout: REAL_SELLER_PAYOUT,
            buyer_payout: REAL_BUYER_PAYOUT,
            batch: REAL_BATCH,
        },
    });

    it("re-derives the relay's own order hash and process id", () => {
        const c = fromSequencerCommitment(REAL_COMMIT.commitment);
        expect(computeOrderHash(c, 31337, REAL_VERIFIER)).toBe(REAL_COMMIT.order_hash);
        expect(computeCommitmentProcessId(c, 31337, REAL_VERIFIER)).toBe(REAL_COMMIT.process_id);
    });

    it("recovers both real signatures to the parties named in the struct", async () => {
        const result = await verifyBatchOrder(realView(), {
            chainId: 31337,
            verifier: REAL_VERIFIER,
            isAnchored: anchored,
        });
        expect(checkFor(result.checks, "buyer-signature")?.ok).toBe(true);
        expect(checkFor(result.checks, "seller-signature")?.ok).toBe(true);
        expect(result.verdict).toBe("verified");
    });

    it("recomputes the real payouts (2 × ECV + payment, and payment)", async () => {
        const result = await verifyBatchOrder(realView(), {
            chainId: 31337,
            verifier: REAL_VERIFIER,
            isAnchored: anchored,
        });
        expect(checkFor(result.checks, "payouts")?.ok).toBe(true);
        // 100e18 payment, 100e18 cumulative value ⇒ 300e18 / 100e18.
        expect(result.payouts).toEqual({
            sellerPayout: 300_000_000_000_000_000_000n,
            buyerPayout: 100_000_000_000_000_000_000n,
        });
    });

    it("would MISREAD every amount if the hex quantity were parsed as decimal", () => {
        // The landmine, demonstrated on real bytes: the relay sends
        // "0x56bc75e2d63100000"; a decimal reading is not merely wrong, it is
        // unparseable — which is why the parser must reject rather than coerce.
        expect(parseWireQuantity(REAL_COMMIT.commitment.payment, "payment"))
            .toBe(100_000_000_000_000_000_000n);
        expect(parseWireQuantity(REAL_COMMIT.commitment.salt, "salt")).toBe(42n);
    });
});
