/**
 * lib/audit/batchRelay.ts — reading BATCH-SETTLED trade, and re-deriving every
 * word of it before `/audit` shows any of it.
 *
 * ── Why this file exists ────────────────────────────────────────────────────
 *
 * `FigaroCore` does two things for an order: it SETTLES it and it PUBLISHES it
 * (`OrderCommitted`/`OrderSeller`/`OrderCurrency` carry the whole struct, and
 * the two signatures sit in the commit transaction's calldata). The batch path
 * settles the same trade and publishes none of it: `FigaroBatchVerifier`'s
 * public values carry no order hashes, its storage is `stateRoot` +
 * `batchCount`, and `BatchSettled` names no order. So a batched order's buyer,
 * seller, payment and `agreementHash` exist only under the proven state root,
 * and every reader built on `OrderCommitted` logs — `useProcessOrders`,
 * `useWalletOrders` — finds NOTHING for batched trade.
 *
 * A relay (`prover/sequencer`) mirrors the kernel's publication role for that
 * universe. This module reads it.
 *
 * ── THE POSTURE: the relay is TRANSPORT, not authority ──────────────────────
 *
 * This is the frontend's first read source that is not the network, so it is
 * governed rather than trusted. NOTHING a relay says is displayed until this
 * module re-derives it from the signed struct and anchors it on chain:
 *
 *   domain            the record's declared `chain_id` + `verifying_contract`
 *                     must be the chain we are reading and the verifier THIS
 *                     deployment trusts. Without this a relay could hand over a
 *                     struct genuinely signed for some other contract and have
 *                     every downstream signature check pass against a domain of
 *                     its own choosing.
 *   order-hash        the commitment must re-derive its own `order_hash`.
 *   process-id        and, for a root order (signed `processId == 0`), its own
 *                     `process_id` — the kernel's derivation, recomputed here.
 *   buyer-signature   both signatures must recover to the buyer and seller
 *   seller-signature  named INSIDE that struct — over the VERIFIER's EIP-712
 *                     domain, not FigaroCore's.
 *   payouts           `seller_payout`/`buyer_payout` must recompute from the
 *                     struct (`2 × expectedCumulativeValue + payment`, and
 *                     `payment`) — they are a pure function of what was signed.
 *   resolve-signature the buyer signature that authorized resolution must
 *                     recover to the buyer — the batched form of the kernel's
 *                     `msg.sender == rootBuyer`.
 *   state-root-anchor the batch's `new_state_root` must appear in a
 *                     `BatchSettled` this verifier emitted on chain.
 *
 * A record failing ANY check renders as FAILED — loudly, naming the check and
 * the mismatch. It is never silently dropped and never softened, because a
 * relay that publishes a struct nobody signed must be visibly caught, not
 * quietly ignored. A relay can omit or delay; it can never forge.
 *
 * ZERO new crypto: the derivations are the SDK's own `computeOrderHash`,
 * `computeCommitmentProcessId`, `verifyCommitmentSignature`,
 * `verifyResolveProcessSignature` and `calculateSettlement` — the same
 * functions the direct path uses, pointed at the verifier's domain (they are
 * all parameterized by `verifyingContract`).
 *
 * ── Absence is not failure ──────────────────────────────────────────────────
 *
 * Three distinct outcomes, kept distinct:
 *   - no relay configured  → the batch universe is UNREADABLE here (not empty).
 *   - relay 404            → not in THIS relay's archive: another relay may
 *                            hold it, it may be direct-path, or it aged out of
 *                            retention. Never "did not happen".
 *   - commit leg absent    → that batch aged out of this relay's window; the
 *                            order is real but unverifiable HERE.
 */

