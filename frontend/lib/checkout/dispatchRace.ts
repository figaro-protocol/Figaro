"use client";

/**
 * dispatchRace.ts — the buyer-side dispatch race: market formation with zero
 * contracts (operator-ruled 2026-07-20).
 *
 * An unbound sub-order (a node the adopting seller's profile leaves without a
 * counterparty — the SAME derived absence the manual picker resolves) can be
 * filled by racing the market instead of picking by hand:
 *
 *   1. Candidates are the live discovered-seller set whose catalogue can
 *      price the node (`resolveSubOrderPricing` — the ruled first-available-
 *      item rule, rate items included). A registry read, never a roster;
 *      resolved-empty = nothing to race.
 *   2. One dry walk per candidate (`planAssemblyOrders`, fixed per-node salts
 *      + one deadline) produces that candidate's EXACT commitment struct at
 *      their own posted price. The raced node's order is the draft — relayed
 *      UNSIGNED. Nothing about a draft binds anyone, and it cannot be
 *      broadcast (the kernel needs both signatures).
 *   3. Candidates countersign to answer "available at my posted price" —
 *      binding only if the buyer commits it, bounded by the struct deadline.
 *   4. Cheapest valid countersigner auto-wins at window close (the buyer may
 *      pick any reply instead — buyer dominance); the checkout then executes
 *      with the winner as the node's selection, the fixed salts + deadline
 *      reproducing the drafted struct, and the winner's countersignature
 *      riding the relay — the winner receives a commit-ready order.
 *
 * The race window and the candidate count are checkout-time buyer policy —
 * never a stored field on the payload, the template, or any profile.
 *
 * RELAY LEG — deliberately NOT `shareSignedOrder` (whose documented
 * precondition is a BUYER-signed, final, pinnable order): a race payload is
 * either an unsigned draft (buyer → candidate) or a countersigned-only reply
 * (candidate → buyer). Neither is final; the pin is ephemeral coordination
 * state, not evidence. Both legs share one mechanic: pin the payload, relay
 * its CID keyed by the commitment's order hash.
 */

import { useCallback, useRef, useState } from "react";
import { useChainId, useWalletClient } from "wagmi";
import {
    hashCommitmentStruct,
    resolveSubOrderPricing,
} from "@figaro/sdk";
import {
    deserializeCommitmentPayload,
    serializeCommitmentPayload,
    selectRaceWinner,
    verifyRaceReply,
    type CommitmentPayload,
    type RaceReply,
} from "@figaro/sdk/agent";
import { generateSalt } from "@figaro/sdk";
import { planAssemblyOrders, type AssemblyCheckoutParams } from "@/lib/checkout/assemblyCheckout";
import { chainDeadline } from "@/lib/checkout/orderPreview";
import { commitmentOrderHash } from "@/lib/kernel/signedCommitment";
import { fetchCommitmentPayloadJsonByCid } from "@/lib/checkout/orderPendingSellerSignature";
import type { CommitmentPayloadRelay } from "@/lib/checkout/orderSignedAndShared";
import { CONTRACTS } from "@/lib/kernel/contracts";
import { useRuntimeServices } from "@/lib/shared/runtimeServicesContext";
import { specSource } from "@/lib/shared/clauseSpecSource";
import { formatToken } from "@/lib/shared/utils";
import { hexEqual } from "@/lib/shared/evm";
import { extractErrorMessage } from "@/lib/shared/errors";
import type { IpfsService } from "@/lib/shared/ipfsService";

type Hex = `0x${string}`;

interface WalletMessageSigner {
    signMessage(params: { message: string }): Promise<Hex>;
}

/**
 * Pin a race payload and relay its CID — the ONE mechanic under both race
 * legs (draft out, countersigned reply back). See the module doc for why this
 * is not `shareSignedOrder`. Returns the coordination-channel order id.
 */
export async function relayRacePayload(params: {
    payload: CommitmentPayload;
    recipientAddress: string;
    senderAddress: string;
    walletClient?: WalletMessageSigner | null;
    chainId: number;
    coordinationMessaging: CommitmentPayloadRelay;
    evidenceTransport: Pick<IpfsService, "pinBlob">;
}): Promise<string> {
    const orderId = commitmentOrderHash(params.payload.commitment, params.chainId);
    const blob = new Blob([serializeCommitmentPayload(params.payload)], { type: "application/json" });
    const payloadCid = await params.evidenceTransport.pinBlob(blob);
    await params.coordinationMessaging.sendCommitmentPayload({
        address: params.senderAddress,
        walletClient: params.walletClient,
        recipientAddress: params.recipientAddress,
        orderId,
        payloadCid,
    });
    return orderId;
}

export type DispatchRaceStep = "idle" | "drafting" | "racing" | "done" | "error";

/** A candidate in the running: their drafted struct + reply state (render model). */
export interface RaceCandidateView {
    address: Hex;
    itemName: string;
    payment: bigint;
    replied: boolean;
}

