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
} from "@figaro-protocol/sdk";
import {
    toSequencerCommitment,
    toSequencerSig,
    parseWireQuantity,
    fromSequencerCommitment,
    type SequencerBatchRef,
    type SequencerOrderView,
} from "@figaro-protocol/sdk/agent";

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
    createStateInclusionCheck,
    createStateRootAnchorCheck,
    getBatchRelayUrl,
    MAX_RELAY_STATE_BYTES,
    readVerifiedBatchProcess,
    verifyBatchOrder,
    type BatchRelayCheckId,
    type BatchVerifyContext,
    type StateInclusionCheck,
    type StateRootAnchorCheck,
} from "@/lib/audit/batchRelay";
import { computeKernelStateRoot, parseKernelStateSnapshot } from "@/lib/audit/batchStateRoot";

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
    checkoutHash: `0x${"ab".repeat(32)}`,
    salt: 7n,
    deadline: 4_000_000_000n,
};

const orderHash = computeOrderHash(commitment, CHAIN_ID, VERIFIER);
const processId = computeCommitmentProcessId(commitment, CHAIN_ID, VERIFIER);

const RESOLUTION_TX = `0x${"11".repeat(32)}` as Hex;
const NEW_ROOT = `0x${"22".repeat(32)}` as Hex;

const batchRef: SequencerBatchRef = {
    batch: 1,
    chain_id: CHAIN_ID,
    verifying_contract: VERIFIER,
    prev_state_root: ZERO_BYTES32,
    new_state_root: NEW_ROOT,
    resolution_tx: RESOLUTION_TX,
    block_timestamp: 1000,
};

/** Payouts as FigaroCore computes them: 2 × ECV + payment, and payment. */
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

/** An inclusion stub that says the order IS under the verifier's root. */
const included: StateInclusionCheck = async () => ({
    id: "state-inclusion",
    ok: true,
    detail: "included (stub)",
});