import {
    calculateBonds,
    calculateSettlement,
    computeCommitmentProcessId,
    computeOrderHash,
    OrderState,
    verifyCommitmentSignature,
    verifyResolveProcessSignature,
    type Commitment,
} from "@figaro/sdk";
import {
    SequencerClient,
    fromSequencerCommitment,
    fromSequencerSig,
    parseWireQuantity,
    type SequencerBatchRef,
    type SequencerOrderView,
    type SequencerProcessView,
    type SequencerRetentionWindow,
} from "@figaro/sdk/agent";
import type { PublicClient, Hex } from "viem";
import { getBatchVerifier } from "@/lib/composition/contracts";
import { getAllBatchSettled } from "@/lib/composition/indexer";
import { getStringArg } from "@/lib/kernel/indexer";
import { readUserEndpoints } from "@/lib/shared/userEndpoints";
import { hexEqual } from "@/lib/shared/evm";
import { extractErrorMessage } from "@/lib/shared/errors";
import type { Order } from "@/lib/kernel/store";

// ── Relay endpoint — deployment config, resolved-empty means ABSENCE ─────────

/**
 * The relay this deployment points at by default. There is deliberately NO
 * fallback value: a relay is one publisher among any number (settlement is
 * permissionless, so anyone can run one), and defaulting readers onto an
 * endpoint of ours would make a convenience look like an authority and seize
 * every visitor onto our node. Unset means the batch universe is unreadable
 * here — which the UI says plainly and points at running your own.
 */
const BATCH_RELAY_URL = process.env.NEXT_PUBLIC_BATCH_RELAY_URL || "";

/** Mirrors `userEndpoints.sanitize`: an endpoint is an http(s) base URL, and
 *  anything else is refused outright rather than handed to `fetch`. */