/** What the checkout needs to execute with the race's winner: the node's
 *  selection (the pick IS the winner), the reproduction inputs (salts +
 *  deadline), and the winner's countersignature keyed to the drafted struct. */
export interface DispatchRaceResult {
    nodeId: string;
    selection: { seller: Hex; price: string; item: { id: string; name: string } };
    race: { structHash: Hex; sellerSig: Hex };
    salt: (nodeId: string) => bigint;
    deadline: bigint;
}

interface RaceCandidateState {
    address: Hex;
    item: { id: string; name: string };
    payment: bigint;
    price: string;
    draft: CommitmentPayload;
    structHash: Hex;
    orderId: string;
}

const DEFAULT_RACE_WINDOW_MS = 30_000;

export function useDispatchRace() {
    const chainId = useChainId();
    const { data: walletClient } = useWalletClient();
    const services = useRuntimeServices();

    const [step, setStep] = useState<DispatchRaceStep>("idle");
    const [error, setError] = useState<string | null>(null);
    const [candidates, setCandidates] = useState<RaceCandidateView[]>([]);
    const [result, setResult] = useState<DispatchRaceResult | null>(null);

    // Mutable race state for the async reply callbacks — arrival order matters
    // (the selection tie-break), so replies accumulate in an array.
    const draftsRef = useRef<RaceCandidateState[]>([]);
    const repliesRef = useRef<Array<RaceReply & { candidate: Hex }>>([]);
    const unsubsRef = useRef<Array<() => void>>([]);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const ctxRef = useRef<{ nodeId: string; salts: Map<string, bigint>; deadline: bigint } | null>(null);
    const finishedRef = useRef(false);

    const cleanup = useCallback(() => {
        for (const unsub of unsubsRef.current) unsub();
        unsubsRef.current = [];
        if (timerRef.current !== null) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    }, []);

    /** Close the race: the buyer's explicit pick, or the cheapest valid
     *  countersigner. Losing countersignatures need no cancellation — they
     *  expire inert at the struct deadline. */
    const finish = useCallback((pickedAddress?: Hex) => {
        if (finishedRef.current) return;
        finishedRef.current = true;
        cleanup();
        const ctx = ctxRef.current;
        const replies = repliesRef.current;
        const winner = pickedAddress
            ? replies.find((r) => hexEqual(r.candidate, pickedAddress)) ?? null
            : selectRaceWinner(replies);
        if (!ctx || !winner || !winner.reply.sellerSig) {
            setError("No candidate countersigned within the race window — try again, or pick a seller directly.");
            setStep("error");
            return;
        }
        const state = draftsRef.current.find((d) => hexEqual(d.address, winner.draft.commitment.seller as Hex));
        if (!state) {
            setError("The winning reply does not match any drafted candidate.");
            setStep("error");
            return;
        }
        setResult({
            nodeId: ctx.nodeId,
            selection: { seller: state.address, price: state.price, item: state.item },
            race: { structHash: state.structHash, sellerSig: winner.reply.sellerSig as Hex },
            salt: (nodeId: string) => {
                const s = ctx.salts.get(nodeId);
                if (s === undefined) throw new Error(`No race salt for template node "${nodeId}" — the race fixed a salt for every node at draft time.`);
                return s;
            },
            deadline: ctx.deadline,
        });
        setStep("done");
    }, [cleanup]);

    /**
     * Run the race for ONE unbound node. `checkout` must already carry the
     * buyer's selections for every OTHER unbound node (the dry walk refuses a
     * node with no counterparty) — racing several positions is sequential
     * composition: each winner enters `subOrderSelections` before the next
     * race starts.
     */
    const start = useCallback(async (args: {
        checkout: Omit<AssemblyCheckoutParams, "salt" | "deadline" | "subOrderRace">;
        racedNodeId: string;
        windowMs?: number;
    }) => {
        const { checkout, racedNodeId } = args;
        const core = CONTRACTS.core as Hex | undefined;
        if (!core) throw new Error("Core contract address is not configured.");
        setError(null);
        setResult(null);
        finishedRef.current = false;
        repliesRef.current = [];
        try {
            setStep("drafting");
            const template = checkout.assembly.assemblyTemplate;
            const node = template.agreements.find((a) => a.id === racedNodeId);
            if (!node) throw new Error(`Template node "${racedNodeId}" not found.`);
            const specs = specSource();
            const nodeClauses = { ...node.clauses, ...(checkout.clauseFills?.[racedNodeId] ?? {}) };

            // The candidate set: the live discovered-seller catalogues that can
            // price this node — the same registry read the manual path uses,
            // resolved fresh here. The buyer's own catalogue is skipped (the
            // buyer does not race itself over the channel).
            const priced = checkout.sellerCatalogues
                .filter((cat) => !hexEqual(cat.address, checkout.buyer))
                .map((cat) => ({
                    address: cat.address as Hex,
                    pricing: resolveSubOrderPricing({
                        node: { ...node, clauses: nodeClauses },
                        seller: cat.address as Hex,
                        sellerCatalogues: checkout.sellerCatalogues,
                        tokenDecimals: checkout.tokenDecimals,
                        specs,
                        checkoutQuantity: checkout.subOrderQuantities?.[racedNodeId],
                    }),
                }))
                .filter(({ pricing }) => pricing.item !== null && !pricing.issue && pricing.payment > 0n);
            if (priced.length === 0) {
                throw new Error("No registered seller's catalogue can price this order — nothing to race.");
            }

            // Fix the reproduction inputs ONCE: a salt per template node and a
            // single deadline. Every dry walk and the final checkout use them.
            const deadline = await chainDeadline();
            const salts = new Map<string, bigint>(
                template.agreements.map((a) => [a.id, generateSalt()]),
            );
            const saltFn = (nodeId: string) => {
                const s = salts.get(nodeId);
                if (s === undefined) throw new Error(`No race salt for template node "${nodeId}".`);
                return s;
            };
            ctxRef.current = { nodeId: racedNodeId, salts, deadline };

            // One dry walk per candidate — the raced node's order IS the draft.
            const drafts: RaceCandidateState[] = [];
            for (const { address: candidate, pricing } of priced) {
                const item = { id: pricing.item!.id, name: pricing.item!.name };
                const price = formatToken(pricing.payment, checkout.tokenDecimals);
                const orders = await planAssemblyOrders({
                    ...checkout,
                    subOrderSelections: {
                        ...checkout.subOrderSelections,
                        [racedNodeId]: { seller: candidate, price, item },
                    },
                    salt: saltFn,
                    deadline,
                }, { chainId });
                const order = orders.find((o) => o.nodeId === racedNodeId);
                if (!order) throw new Error(`The walk produced no order for node "${racedNodeId}".`);
                drafts.push({
                    address: candidate,
                    item,
                    payment: order.payment,
                    price,
                    draft: { commitment: order.commitment, agreement: order.agreement },
                    structHash: hashCommitmentStruct(order.commitment) as Hex,
                    orderId: commitmentOrderHash(order.commitment, chainId),
                });
            }
            draftsRef.current = drafts;
            setCandidates(drafts.map((d) => ({ address: d.address, itemName: d.item.name, payment: d.payment, replied: false })));

            // Relay every draft and listen for its countersigned return on the
            // same order id. The buyer's own relay echoes back on the mock
            // bus — a payload without a seller signature is ignored, so the
            // echo is inert.
            setStep("racing");
            for (const d of drafts) {
                const unsub = await services.coordinationMessaging.subscribeCommitmentPayload({
                    address: checkout.buyer,
                    walletClient: walletClient ?? null,
                    orderId: d.orderId,
                    callback: (payloadCid: string) => {
                        void (async () => {
                            if (finishedRef.current) return;
                            try {
                                const json = await fetchCommitmentPayloadJsonByCid(services.evidenceTransport, payloadCid);
                                const reply = deserializeCommitmentPayload(json);
                                if (!reply.sellerSig) return; // the draft's own echo
                                const check = await verifyRaceReply(reply, d.draft, { chainId, core });
                                if (!check.ok) return;
                                if (repliesRef.current.some((r) => hexEqual(r.candidate, d.address))) return;
                                repliesRef.current.push({ candidate: d.address, draft: d.draft, reply });
                                setCandidates((prev) => prev.map((c) =>
                                    hexEqual(c.address, d.address) ? { ...c, replied: true } : c,
                                ));
                                if (repliesRef.current.length === draftsRef.current.length) finish();
                            } catch {
                                // Unfetchable or malformed reply — ignore; the
                                // window closes the race regardless.
                            }
                        })();
                    },
                });
                unsubsRef.current.push(unsub);
                await relayRacePayload({
                    payload: d.draft,
                    recipientAddress: d.address,
                    senderAddress: checkout.buyer,
                    walletClient: walletClient ?? null,
                    chainId,
                    coordinationMessaging: services.coordinationMessaging,
                    evidenceTransport: services.evidenceTransport,
                });
            }
            timerRef.current = setTimeout(() => finish(), args.windowMs ?? DEFAULT_RACE_WINDOW_MS);
        } catch (e: unknown) {
            cleanup();
            finishedRef.current = true;
            setError(extractErrorMessage(e, "The race could not start"));
            setStep("error");
        }
    }, [chainId, walletClient, services, finish, cleanup]);

    /** Buyer override: close the race now on the best reply so far. */
    const selectNow = useCallback(() => finish(), [finish]);
    /** Buyer override: choose a specific countersigner instead of the cheapest. */
    const pick = useCallback((candidate: Hex) => finish(candidate), [finish]);

    const reset = useCallback(() => {
        cleanup();
        finishedRef.current = false;
        draftsRef.current = [];
        repliesRef.current = [];
        ctxRef.current = null;
        setStep("idle");
        setError(null);
        setCandidates([]);
        setResult(null);
    }, [cleanup]);

    const repliedCount = candidates.filter((c) => c.replied).length;
    return { step, error, candidates, repliedCount, result, start, selectNow, pick, reset };
}