const ctx = (
    isAnchored: StateRootAnchorCheck = anchored,
    isIncluded: StateInclusionCheck = included,
): BatchVerifyContext => ({
    chainId: CHAIN_ID,
    verifier: VERIFIER,
    processId,
    isAnchored,
    isIncluded,
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
            "resolution-anchor",
            "seller-signature",
            "state-inclusion",
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
        expect(result.order?.checkoutHash).toBe(commitment.checkoutHash);
        expect(result.payouts).toEqual({
            sellerPayout: SELLER_PAYOUT,
            buyerPayout: BUYER_PAYOUT,
        });
    });

    it("derives the ROOT process id itself rather than trusting the relay", async () => {
        // The struct is signed with processId = 0; the published process id is
        // FigaroCore's derived one. The check must reproduce that derivation.
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
        // for batch resolution. Verifying against the wrong verifyingContract
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

    it("an order committed in batch A and resolved in batch B carries B's transaction as its resolution batch", async () => {
        const TX_A = `0x${"aa".repeat(32)}` as Hex;
        const TX_B = `0x${"bb".repeat(32)}` as Hex;
        const view = honestView();
        view.commit = { ...view.commit!, batch: { ...batchRef, batch: 1, resolution_tx: TX_A } };
        view.resolution = {
            ...view.resolution!,
            batch: { ...batchRef, batch: 2, new_state_root: `0x${"33".repeat(32)}` as Hex, resolution_tx: TX_B },
        };
        const result = await verifyBatchOrder(view, ctx());
        expect(result.verdict).toBe("verified");
        expect(result.batch?.resolution_tx).toBe(TX_A);
        expect(result.resolutionBatch?.resolution_tx).toBe(TX_B);
    });

    it("an OPEN order has no resolution batch", async () => {
        const result = await verifyBatchOrder(honestView({ resolution: null }), ctx());
        expect(result.resolutionBatch).toBeNull();
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

    it("process-id: rejects another process's GENUINE record served under the process asked for", async () => {
        // Process Y: a different, honestly signed root order. Every signature
        // recovers and the struct derives the id the relay published — only
        // the reader's own request tells it apart.
        const other: Commitment = { ...commitment, salt: 8n };
        const sign = (a: typeof buyer) =>
            a.signTypedData({
                domain: buildDomain(CHAIN_ID, VERIFIER),
                types: COMMITMENT_TYPES,
                primaryType: "Commitment",
                message: other,
            });
        const view = honestView({
            order_hash: computeOrderHash(other, CHAIN_ID, VERIFIER),
            process_id: computeCommitmentProcessId(other, CHAIN_ID, VERIFIER),
            commit: {
                commitment: toSequencerCommitment(other),
                buyer_signature: toSequencerSig(await sign(buyer)),
                seller_signature: toSequencerSig(await sign(seller)),
                batch: batchRef,
            },
        });
        const result = await verifyBatchOrder(view, ctx());
        expect(checkFor(result.checks, "order-hash")?.ok).toBe(true);
        expect(checkFor(result.checks, "buyer-signature")?.ok).toBe(true);
        expect(checkFor(result.checks, "process-id")?.ok).toBe(false);
        expect(checkFor(result.checks, "process-id")?.detail).toContain("this reader asked for");
        expect(result.verdict).toBe("failed");
        expect(result.order).toBeNull();
    });

    it("resolution-anchor: rejects a resolution leg whose batch is not on chain", async () => {
        // The payouts are a pure function anyone computes; a relay appending
        // them to an open order must not make it read as resolved.
        const commitOnly: StateRootAnchorCheck = async (b) =>
            b.new_state_root === NEW_ROOT
                ? { id: "state-root-anchor", ok: true, detail: "anchored (stub)" }
                : { id: "state-root-anchor", ok: false, detail: "not on chain (stub)" };
        const view = honestView();
        view.resolution = {
            ...view.resolution!,
            batch: { ...batchRef, batch: 2, new_state_root: `0x${"33".repeat(32)}` },
        };
        const result = await verifyBatchOrder(view, ctx(commitOnly));
        expect(checkFor(result.checks, "payouts")?.ok).toBe(true);
        expect(checkFor(result.checks, "state-root-anchor")?.ok).toBe(true);
        expect(checkFor(result.checks, "resolution-anchor")?.ok).toBe(false);
        expect(checkFor(result.checks, "resolution-anchor")?.detail).toContain("resolution batch");
        expect(result.verdict).toBe("failed");
        expect(result.order).toBeNull();
    });

    it("resolution-anchor: rejects a resolution leg declaring another verifier's domain", async () => {
        const view = honestView();
        view.resolution = {
            ...view.resolution!,
            batch: { ...batchRef, verifying_contract: stranger.address },
        };
        const result = await verifyBatchOrder(view, ctx());
        expect(checkFor(result.checks, "resolution-anchor")?.ok).toBe(false);
        expect(checkFor(result.checks, "resolution-anchor")?.detail).toContain("FigaroBatchVerifier");
        expect(result.verdict).toBe("failed");
    });

    it("an OPEN order carries no resolution-anchor check", async () => {
        const result = await verifyBatchOrder(honestView({ resolution: null }), ctx());
        expect(checkFor(result.checks, "resolution-anchor")).toBeUndefined();
    });

    it("resolvedAt is the RESOLUTION batch's timestamp, not the commit batch's", async () => {
        const view = honestView();
        view.resolution = {
            ...view.resolution!,
            batch: { ...batchRef, batch: 2, block_timestamp: 5000 },
        };
        const result = await verifyBatchOrder(view, ctx());
        expect(result.verdict).toBe("verified");
        expect(result.order?.resolvedAt).toBe(5000);
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
            { args: { newStateRoot: NEW_ROOT }, transactionHash: RESOLUTION_TX },
        ]);
        const check = await createStateRootAnchorCheck(client, CHAIN_ID)(batchRef);
        expect(check.ok).toBe(true);
        // It says what it checked: the root is on chain. Inclusion is the
        // `state-inclusion` check's, never claimed here.
        expect(check.detail).toContain(`state root ${NEW_ROOT} resolved on chain`);
        expect(check.detail).not.toContain("inclusion");
    });

    it("fails when no BatchSettled carries that state root", async () => {
        getAllBatchSettledMock.mockResolvedValue([
            { args: { newStateRoot: `0x${"99".repeat(32)}` }, transactionHash: RESOLUTION_TX },
        ]);
        const check = await createStateRootAnchorCheck(client, CHAIN_ID)(batchRef);
        expect(check.ok).toBe(false);
        expect(check.detail).toContain("not on chain");
    });

    it("fails when the root resolved in a DIFFERENT transaction than the relay named", async () => {
        getAllBatchSettledMock.mockResolvedValue([
            { args: { newStateRoot: NEW_ROOT }, transactionHash: `0x${"ee".repeat(32)}` },
        ]);
        const check = await createStateRootAnchorCheck(client, CHAIN_ID)(batchRef);
        expect(check.ok).toBe(false);
        expect(check.detail).toContain("not in the");
    });

    it("fails a DRY RUN, which proved but never resolved", async () => {
        const check = await createStateRootAnchorCheck(client, CHAIN_ID)({
            ...batchRef,
            resolution_tx: null,
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
            isIncluded: included,
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
                orders: [honestView()],
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
            isIncluded: included,
        });
        expect(result.resolution?.signature.ok).toBe(false);
        expect(result.resolution?.signature.detail).toContain("NOT proven to be buyer-authorized");
    });

    /** A relay answering `processId` with these orders and this resolution. */
    const relayFor = (
        orders: SequencerOrderView[],
        resolution: { buyer: Hex; sig: Hex; batch?: SequencerBatchRef } | null,
        processIdOnWire: Hex = processId,
    ) => ({
        process: vi.fn().mockResolvedValue({
            process_id: processIdOnWire,
            orders,
            resolution: resolution && {
                buyer: resolution.buyer,
                order_count: orders.length,
                buyer_signature: toSequencerSig(resolution.sig),
                batch: resolution.batch ?? batchRef,
            },
        }),
        status: vi.fn().mockResolvedValue({ archive: null }),
    });
    const signResolve = (account: typeof buyer, forProcess: Hex = processId) =>
        account.signTypedData({
            domain: buildDomain(CHAIN_ID, VERIFIER),
            types: RESOLVE_PROCESS_TYPES,
            primaryType: "ResolveProcess",
            message: { processId: forProcess },
        });

    it("rejects a resolve signer who is not the buyer the signed structs name", async () => {
        // The stranger's signature is genuine and the relay names the stranger
        // as buyer — recovery alone would pass.
        const relay = relayFor([honestView()], {
            buyer: stranger.address,
            sig: await signResolve(stranger),
        });
        const result = await readVerifiedBatchProcess(client, CHAIN_ID, processId, {
            client: relay as never,
            isAnchored: anchored,
            isIncluded: included,
        });
        expect(result.resolution?.signature.ok).toBe(false);
        expect(result.resolution?.signature.detail).toContain("the signed structs name");
    });

    it("does not tie a resolve signer to a buyer when no order passed its checks", async () => {
        const relay = relayFor([honestView({ commit: null })], {
            buyer: buyer.address,
            sig: await signResolve(buyer),
        });
        const result = await readVerifiedBatchProcess(client, CHAIN_ID, processId, {
            client: relay as never,
            isAnchored: anchored,
            isIncluded: included,
        });
        expect(result.resolution?.signature.ok).toBe(false);
        expect(result.resolution?.signature.detail).toContain("cannot be tied to the buyer");
    });

    it("rejects a process resolution whose batch is not on chain", async () => {
        const commitOnly: StateRootAnchorCheck = async (b) =>
            b.new_state_root === NEW_ROOT
                ? { id: "state-root-anchor", ok: true, detail: "anchored (stub)" }
                : { id: "state-root-anchor", ok: false, detail: "not on chain (stub)" };
        const relay = relayFor([honestView({ resolution: null })], {
            buyer: buyer.address,
            sig: await signResolve(buyer),
            batch: { ...batchRef, batch: 2, new_state_root: `0x${"33".repeat(32)}` },
        });
        const result = await readVerifiedBatchProcess(client, CHAIN_ID, processId, {
            client: relay as never,
            isAnchored: commitOnly,
            isIncluded: included,
        });
        expect(result.resolution?.signature.ok).toBe(false);
        expect(result.resolution?.signature.detail).toContain("not on chain");
    });

    it("a process resolution signed over ANOTHER process does not verify for this one", async () => {
        const relay = relayFor([honestView()], {
            buyer: buyer.address,
            sig: await signResolve(buyer, `0x${"cd".repeat(32)}`),
        });
        const result = await readVerifiedBatchProcess(client, CHAIN_ID, processId, {
            client: relay as never,
            isAnchored: anchored,
            isIncluded: included,
        });
        expect(result.resolution?.signature.ok).toBe(false);
    });

    it("refuses a relay that answers with a different process than the one asked for", async () => {
        // Process Y's records served under ?process=X: nothing of Y renders as X.
        const relay = relayFor([honestView()], null, `0x${"cd".repeat(32)}`);
        const result = await readVerifiedBatchProcess(client, CHAIN_ID, processId, {
            client: relay as never,
            isAnchored: anchored,
            isIncluded: included,
        });
        expect(result.status).toBe("unreachable");
        expect(result.orders).toEqual([]);
        expect(result.error).toContain("the relay answered with process");
    });
});


