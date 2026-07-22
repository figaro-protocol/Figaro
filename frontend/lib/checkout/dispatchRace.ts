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
    derivePricedFields,
    hashCommitmentStruct,
    resolveSubOrderPricing,
} from "@figaro/sdk";
import {
    deserializeCommitmentPayload,
    serializeCommitmentPayload,
    selectRaceWinner,
    verifyQuoteReply,
    verifyRaceReply,
    readCappedResponseText,
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
 *
 * The channel key is the CONVERSATION's order id — by default the payload's
 * own commitment hash, but a QUOTE must answer under the REQUEST's id
 * (`threadOrderId`): a counter-draft is a different struct by construction
 * (the candidate re-priced it), and the buyer listens on the id of the draft
 * they sent, not on a struct they cannot know in advance.
 */
export async function relayRacePayload(params: {
    payload: CommitmentPayload;
    recipientAddress: string;
    senderAddress: string;
    walletClient?: WalletMessageSigner | null;
    chainId: number;
    coordinationMessaging: CommitmentPayloadRelay;
    evidenceTransport: Pick<IpfsService, "pinBlob">;
    /** The conversation's order id, when the payload's own struct is not the
     *  thread (a quote answering a request). Defaults to the payload's. */
    threadOrderId?: string;
}): Promise<string> {
    const orderId = params.threadOrderId ?? commitmentOrderHash(params.payload.commitment, params.chainId);
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
 *  deadline), and the winner's countersignature keyed to the drafted struct.
 *  `endpoint` is present when the winner is an AGENT candidate (their profile
 *  declares `services.rest`) — the fully-signed payload is ALSO delivered
 *  there, so a wallet with no browser open still receives its commit-ready
 *  order and broadcasts it itself. */
export interface DispatchRaceResult {
    nodeId: string;
    selection: { seller: Hex; price: string; item: { id: string; name: string } };
    race: { structHash: Hex; sellerSig: Hex };
    salt: (nodeId: string) => bigint;
    deadline: bigint;
    endpoint?: string;
}

/**
 * Deliver a payload to an agent candidate's declared REST endpoint — the SAME
 * wire `HttpChannel` speaks (POST the serialized envelope; 200 = countersigned
 * reply, 204 = declined, anything else = refusal). This is what makes MIXED
 * pairings work: a human buyer's browser and an agent's service exchange the
 * same artifacts, only the transport differs per candidate.
 */
export async function postToAgentEndpoint(
    endpoint: string,
    payload: CommitmentPayload,
): Promise<CommitmentPayload | null> {
    const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: serializeCommitmentPayload(payload),
    });
    if (res.status === 204) return null;
    if (!res.ok) throw new Error(`Agent endpoint ${endpoint} refused the payload — HTTP ${res.status}`);
    // Size-capped, streamed read (finding 6): the endpoint is the candidate's
    // own advertised URL, so an unbounded body would OOM the buyer's tab before
    // reply-verification ever runs.
    const text = await readCappedResponseText(res);
    return text ? deserializeCommitmentPayload(text) : null;
}