function resolveRelayUrl(raw: string | undefined): string | null {
    if (typeof raw !== "string") return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;
    if (!/^https?:\/\//.test(trimmed)) return null;
    return trimmed.replace(/\/$/, "");
}

/**
 * The single canonical resolver for the batch relay endpoint — the same
 * resolved-empty contract as `getBatchVerifier()` and the other composition
 * resolvers. Returns null when unset or malformed.
 *
 * MULTIPLE RELAYS ARE LEGAL BY CONSTRUCTION, so the user's own choice wins over
 * the build-baked default: whoever is reading may point at any relay, or at
 * their own, and it is the verification above — not the endpoint's provenance —
 * that makes doing so safe.
 *
 * Resolved-empty: null = no relay configured, so batched trade is UNREADABLE
 * from here. That is absence of a reader, never "the trade did not happen" and
 * never "the process is empty".
 */
export function getBatchRelayUrl(): string | null {
    return resolveRelayUrl(readUserEndpoints().batchRelayUrl) ?? resolveRelayUrl(BATCH_RELAY_URL);
}

// ── Checks ──────────────────────────────────────────────────────────────────

export type BatchRelayCheckId =
    | "domain"
    | "order-hash"
    | "process-id"
    | "buyer-signature"
    | "seller-signature"
    | "payouts"
    | "resolve-signature"
    | "state-root-anchor";

export interface BatchRelayCheck {
    id: BatchRelayCheckId;
    ok: boolean;
    /** Specific enough to act on — displayed verbatim when the check fails. */
    detail: string;
}

const pass = (id: BatchRelayCheckId, detail: string): BatchRelayCheck => ({ id, ok: true, detail });
const fail = (id: BatchRelayCheckId, detail: string): BatchRelayCheck => ({ id, ok: false, detail });

/**
 * Why an order carries no verification result — kept distinct from failure.
 * - "verified"   every applicable check passed; the order may be displayed.
 * - "failed"     at least one check rejected it; display it as FAILED.
 * - "unretained" the committing batch aged out of this relay's window, so
 *                there is no struct to check. Absence, not a bad record.
 *
 * @public — names the type of `VerifiedBatchOrder.verdict`, so any consumer
 * branching on a record's verdict needs it even though nothing imports it by
 * name today.
 */
export type BatchOrderVerdict = "verified" | "failed" | "unretained";

export interface VerifiedBatchOrder {
    orderHash: string;
    processId: string;
    verdict: BatchOrderVerdict;
    checks: BatchRelayCheck[];
    /** The subset that rejected — non-empty exactly when verdict is "failed". */
    failures: BatchRelayCheck[];
    /** The UI projection every other `/audit` surface consumes. Populated ONLY
     *  for a "verified" order: unverified data never reaches a render path. */
    order: Order | null;
    /** Where the fact was published — the reader's handle for anchoring it. */
    batch: SequencerBatchRef | null;
    /** Recomputed from the signed struct, not copied from the relay. */
    payouts: { sellerPayout: bigint; buyerPayout: bigint } | null;
}

/** Injectable anchor check, so the pure verification above is unit-testable
 *  without a chain and the chain read has exactly one implementation. */
export type StateRootAnchorCheck = (batch: SequencerBatchRef) => Promise<BatchRelayCheck>;

export interface BatchVerifyContext {
    /** The chain the reader is actually on. */
    chainId: number;
    /** The verifier THIS deployment trusts, from `getBatchVerifier()`. */
    verifier: `0x${string}`;
    isAnchored: StateRootAnchorCheck;
}

// ── Per-order verification ──────────────────────────────────────────────────

/** The record's declared domain must be the one we trust. Checked FIRST: every
 *  later check derives against this domain, so accepting the relay's word for
 *  it would let it choose the domain its evidence is graded under. */
function checkDomain(batch: SequencerBatchRef, ctx: BatchVerifyContext): BatchRelayCheck {
    if (batch.chain_id !== ctx.chainId) {
        return fail(
            "domain",
            `record declares chain ${batch.chain_id}, but this reader is on chain ${ctx.chainId}`,
        );
    }
    if (!hexEqual(batch.verifying_contract, ctx.verifier)) {
        return fail(
            "domain",
            `record declares verifyingContract ${batch.verifying_contract}, but this deployment's FigaroBatchVerifier is ${ctx.verifier}`,
        );
    }
    return pass("domain", `signed under chain ${batch.chain_id}, verifier ${batch.verifying_contract}`);
}

function checkPayouts(
    commitment: Commitment,
    view: SequencerOrderView,
): { check: BatchRelayCheck; payouts: { sellerPayout: bigint; buyerPayout: bigint } | null } {
    const resolution = view.resolution;
    if (!resolution) {
        return {
            check: pass("payouts", "process still open — no resolution published"),
            payouts: null,
        };
    }
    // The kernel's own arithmetic, via the SDK: sellerPayout = payment +
    // sellerBond (2 × expectedCumulativeValue); buyerPayout = buyerBond
    // (2 × payment) − payment == payment.
    const bonds = calculateBonds(commitment.expectedCumulativeValue, commitment.payment);
    const expected = calculateSettlement(commitment.payment, bonds.sellerBond, bonds.buyerBond);

    let claimedSeller: bigint;
    let claimedBuyer: bigint;
    try {
        claimedSeller = parseWireQuantity(resolution.seller_payout, "seller_payout");
        claimedBuyer = parseWireQuantity(resolution.buyer_payout, "buyer_payout");
    } catch (e) {
        return {
            check: fail("payouts", extractErrorMessage(e, "payout amounts are unparseable")),
            payouts: null,
        };
    }

    if (!hexEqual(resolution.seller, commitment.seller)) {
        return {
            check: fail(
                "payouts",
                `resolution pays seller ${resolution.seller}, but the signed struct names ${commitment.seller}`,
            ),
            payouts: null,
        };
    }
    if (claimedSeller !== expected.sellerPayout || claimedBuyer !== expected.buyerPayout) {
        return {
            check: fail(
                "payouts",
                `published payouts (seller ${claimedSeller}, buyer ${claimedBuyer}) do not match the signed struct (seller ${expected.sellerPayout}, buyer ${expected.buyerPayout})`,
            ),
            payouts: null,
        };
    }
    return {
        check: pass(
            "payouts",
            `seller ${expected.sellerPayout} = 2 × ${commitment.expectedCumulativeValue} + ${commitment.payment}; buyer ${expected.buyerPayout}`,
        ),
        payouts: { sellerPayout: expected.sellerPayout, buyerPayout: expected.buyerPayout },
    };
}

/**
 * Re-derive everything one published order claims. The relay supplies bytes;
 * every fact returned here was recomputed from the signed struct or read off
 * the chain.
 */
export async function verifyBatchOrder(
    view: SequencerOrderView,
    ctx: BatchVerifyContext,
): Promise<VerifiedBatchOrder> {
    const base = { orderHash: view.order_hash, processId: view.process_id };

    if (!view.commit) {
        // The resolution leg may still be retained; either way there is no
        // struct to check, so we assert nothing about this order.
        return {
            ...base,
            verdict: "unretained",
            checks: [],
            failures: [],
            order: null,
            batch: view.resolution?.batch ?? null,
            payouts: null,
        };
    }

    const { commitment: wire, buyer_signature, seller_signature, batch } = view.commit;
    const checks: BatchRelayCheck[] = [];

    const domain = checkDomain(batch, ctx);
    checks.push(domain);

    let commitment: Commitment;
    try {
        commitment = fromSequencerCommitment(wire);
    } catch (e) {
        checks.push(fail("order-hash", extractErrorMessage(e, "commitment struct is unparseable")));
        return finish(base, checks, null, batch, null);
    }

    // Derive against the domain the record DECLARES. When `domain` failed, the
    // checks below are still run and reported — but the failed domain check
    // already makes the verdict "failed", so nothing here can rehabilitate it.
    const derivationCore = batch.verifying_contract as `0x${string}`;
    const derivationChain = batch.chain_id;

    const derivedOrderHash = computeOrderHash(commitment, derivationChain, derivationCore);
    checks.push(
        hexEqual(derivedOrderHash, view.order_hash)
            ? pass("order-hash", `struct re-derives ${derivedOrderHash}`)
            : fail(
                "order-hash",
                `struct hashes to ${derivedOrderHash}, but the relay published it as ${view.order_hash}`,
            ),
    );

    const derivedProcessId = computeCommitmentProcessId(commitment, derivationChain, derivationCore);
    checks.push(
        hexEqual(derivedProcessId, view.process_id)
            ? pass("process-id", `struct re-derives ${derivedProcessId}`)
            : fail(
                "process-id",
                `struct derives processId ${derivedProcessId}, but the relay published it under ${view.process_id}`,
            ),
    );

    // Both signatures must recover to the parties named INSIDE the struct —
    // never to a party the relay names alongside it.
    const sigCtx = { chainId: derivationChain, core: derivationCore };
    for (const [id, sig, signer, role] of [
        ["buyer-signature", buyer_signature, commitment.buyer, "buyer"],
        ["seller-signature", seller_signature, commitment.seller, "seller"],
    ] as const) {
        let ok = false;
        let reason = "";
        try {
            ok = await verifyCommitmentSignature(commitment, fromSequencerSig(sig), signer, sigCtx);
        } catch (e) {
            reason = extractErrorMessage(e, "signature is malformed");
        }
        checks.push(
            ok
                ? pass(id, `recovers to the ${role} named in the struct (${signer})`)
                : fail(
                    id,
                    reason ||
                    `does not recover to the ${role} named in the struct (${signer}) under the verifier's domain`,
                ),
        );
    }

    const { check: payoutCheck, payouts } = checkPayouts(commitment, view);
    checks.push(payoutCheck);

    checks.push(await ctx.isAnchored(batch));

    return finish(base, checks, commitment, batch, payouts);
}

function finish(
    base: { orderHash: string; processId: string },
    checks: BatchRelayCheck[],
    commitment: Commitment | null,
    batch: SequencerBatchRef,
    payouts: { sellerPayout: bigint; buyerPayout: bigint } | null,
): VerifiedBatchOrder {
    const failures = checks.filter((c) => !c.ok);
    const verdict: BatchOrderVerdict = failures.length === 0 ? "verified" : "failed";
    return {
        ...base,
        verdict,
        checks,
        failures,
        // Unverified data never reaches a render path.
        order: verdict === "verified" && commitment
            ? toOrder(base.orderHash, base.processId, commitment, payouts !== null, batch)
            : null,
        batch,
        payouts,
    };
}

/**
 * Project a verified commitment into the `Order` shape every other `/audit`
 * surface already consumes, so the financial statements, the audit bundle and
 * the clause evidence need no batch-specific branch.
 *
 * `blockNumber` is deliberately absent: a batch record carries a block
 * TIMESTAMP, not a number, and inventing one would fabricate chain state. The
 * batch reference is carried alongside instead.
 */
function toOrder(
    orderHash: string,
    processId: string,
    c: Commitment,
    resolved: boolean,
    batch: SequencerBatchRef,
): Order {
    const bonds = calculateBonds(c.expectedCumulativeValue, c.payment);
    return {
        orderHash,
        processId,
        buyer: c.buyer,
        seller: c.seller,
        currency: c.currency,
        agreementHash: c.agreementHash,
        cumulativeValue: c.expectedCumulativeValue,
        payment: c.payment,
        state: resolved ? OrderState.Resolved : OrderState.Active,
        sellerBond: bonds.sellerBond,
        buyerBond: bonds.buyerBond,
        salt: c.salt,
        deadline: c.deadline,
        resolvedAt: resolved ? batch.block_timestamp : undefined,
    };
}

// ── The chain anchor ────────────────────────────────────────────────────────

/**
 * Is this batch's `new_state_root` actually on chain?
 *
 * `BatchSettled(uint64 indexed batchId, bytes32 indexed prevStateRoot,
 * bytes32 indexed newStateRoot, uint256 positionCount)` — the root is an
 * INDEXED topic, so the verifier's own log stream is the anchor. A relay's
 * `batch` number is its private cursor and proves nothing; the state-root
 * transition is the chain-anchored identity.
 *
 * A dry run (`settlement_tx == null`) is reported as UNANCHORED rather than
 * accepted: the batch proved, but nothing settled, so the trade did not happen
 * on chain.
 */
export function createStateRootAnchorCheck(
    client: PublicClient,
    chainId: number,
): StateRootAnchorCheck {
    return async (batch) => {
        if (!batch.settlement_tx) {
            return fail(
                "state-root-anchor",
                `relay published this as a DRY RUN (no settlement transaction) — the batch proved but never settled on chain`,
            );
        }
        let settled;
        try {
            settled = await getAllBatchSettled(client, chainId);
        } catch (e) {
            return fail(
                "state-root-anchor",
                extractErrorMessage(e, "could not read BatchSettled logs to anchor this batch"),
            );
        }
        const match = settled.find((l) => hexEqual(getStringArg(l, "newStateRoot"), batch.new_state_root));
        if (!match) {
            return fail(
                "state-root-anchor",
                `no BatchSettled on this verifier carries state root ${batch.new_state_root} — the relay's claimed settlement is not on chain`,
            );
        }
        if (!hexEqual(match.transactionHash ?? null, batch.settlement_tx)) {
            return fail(
                "state-root-anchor",
                `state root ${batch.new_state_root} was settled in ${match.transactionHash}, not in the ${batch.settlement_tx} the relay named`,
            );
        }
        return pass(
            "state-root-anchor",
            `state root ${batch.new_state_root} settled on chain in ${match.transactionHash}`,
        );
    };
}

// ── Process-level read ──────────────────────────────────────────────────────

/** Why a process read produced no orders — each a DIFFERENT fact.
 *  @public — names the type of `VerifiedBatchProcess.status`, so any consumer
 *  distinguishing "no relay" from "not in this archive" needs it even though
 *  nothing imports it by name today. */
export type BatchRelayStatus =
    /** No relay configured: batched trade is unreadable from here. */
    | "no-relay"
    /** The relay answered, and holds nothing under this process id. */
    | "not-in-archive"
    /** The relay answered with records. */
    | "found"
    /** The relay could not be reached, or answered unusably. */
    | "unreachable"
    /** No FigaroBatchVerifier configured, so nothing could be anchored. */
    | "no-verifier";

export interface VerifiedBatchProcess {
    status: BatchRelayStatus;
    /** The relay actually consulted; null when none was configured. */
    relayUrl: string | null;
    orders: VerifiedBatchOrder[];
    /** The process-level resolution, with its buyer authorization checked. */
    resolution: {
        buyer: string;
        orderCount: number;
        batch: SequencerBatchRef;
        signature: BatchRelayCheck;
    } | null;
    /** The relay's retention window, so a gap is visible rather than silent. */
    window: SequencerRetentionWindow | null;
    /** Set when status is "unreachable" — shown verbatim, never swallowed. */
    error: string | null;
}

const EMPTY = {
    orders: [] as VerifiedBatchOrder[],
    resolution: null,
    window: null,
    error: null,
};

/**
 * Read one process from the configured relay and verify everything it says.
 *
 * The 404 distinction is preserved end to end: "not-in-archive" means this
 * relay does not hold the process — it may have been settled by another relay,
 * settled directly against `FigaroCore`, or aged out of retention. It never
 * means the trade did not happen.
 */
export async function readVerifiedBatchProcess(
    client: PublicClient,
    chainId: number,
    processId: string,
    deps?: { client?: SequencerClient; isAnchored?: StateRootAnchorCheck },
): Promise<VerifiedBatchProcess> {
    const relayUrl = getBatchRelayUrl();
    if (!relayUrl && !deps?.client) {
        return { status: "no-relay", relayUrl: null, ...EMPTY };
    }
    const verifier = getBatchVerifier();
    if (!verifier) {
        // Without the verifier there is no anchor, and an unanchorable record
        // is exactly what this module refuses to display.
        return { status: "no-verifier", relayUrl, ...EMPTY };
    }

    const relay = deps?.client ?? new SequencerClient({ url: relayUrl as string });

    let view: SequencerProcessView | null;
    let window: SequencerRetentionWindow | null = null;
    try {
        view = await relay.process(processId as Hex);
        // Read the retention window regardless, so an aged-out gap is visible
        // rather than looking like absence.
        window = (await relay.status().catch(() => null))?.archive ?? null;
    } catch (e) {
        return {
            status: "unreachable",
            relayUrl,
            ...EMPTY,
            error: extractErrorMessage(e, "the relay could not be reached"),
        };
    }

    if (!view) {
        return { status: "not-in-archive", relayUrl, ...EMPTY, window };
    }

    const ctx: BatchVerifyContext = {
        chainId,
        verifier,
        isAnchored: deps?.isAnchored ?? createStateRootAnchorCheck(client, chainId),
    };

    const orders = await Promise.all(view.orders.map((o) => verifyBatchOrder(o, ctx)));

    let resolution: VerifiedBatchProcess["resolution"] = null;
    if (view.resolution) {
        const r = view.resolution;
        const domain = checkDomain(r.batch, ctx);
        let signature: BatchRelayCheck;
        if (!domain.ok) {
            signature = fail("resolve-signature", domain.detail);
        } else {
            let ok = false;
            let reason = "";
            try {
                ok = await verifyResolveProcessSignature(
                    view.process_id,
                    fromSequencerSig(r.buyer_signature),
                    r.buyer as `0x${string}`,
                    { chainId: r.batch.chain_id, core: r.batch.verifying_contract as `0x${string}` },
                );
            } catch (e) {
                reason = extractErrorMessage(e, "resolution signature is malformed");
            }
            signature = ok
                ? pass("resolve-signature", `buyer ${r.buyer} authorized resolving this process`)
                : fail(
                    "resolve-signature",
                    reason ||
                    `the published authorization does not recover to the named buyer ${r.buyer} — this process's resolution is NOT proven to be buyer-authorized`,
                );
        }
        resolution = {
            buyer: r.buyer,
            orderCount: r.order_count,
            batch: r.batch,
            signature,
        };
    }

    return { status: "found", relayUrl, orders, resolution, window, error: null };
}