// ── Inclusion under the verifier's CURRENT root ─────────────────────────────
//
// The relay's `GET /state` is the preimage of `FigaroBatchVerifier.stateRoot`.
// The reader recomputes the root from it (the port is locked against the Rust
// in batchStateRoot.test.ts), holds it to the verifier's on-chain root, and
// reads the order's status there. No inclusion proof is needed: the whole
// preimage is.

const OTHER_ROOT = `0x${"99".repeat(32)}` as Hex;

/** A `/state` body as the Rust serializes `KernelStateSnapshot`. */
function stateBody(orders: { hash: string; status: number; process: string }[]): string {
    return JSON.stringify({
        processes: [[processId, {
            root_buyer: buyer.address.toLowerCase(),
            currency: commitment.currency.toLowerCase(),
            cumulative_value: hexQty(commitment.expectedCumulativeValue),
            active_order_count: 0,
        }]],
        order_status: orders.map((o) => [o.hash, o.status]),
        order_process_id: orders.map((o) => [o.hash, o.process]),
        usage_counted: [],
        usage_seller_seen: [],
        usage_accrual: [],
    });
}
const rootOf = (text: string) => computeKernelStateRoot(parseKernelStateSnapshot(text));

function inclusionOver(
    text: string,
    opts: { chainRoot?: Hex; headerRoot?: string | null } = {},
): { check: StateInclusionCheck; loads: () => number } {
    let n = 0;
    const root = rootOf(text);
    const check = createStateInclusionCheck({
        loadState: async () => {
            n += 1;
            return { text, headerRoot: opts.headerRoot === undefined ? root : opts.headerRoot };
        },
        readStateRoot: async () => opts.chainRoot ?? root,
    });
    return { check, loads: () => n };
}