interface RaceCandidateState {
    address: Hex;
    item: { id: string; name: string };
    payment: bigint;
    price: string;
    draft: CommitmentPayload;
    structHash: Hex;
    orderId: string;
    /** The candidate's declared agent REST endpoint — present makes them an
     *  AGENT candidate: drafts POST there (request/reply in one round-trip)
     *  instead of relaying over the wallet coordination channel. */
    endpoint?: string;
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
    const ctxRef = useRef<{ nodeId: string; salts: Map<string, bigint>; deadline: bigint; decimals: number } | null>(null);
    const finishedRef = useRef(false);
    // The quotes leg: same choreography, the CANDIDATE authors the price.
    // Set for the run by start(); rendered so the panel can label rows.
    const [quoting, setQuoting] = useState(false);

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
        // The committed figures come from the winner's REPLY: identical to the
        // draft on the race leg (exact-match verification), the candidate's
        // quote on the quotes leg (reconstruction-verified). The final walk
        // rebuilds at this price and must hash to this struct.
        setResult({
            nodeId: ctx.nodeId,
            selection: {
                seller: state.address,
                price: formatToken(winner.reply.commitment.payment, ctx.decimals),
                item: state.item,
            },
            race: { structHash: hashCommitmentStruct(winner.reply.commitment) as Hex, sellerSig: winner.reply.sellerSig as Hex },
            salt: (nodeId: string) => {
                const s = ctx.salts.get(nodeId);
                if (s === undefined) throw new Error(`No race salt for template node "${nodeId}" — the race fixed a salt for every node at draft time.`);
                return s;
            },
            deadline: ctx.deadline,
            endpoint: state.endpoint,
        });
        setStep("done");
    }, [cleanup]);

    /**
     * Run the race for ONE unbound node. `checkout` must already carry the
     * buyer's selections for every OTHER unbound node (the dry walk refuses a
     * node with no counterparty) — racing several positions is sequential
     * composition: each winner enters `subOrderSelections` before the next
     * race starts.
     *
     * All knobs are checkout-time buyer policy, never stored: `windowMs` (how
     * long to wait), `maxCandidates` (race only the k best-priced), and
     * `quote` — the RFQ leg: drafts go out at the buyer's CEILING with the
     * priced fields derived from the built agreement (spec-routed, no clause
     * named), candidates author the price, and replies verify by
     * reconstruction instead of exact match.
     */
    const start = useCallback(async (args: {
        checkout: Omit<AssemblyCheckoutParams, "salt" | "deadline" | "subOrderRace">;
        racedNodeId: string;
        windowMs?: number;
        maxCandidates?: number;
        quote?: { ceiling: bigint };
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
            // buyer does not race itself over the channel). Sorted best-priced
            // first so the buyer's k (a policy knob, never stored) means "the
            // k cheapest posted" — on the quotes leg the posted figure is only
            // the eligibility/ranking signal; the quote sets the price.
            const priced = checkout.sellerCatalogues
                .filter((cat) => !hexEqual(cat.address, checkout.buyer))
                .map((cat) => ({
                    address: cat.address as Hex,
                    endpoint: cat.agentServices?.rest,
                    pricing: resolveSubOrderPricing({
                        node: { ...node, clauses: nodeClauses },
                        seller: cat.address as Hex,
                        sellerCatalogues: checkout.sellerCatalogues,
                        tokenDecimals: checkout.tokenDecimals,
                        specs,
                        checkoutQuantity: checkout.subOrderQuantities?.[racedNodeId],
                    }),
                }))
                .filter(({ pricing }) => pricing.item !== null && !pricing.issue && pricing.payment > 0n)
                .sort((a, b) => (a.pricing.payment < b.pricing.payment ? -1 : a.pricing.payment > b.pricing.payment ? 1 : 0))
                .slice(0, args.maxCandidates && args.maxCandidates > 0 ? args.maxCandidates : undefined);
            if (priced.length === 0) {
                throw new Error("No registered seller's catalogue can price this order — nothing to race.");
            }
            setQuoting(!!args.quote);

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
            ctxRef.current = { nodeId: racedNodeId, salts, deadline, decimals: checkout.tokenDecimals };

            // One dry walk per candidate — the raced node's order IS the draft.
            // On the quotes leg every draft prices at the buyer's CEILING; the
            // priced fields are derived from the built agreement (the same
            // spec-routed lookup the fills use) and attached as the quote
            // request's terms.
            const drafts: RaceCandidateState[] = [];
            for (const { address: candidate, endpoint, pricing } of priced) {
                const item = { id: pricing.item!.id, name: pricing.item!.name };
                const price = formatToken(args.quote?.ceiling ?? pricing.payment, checkout.tokenDecimals);
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
                let payload: CommitmentPayload = { commitment: order.commitment, agreement: order.agreement };
                if (args.quote) {
                    const pricedFields = derivePricedFields(order.agreement.sections, specs);
                    if (pricedFields.length === 0) {
                        throw new Error("This order composes no commercial section to quote against.");
                    }
                    payload = { ...payload, quoteRequest: { pricedFields } };
                }
                drafts.push({
                    address: candidate,
                    item,
                    payment: order.payment,
                    price,
                    draft: payload,
                    structHash: hashCommitmentStruct(order.commitment) as Hex,
                    orderId: commitmentOrderHash(order.commitment, chainId),
                    endpoint,
                });
            }
            draftsRef.current = drafts;
            setCandidates(drafts.map((d) => ({ address: d.address, itemName: d.item.name, payment: d.payment, replied: false })));

            // Verify and record a countersigned reply — ONE path for both
            // transports. Race leg: exact-match against the sent draft.
            // Quotes leg: reconstruction — the same substitution applied to
            // OUR draft must reproduce the reply hash-for-hash.
            const recordReply = async (d: RaceCandidateState, reply: CommitmentPayload) => {
                if (finishedRef.current) return;
                if (!reply.sellerSig) return;
                const check = args.quote
                    ? await verifyQuoteReply(reply, d.draft, { chainId, core })
                    : await verifyRaceReply(reply, d.draft, { chainId, core });
                if (!check.ok) return;
                if (repliesRef.current.some((r) => hexEqual(r.candidate, d.address))) return;
                repliesRef.current.push({ candidate: d.address, draft: d.draft, reply });
                setCandidates((prev) => prev.map((c) =>
                    hexEqual(c.address, d.address)
                        ? { ...c, replied: true, payment: reply.commitment.payment }
                        : c,
                ));
                if (repliesRef.current.length === draftsRef.current.length) finish();
            };

            // Send every draft — per-candidate transport, one choreography:
            //   - AGENT candidate (declared `services.rest`): POST the draft
            //     to their endpoint; the HTTP response IS the reply (or a
            //     decline). Mixed pairings are exactly this branch — the
            //     artifacts never change, only the wire.
            //   - wallet candidate: relay over the coordination channel and
            //     listen for the countersigned return on the same order id.
            //     The buyer's own relay echoes back on the mock bus — a
            //     payload without a seller signature is ignored.
            setStep("racing");
            for (const d of drafts) {
                if (d.endpoint) {
                    const endpoint = d.endpoint;
                    void (async () => {
                        try {
                            const reply = await postToAgentEndpoint(endpoint, d.draft);
                            if (reply) await recordReply(d, reply);
                        } catch {
                            // Unreachable or refusing endpoint — the candidate
                            // simply never replies; the window closes the race.
                        }
                    })();
                    continue;
                }
                const unsub = await services.coordinationMessaging.subscribeCommitmentPayload({
                    address: checkout.buyer,
                    walletClient: walletClient ?? null,
                    orderId: d.orderId,
                    callback: (payloadCid: string) => {
                        void (async () => {
                            try {
                                const json = await fetchCommitmentPayloadJsonByCid(services.evidenceTransport, payloadCid);
                                await recordReply(d, deserializeCommitmentPayload(json));
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
        setQuoting(false);
    }, [cleanup]);

    const repliedCount = candidates.filter((c) => c.replied).length;
    return { step, error, candidates, repliedCount, result, quoting, start, selectNow, pick, reset };
}