describe("state-inclusion — the order read from the preimage of the verifier's root", () => {
    it("an order RESOLVED under the verifier's root reads as included and resolved", async () => {
        const text = stateBody([{ hash: orderHash, status: 2, process: processId }]);
        const { check } = inclusionOver(text);
        const result = await verifyBatchOrder(honestView(), ctx(anchored, check));
        const c = checkFor(result.checks, "state-inclusion");
        expect(c?.ok).toBe(true);
        expect(c?.detail).toContain(rootOf(text));
        expect(c?.detail).toContain("resolved");
        expect(result.verdict).toBe("verified");
        expect(result.order).not.toBeNull();
    });

    it("an OPEN order committed under the verifier's root reads as included and open", async () => {
        const text = stateBody([{ hash: orderHash, status: 1, process: processId }]);
        const { check } = inclusionOver(text);
        const result = await verifyBatchOrder(honestView({ resolution: null }), ctx(anchored, check));
        const c = checkFor(result.checks, "state-inclusion");
        expect(c?.ok).toBe(true);
        expect(c?.detail).toContain("open");
        expect(result.verdict).toBe("verified");
    });

    it("EXCLUDED: an order absent from the state behind the root is FAILED, never verified", async () => {
        // The case the anchor alone could not catch: a struct both parties
        // signed but no batch ever committed.
        const text = stateBody([{ hash: `0x${"77".repeat(32)}`, status: 2, process: processId }]);
        const { check } = inclusionOver(text);
        const result = await verifyBatchOrder(honestView(), ctx(anchored, check));
        const c = checkFor(result.checks, "state-inclusion");
        expect(c?.ok).toBe(false);
        expect(c?.detail).toContain("not in the state");
        expect(result.verdict).toBe("failed");
        expect(result.order).toBeNull();
    });

    it("a relay claiming RESOLVED for an order the state holds open is FAILED", async () => {
        const text = stateBody([{ hash: orderHash, status: 1, process: processId }]);
        const { check } = inclusionOver(text);
        const result = await verifyBatchOrder(honestView(), ctx(anchored, check));
        const c = checkFor(result.checks, "state-inclusion");
        expect(c?.ok).toBe(false);
        expect(c?.detail).toContain("open");
        expect(result.verdict).toBe("failed");
    });

    it("a relay omitting the resolution of an order the state holds resolved is FAILED", async () => {
        const text = stateBody([{ hash: orderHash, status: 2, process: processId }]);
        const { check } = inclusionOver(text);
        const result = await verifyBatchOrder(honestView({ resolution: null }), ctx(anchored, check));
        expect(checkFor(result.checks, "state-inclusion")?.ok).toBe(false);
        expect(result.verdict).toBe("failed");
    });

    it("an order the state files under another process is FAILED", async () => {
        const text = stateBody([{ hash: orderHash, status: 2, process: `0x${"cd".repeat(32)}` }]);
        const { check } = inclusionOver(text);
        const result = await verifyBatchOrder(honestView(), ctx(anchored, check));
        const c = checkFor(result.checks, "state-inclusion");
        expect(c?.ok).toBe(false);
        expect(c?.detail).toContain("process");
        expect(result.verdict).toBe("failed");
    });

    it("ROOT MISMATCH: a /state that does not recompute to the verifier's root is FAILED, naming both roots", async () => {
        const text = stateBody([{ hash: orderHash, status: 2, process: processId }]);
        const { check } = inclusionOver(text, { chainRoot: OTHER_ROOT });
        const result = await verifyBatchOrder(honestView(), ctx(anchored, check));
        const c = checkFor(result.checks, "state-inclusion");
        expect(c?.ok).toBe(false);
        expect(c?.detail).toContain(rootOf(text));
        expect(c?.detail).toContain(OTHER_ROOT);
        expect(result.verdict).toBe("failed");
        expect(result.order).toBeNull();
    });

    it("a relay whose root header names a root other than its body's is FAILED", async () => {
        const text = stateBody([{ hash: orderHash, status: 2, process: processId }]);
        const { check } = inclusionOver(text, { headerRoot: OTHER_ROOT });
        const result = await verifyBatchOrder(honestView(), ctx(anchored, check));
        const c = checkFor(result.checks, "state-inclusion");
        expect(c?.ok).toBe(false);
        expect(c?.detail).toContain("x-figaro-state-root");
    });

    it("an absent root header is not a failure — the verifier's root is the check", async () => {
        const text = stateBody([{ hash: orderHash, status: 2, process: processId }]);
        const { check } = inclusionOver(text, { headerRoot: null });
        const result = await verifyBatchOrder(honestView(), ctx(anchored, check));
        expect(checkFor(result.checks, "state-inclusion")?.ok).toBe(true);
    });

    it("an unparseable /state is FAILED, never skipped", async () => {
        const check = createStateInclusionCheck({
            loadState: async () => ({ text: "{ not the guest's state", headerRoot: null }),
            readStateRoot: async () => OTHER_ROOT,
        });
        const result = await verifyBatchOrder(honestView(), ctx(anchored, check));
        expect(checkFor(result.checks, "state-inclusion")?.ok).toBe(false);
        expect(result.verdict).toBe("failed");
    });

    it("an unreachable /state is FAILED with the reason", async () => {
        const check = createStateInclusionCheck({
            loadState: async () => { throw new Error("connection refused"); },
            readStateRoot: async () => OTHER_ROOT,
        });
        const result = await verifyBatchOrder(honestView(), ctx(anchored, check));
        const c = checkFor(result.checks, "state-inclusion");
        expect(c?.ok).toBe(false);
        expect(c?.detail).toContain("connection refused");
    });

    it("reads /state once for every order of a process", async () => {
        const text = stateBody([{ hash: orderHash, status: 2, process: processId }]);
        const { check, loads } = inclusionOver(text);
        await Promise.all([check(orderHash, processId, true), check(orderHash, processId, true)]);
        expect(loads()).toBe(1);
    });
});

describe("readVerifiedBatchProcess — the default inclusion check reads the relay's /state and the verifier's root", () => {
    const RELAY = "http://relay.test";

    it("fetches GET /state from the relay the page reads and holds it to FigaroBatchVerifier.stateRoot", async () => {
        readUserEndpointsMock.mockReturnValue({ batchRelayUrl: RELAY });
        const text = stateBody([{ hash: orderHash, status: 2, process: processId }]);
        const root = rootOf(text);
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(text, { status: 200, headers: { "x-figaro-state-root": root } }),
        );
        vi.stubGlobal("fetch", fetchMock);
        const readContract = vi.fn().mockResolvedValue(root);
        const relay = {
            process: vi.fn().mockResolvedValue({ process_id: processId, orders: [honestView()], resolution: null }),
            status: vi.fn().mockResolvedValue({ archive: null }),
        };
        try {
            const result = await readVerifiedBatchProcess(
                { readContract } as unknown as PublicClient,
                CHAIN_ID,
                processId,
                { client: relay as never, isAnchored: anchored },
            );
            expect(fetchMock).toHaveBeenCalledTimes(1);
            expect(String(fetchMock.mock.calls[0]?.[0])).toBe(`${RELAY}/state`);
            expect(readContract).toHaveBeenCalledWith(
                expect.objectContaining({ address: VERIFIER, functionName: "stateRoot" }),
            );
            expect(checkFor(result.orders[0]!.checks, "state-inclusion")?.ok).toBe(true);
            expect(result.orders[0]?.verdict).toBe("verified");
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it("fails every order when the verifier's root is not the relay's", async () => {
        readUserEndpointsMock.mockReturnValue({ batchRelayUrl: RELAY });
        const text = stateBody([{ hash: orderHash, status: 2, process: processId }]);
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(text, { status: 200 })));
        const relay = {
            process: vi.fn().mockResolvedValue({ process_id: processId, orders: [honestView()], resolution: null }),
            status: vi.fn().mockResolvedValue({ archive: null }),
        };
        try {
            const result = await readVerifiedBatchProcess(
                { readContract: vi.fn().mockResolvedValue(OTHER_ROOT) } as unknown as PublicClient,
                CHAIN_ID,
                processId,
                { client: relay as never, isAnchored: anchored },
            );
            expect(result.orders[0]?.verdict).toBe("failed");
            expect(checkFor(result.orders[0]!.checks, "state-inclusion")?.detail).toContain(OTHER_ROOT);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    /** The state-inclusion check of one order read against `response` as the relay's /state. */
    async function inclusionAgainst(response: Response) {
        readUserEndpointsMock.mockReturnValue({ batchRelayUrl: RELAY });
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
        const relay = {
            process: vi.fn().mockResolvedValue({ process_id: processId, orders: [honestView()], resolution: null }),
            status: vi.fn().mockResolvedValue({ archive: null }),
        };
        try {
            const result = await readVerifiedBatchProcess(
                { readContract: vi.fn().mockResolvedValue(OTHER_ROOT) } as unknown as PublicClient,
                CHAIN_ID,
                processId,
                { client: relay as never, isAnchored: anchored },
            );
            return { verdict: result.orders[0]?.verdict, check: checkFor(result.orders[0]!.checks, "state-inclusion") };
        } finally {
            vi.unstubAllGlobals();
        }
    }

    /** A body stream of `chunks` chunks of `size` bytes, counting what is pulled and whether it is canceled. */
    function countedStream(chunks: number, size: number) {
        const chunk = new Uint8Array(size).fill(0x20);
        let pulled = 0;
        let canceled = false;
        const stream = new ReadableStream<Uint8Array>({
            pull(controller) {
                if (pulled === chunks) {
                    controller.close();
                    return;
                }
                pulled += 1;
                controller.enqueue(chunk);
            },
            cancel() {
                canceled = true;
            },
        });
        return { stream, pulled: () => pulled, canceled: () => canceled };
    }

    it("refuses a /state whose Content-Length is over the page's limit, reading none of it", async () => {
        const body = countedStream(1, 16);
        const { verdict, check } = await inclusionAgainst(
            new Response(body.stream, {
                status: 200,
                headers: { "content-length": String(MAX_RELAY_STATE_BYTES + 1) },
            }),
        );
        expect(verdict).toBe("failed");
        expect(check?.ok).toBe(false);
        expect(check?.detail).toContain(`${MAX_RELAY_STATE_BYTES + 1} bytes`);
        expect(check?.detail).toContain(`${MAX_RELAY_STATE_BYTES}-byte limit`);
        expect(body.pulled()).toBeLessThanOrEqual(1);
    });

    it("refuses a /state that streams past the page's limit with no Content-Length, and stops reading", async () => {
        const size = 1 << 20;
        const chunks = MAX_RELAY_STATE_BYTES / size + 8;
        const body = countedStream(chunks, size);
        const { verdict, check } = await inclusionAgainst(new Response(body.stream, { status: 200 }));
        expect(verdict).toBe("failed");
        expect(check?.ok).toBe(false);
        expect(check?.detail).toContain(`streamed past ${MAX_RELAY_STATE_BYTES} bytes`);
        expect(check?.detail).toContain(`${MAX_RELAY_STATE_BYTES}-byte limit`);
        expect(body.canceled()).toBe(true);
        expect(body.pulled()).toBeLessThan(chunks);
    });
});

// ── A relay payload whose bytes come from Foundry's signer ──────────────────
//
// The commitment fields, the order hash, the process id and both signatures
// were computed with `cast` (Foundry's Rust signer): the EIP-712 digest over
// the verifier's domain, signed with `cast wallet sign --no-hash` by anvil
// accounts 1 and 2. This is the cross-language lock: the bytes come from an
// implementation other than the TypeScript one, so if the TypeScript
// derivation ever drifts — a different typehash, the wrong domain, a decimal
// reading of a hex quantity — these assertions break. Regenerating them from
// TypeScript would make the test check itself. The batch reference's state
// roots and resolution tx below are illustrative: no assertion reads them.

const REAL_VERIFIER = "0xe45a1e7f99aaa9854ef947c218d4eeedb214dc92" as const;
const REAL_COMMIT = {
    order_hash: "0x2a4816b4025d086ff8750296175188242786a92a9c6e1c253aa6f79d72fde3e6",
    process_id: "0x13dca04d6ed7de2287a4a2693c6fd0f68fef0b8040f30b48fddd0f763ba0fef2",
    commitment: {
        process_id: ZERO_BYTES32,
        buyer: "0x70997970c51812dc3a010c7d01b50e0d17dc79c8",
        seller: "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc",
        currency: "0xac9bf8120e173525a0c7779b96466f5455ca9280",
        payment: "0x56bc75e2d63100000",
        expected_cumulative_value: "0x56bc75e2d63100000",
        checkout_hash: "0x8fc2dbb8825e453a9be2595f9037f6ef1e7dae3c8779f2a5b03647286c8dc31d",
        salt: "0x2a",
        deadline: "0x6a6d1d0c",
    },
    buyer_signature: {
        v: 27,
        r: "0x0bdcd4ba55d89b4a39d180063bdef0c47abd1d80d7aeadfe655dd59b88fe6dd2",
        s: "0x1f1514df3e473c00ba9af4ef924519d89a4082b72ae3d81dd2f0f335baa75274",
    },
    seller_signature: {
        v: 27,
        r: "0x4b9c061088bf917efe36aba5dc6c59f6330d9f1bc3641c7fe0ca70143b0fed46",
        s: "0x3be6ef5198555a0de1f9ec713737319bf2c21aadd7a6b83ab6f91d0644c348c8",
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
    resolution_tx: "0x8c338170d86a8cf452a3bf3790c581a456fffc7b17c67d977ae2a5d864d3bf7f",
    block_timestamp: 1785532158,
};

describe("a payload from Foundry's signer", () => {
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
            processId: REAL_COMMIT.process_id,
            isAnchored: anchored,
            isIncluded: included,
        });
        expect(checkFor(result.checks, "buyer-signature")?.ok).toBe(true);
        expect(checkFor(result.checks, "seller-signature")?.ok).toBe(true);
        expect(result.verdict).toBe("verified");
    });

    it("recomputes the real payouts (2 × ECV + payment, and payment)", async () => {
        const result = await verifyBatchOrder(realView(), {
            chainId: 31337,
            verifier: REAL_VERIFIER,
            processId: REAL_COMMIT.process_id,
            isAnchored: anchored,
            isIncluded: included,
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
